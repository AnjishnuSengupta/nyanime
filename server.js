/**
 * Express server for Render deployment
 * Uses Consumet provider adapters for anime metadata/sources
 * Serves static files and proxies stream requests to bypass CORS
 */

import express from 'express';
import admin from 'firebase-admin';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'node:dns';
import https from 'https';
import http from 'http';
import os from 'os';
import compression from 'compression';
import helmet from 'helmet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// DNS & IPv4/IPv6 — Ported from ny-cli for reliable CDN connectivity
// Uses public DNS (Cloudflare + Google), detects IPv6, implements Happy Eyeballs
// ═══════════════════════════════════════════════════════════════════════════

const DNS_V4 = ['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4'];
const DNS_V6 = ['2606:4700:4700::1111', '2001:4860:4860::8888', '2606:4700:4700::1001', '2001:4860:4860::8844'];

// Detect system IPv6 connectivity — check for routable (non-link-local) IPv6 address
function systemHasIPv6() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const addr of interfaces[name]) {
        if (
          addr.family === 'IPv6' &&
          !addr.internal &&
          !addr.address.startsWith('fe80') &&
          !addr.address.startsWith('::1')
        ) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

const HAS_IPV6 = systemHasIPv6();
console.log(`[dns] System IPv6: ${HAS_IPV6 ? 'available' : 'not available'}`);

// Configure DNS servers based on system network capabilities
try {
  const servers = HAS_IPV6
    ? [...DNS_V6, ...DNS_V4]
    : [...DNS_V4, ...DNS_V6];
  dns.setServers(servers);
  console.log(`[dns] Using DNS servers: ${servers.slice(0, 3).join(', ')}...`);
} catch {
  console.warn('[dns] Failed to set custom DNS servers, using OS defaults');
}

// DNS resolution with timeout — prevents hanging on unresponsive DNS
function resolveWithTimeout(resolver, hostname, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), timeoutMs);
    resolver(hostname, (err, addrs) => {
      clearTimeout(timer);
      resolve(err || !addrs ? [] : addrs);
    });
  });
}

// Custom DNS lookup (Happy Eyeballs compatible)
// Returns addresses from BOTH families so Node can race connections
function customLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }

  const wantAll = !!options.all;

  if (wantAll) {
    // Happy Eyeballs path: resolve both families in parallel
    Promise.all([
      HAS_IPV6 ? resolveWithTimeout(dns.resolve6.bind(dns), hostname) : Promise.resolve([]),
      resolveWithTimeout(dns.resolve4.bind(dns), hostname),
    ]).then(([v6, v4]) => {
      const results = [];
      for (const a of v6) results.push({ address: a, family: 6 });
      for (const a of v4) results.push({ address: a, family: 4 });

      if (results.length > 0) {
        return callback(null, results);
      }
      // All custom DNS failed — fall back to OS resolver
      dns.lookup(hostname, { all: true }, callback);
    }).catch(() => {
      dns.lookup(hostname, { all: true }, callback);
    });
  } else {
    // Single-address path — prefer IPv4 (more reliable for CDN domains)
    const tryIPv4 = () => {
      resolveWithTimeout(dns.resolve4.bind(dns), hostname).then((v4) => {
        if (v4.length > 0) return callback(null, v4[0], 4);
        dns.lookup(hostname, options, callback);
      }).catch(() => dns.lookup(hostname, options, callback));
    };

    if (HAS_IPV6) {
      resolveWithTimeout(dns.resolve6.bind(dns), hostname).then((v6) => {
        if (v6.length > 0) return callback(null, v6[0], 6);
        tryIPv4();
      }).catch(() => tryIPv4());
    } else {
      tryIPv4();
    }
  }
}

// Agent options: custom DNS lookup + Happy Eyeballs (autoSelectFamily)
const agentOptions = {
  lookup: customLookup,
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 20,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 2500,
};

// Replace global agents BEFORE importing aniwatch,
// so the library picks up our patched DNS resolution.
http.globalAgent = new http.Agent(agentOptions);
https.globalAgent = new https.Agent(agentOptions);

// Named agents for the stream proxy (same DNS config)
const httpsAgent = new https.Agent(agentOptions);
const httpAgent = new http.Agent(agentOptions);

// Permissive HTTPS agent for external APIs (handles SSL certificate issues)
// Only used for metadata APIs (Jikan, Consumet), not security-critical
const permissiveHttpsAgent = new https.Agent({
  ...agentOptions,
  rejectUnauthorized: false,
});

// Dynamic import: optional legacy scraper package.
// Keep startup resilient when aniwatch is intentionally removed.
let HiAnime = null;
// Removed legacy HiAnime import


const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '::';
// Removed hianime scraper initialization


// Transient network error codes that should trigger retries
const TRANSIENT_CODES = new Set([
  'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'EAI_AGAIN', 'EPIPE', 'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ENOTFOUND',
]);

// Retry helper: retries an async fn on transient network errors (from ny-cli)
async function withRetry(fn, { retries = 2, delay = 800, label = '' } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient = TRANSIENT_CODES.has(err.code) ||
        (err.cause && TRANSIENT_CODES.has(err.cause.code)) ||
        /timeout|ENETUNREACH|ECONNR|socket/i.test(err.message);
      if (i < retries) {
        const backoff = isTransient ? delay * (i + 1) : delay;
        if (label) console.log(`[retry] ${label} attempt ${i+1} failed (${err.code || err.message?.substring(0,40)}), retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// Trust proxy headers (required for Render/Heroku/etc where SSL terminates at load balancer)
app.set('trust proxy', 1);

// MegaCloud ecosystem domains (including AnimeKAI CDN domains)
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike', 'sunburst', 'clearskyline',  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
  'crimsonstorm', 'netmagcdn',  // Additional MegaCloud CDN domains observed in the wild
  'hub26link', 'hub27link', 'hub28link', 'hub29link', 'hub30link',  // AnimeKAI CDN domains
  'net22lab', 'net23lab', 'net24lab', 'net25lab',  // MegaUp CDN streaming domains
  'gqv', 'rrr',  // MegaUp subdomain prefixes
];

function getRefererForHost(hostname, customReferer) {
  if (customReferer) return customReferer;
  
  const host = hostname.toLowerCase();
  
  if (MEGACLOUD_DOMAINS.some(domain => host.includes(domain))) {
    return 'https://megacloud.blog/';
  }
  
  if (host.includes('vidcloud') || host.includes('vidstreaming')) {
    return 'https://vidcloud.blog/';
  }
  
  if (host.includes('hianime') || host.includes('aniwatch')) {
    return 'https://hianime.to/';
  }
  
  if (host.includes('gogoanime') || host.includes('gogocdn')) {
    return 'https://gogoanime.cl/';
  }
  
  return 'https://megacloud.blog/';
}

/**
 * HTTP(S) request helper — does NOT auto-add Sec-Fetch-* headers (unlike Node's fetch/undici).
 * Returns { ok, status, statusText, contentType, getHeader(name), stream }.
 * Follows redirects up to maxRedirects times.
 */
function proxyRequest(urlStr, headers, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    
    const opts = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'GET',
      headers: headers,
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
    };
    
    const req = mod.request(opts, (incomingRes) => {
      if (incomingRes.statusCode >= 300 && incomingRes.statusCode < 400 && incomingRes.headers.location && maxRedirects > 0) {
        incomingRes.resume(); // drain redirect body
        const redirectUrl = new URL(incomingRes.headers.location, urlStr).toString();
        return proxyRequest(redirectUrl, headers, maxRedirects - 1).then(resolve, reject);
      }
      
      resolve({
        ok: incomingRes.statusCode >= 200 && incomingRes.statusCode < 300,
        status: incomingRes.statusCode,
        statusText: incomingRes.statusMessage || '',
        contentType: (incomingRes.headers['content-type'] || ''),
        getHeader: (name) => incomingRes.headers[name.toLowerCase()] || null,
        stream: incomingRes, // Node.js Readable
      });
    });
    
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(new Error('Request timeout')); });
    req.end();
  });
}

/** Read Node.js Readable stream to UTF-8 string */
async function readStream(stream) {
  const chunks = [];
  try {
    for await (const chunk of stream) { chunks.push(chunk); }
  } catch (err) {
    console.warn('[readStream] Stream read error:', err.message);
    // Return what we have so far (partial data is better than crash)
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Security transport policy for production deployments behind a proxy/CDN.
app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return next();

  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedProto && forwardedProto.toLowerCase() === 'http') {
    const host = req.get('host');
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }

  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});

// Parse JSON bodies
app.use(express.json());
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Disable CSP to allow streaming from external CDNs
}));
app.use(compression());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ANIWATCH API — Direct scraping via npm package (no external API needed)
// Supports both new action-based (?action=search&q=...) and legacy path-based (?path=/api/v2/...)
// Falls back to old hosted API on scraper errors
// ============================================================================


app.get('/aniwatch', async (req, res) => {
  try {
    const action = req.query.action;
    if (!action) return res.status(400).json({ error: 'Missing action param' });


    const ID_SEPARATOR = '::';

    // ═══════════════════════════════════════════════════════════════════════════
    // AnimeKAI Provider Configuration
    // Use hosted backend API for production, direct scraping for local dev
    // ═══════════════════════════════════════════════════════════════════════════
    const ANIMEKAI_PROVIDER = 'animekai';
    const ANIMEKAI_API_URL = process.env.ANIMEKAI_API_URL || '';
    const ANIMEKAI_URL = 'https://anikai.to';
    const ANIMEKAI_SEARCH_URL = 'https://anikai.to/ajax/anime/search';
    const ANIMEKAI_EPISODES_URL = 'https://anikai.to/ajax/episodes/list';
    const ANIMEKAI_SERVERS_URL = 'https://anikai.to/ajax/links/list';
    const ANIMEKAI_LINKS_VIEW_URL = 'https://anikai.to/ajax/links/view';
    const ENCDEC_URL = 'https://enc-dec.app/api/enc-kai';
    const ENCDEC_DEC_KAI = 'https://enc-dec.app/api/dec-kai';
    const ENCDEC_DEC_MEGA = 'https://enc-dec.app/api/dec-mega';

    const ANIMEKAI_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    const ANIMEKAI_AJAX_HEADERS = {
      ...ANIMEKAI_HEADERS,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    };

    // Helper: Call AnimeKAI backend API if available
    async function callAnimeKaiApi(endpoint, params = {}) {
      if (!ANIMEKAI_API_URL) return null;
      
      try {
        const url = new URL(endpoint, ANIMEKAI_API_URL);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
          }
        });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`AnimeKAI API returned ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && data.data) {
          return data.data;
        }
        return null;
      } catch (err) {
        console.error('[AnimeKAI API] Call failed:', err.message);
        return null;
      }
    }

    // Helper: Sanitize media URL
    function sanitizeAnimeKaiMediaUrl(value) {
      if (typeof value !== 'string') return '';
      let url = value.trim().replace(/^['"]|['"]$/g, '');
      if (!url) return '';
      const replaceIdx = url.indexOf('.replace(');
      if (replaceIdx > 0) url = url.slice(0, replaceIdx);
      try {
        return new URL(url).toString();
      } catch {
        return '';
      }
    }

    // Helper: Check if provider is known
    function isKnownAnimeKaiProvider(value) {
      return value === ANIMEKAI_PROVIDER;
    }

    // AnimeKAI token encoding via enc-dec.app
    async function encodeAnimeKaiToken(text) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(`${ENCDEC_URL}?text=${encodeURIComponent(text)}`, { 
            headers: ANIMEKAI_HEADERS,
            signal: controller.signal 
          });
          clearTimeout(timeoutId);
          const data = await response.json();
          if (data.status === 200 && data.result) {
            return data.result;
          }
        } catch (err) {
          console.error(`[AnimeKAI] Token encoding failed (attempt ${attempt}/${maxRetries}):`, err.message);
          if (attempt === maxRetries) return null;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      return null;
    }

    // Decrypt AnimeKAI embedded URL response (POST method with JSON body)
    async function decodeAnimeKaiResponse(encrypted) {
      try {
        const response = await fetch(ENCDEC_DEC_KAI, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...ANIMEKAI_HEADERS
          },
          body: JSON.stringify({ text: encrypted })
        });
        const data = await response.json();
        if (data.status !== 200) return null;
        if (typeof data.result === 'object') return data.result;
        return JSON.parse(data.result);
      } catch (err) {
        console.error('[AnimeKAI] Decryption failed:', err.message);
        return null;
      }
    }

    // Decrypt mega/megacloud media response using enc-dec.app
    async function decodeMegaResponse(encrypted) {
      try {
        const response = await fetch(ENCDEC_DEC_MEGA, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...ANIMEKAI_HEADERS
          },
          body: JSON.stringify({
            text: encrypted,
            agent: ANIMEKAI_HEADERS['User-Agent']
          })
        });
        const data = await response.json();
        if (data.status !== 200) return null;
        if (typeof data.result === 'object') return data.result;
        return JSON.parse(data.result);
      } catch (err) {
        console.error('[AnimeKAI] Mega decryption failed:', err.message);
        return null;
      }
    }

    // Parse HTML to extract info spans (sub/dub counts, type)
    function parseAnimeKaiInfoSpans(html) {
      if (!html) return { sub: '', dub: '', type: '' };
      const subMatch = html.match(/<span class="sub">.*?<\/svg>(\d+)<\/span>/);
      const dubMatch = html.match(/<span class="dub">.*?<\/svg>(\d+)<\/span>/);
      const typeMatch = html.match(/<b>(TV|MOVIE|OVA|ONA|SPECIAL|MUSIC)<\/b>/i);
      return {
        sub: subMatch ? subMatch[1] : '',
        dub: dubMatch ? dubMatch[1] : '',
        type: typeMatch ? typeMatch[1].toUpperCase() : 'TV',
      };
    }

    // Helper: find best matching anime from AnimeKAI search results
    function findBestAnimeKaiMatch(targetTitle, results) {
      if (!results || results.length === 0) return null;
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const tokenize = (str) => normalize(str).split(/\s+/).filter(t => t.length >= 2);
      const target = normalize(targetTitle);
      const targetTokens = tokenize(targetTitle);
      let bestMatch = null;
      let maxScore = 0;
      for (const res of results) {
        const name = normalize(res.name);
        const nameTokens = tokenize(res.name);
        let score = 0;
        // Exact match
        if (name === target) score = 100;
        // Contains full target
        else if (name.includes(target)) score = 50;
        else if (target.includes(name)) score = 40;
        // Token-based matching: how many target words appear in the result name
        if (targetTokens.length > 0 && score < 100) {
          const overlap = targetTokens.filter(t => nameTokens.includes(t)).length;
          const ratio = overlap / targetTokens.length;
          const tokenScore = Math.round(ratio * 80);
          // Bonus for all tokens matching
          if (ratio === 1) score = Math.max(score, tokenScore + 20);
          else if (ratio >= 0.6) score = Math.max(score, tokenScore);
        }
        if (score > maxScore) {
          maxScore = score;
          bestMatch = res;
        }
      }
      // Return best match only if we have reasonable confidence
      return maxScore >= 20 ? bestMatch : (results.length > 0 ? results[0] : null);
    }

    // AnimeKAI search - uses backend API if available, otherwise direct scraping

    async function animeKaiSearch(query) {
      console.log(`[AnimeKAI] Searching for: "${query}"`);
      if (ANIMEKAI_API_URL) {
        try {
          console.log(`[AnimeKAI] Calling API: ${ANIMEKAI_API_URL}/aniwatch/search?q=${encodeURIComponent(query)}`);
          const apiResult = await callAnimeKaiApi('/aniwatch/search', { q: query, page: 1 });
          if (apiResult?.animes && apiResult.animes.length > 0) {
            console.log(`[AnimeKAI] API returned ${apiResult.animes.length} results`);
            return apiResult.animes;
          }
          console.warn(`[AnimeKAI] API returned no results for "${query}"`);
        } catch (err) {
          console.error(`[AnimeKAI] API search failed for "${query}":`, err.message);
        }
      }
      
      // Fallback to direct scraping
      try {
        console.log(`[AnimeKAI] Falling back to direct scraping for "${query}"`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`${ANIMEKAI_SEARCH_URL}?keyword=${encodeURIComponent(query)}`, {
          headers: ANIMEKAI_AJAX_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (data.status !== 'ok' || !data.result?.html) {
          console.warn(`[AnimeKAI] Scraping returned no results for "${query}"`);
          return [];
        }

        const html = data.result.html;
        const results = [];
        const itemRegex = /<a class="aitem" href="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)"[\s\S]*?<h6 class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h6>[\s\S]*?<div class="info">([\s\S]*?)<\/div>/g;
        
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
          const [, href, poster, jpTitle, title, infoHtml] = match;
          const slug = href.replace('/watch/', '');
          const info = parseAnimeKaiInfoSpans(infoHtml);
          
          results.push({
            id: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}`,
            name: title.trim(),
            jname: jpTitle,
            poster: poster,
            type: info.type,
            episodes: {
              sub: info.sub ? parseInt(info.sub) : 0,
              dub: info.dub ? parseInt(info.dub) : 0,
            },
          });
        }
        console.log(`[AnimeKAI] Scraping found ${results.length} results for "${query}"`);
        return results;
      } catch (err) {
        console.error(`[AnimeKAI] Scraping search failed for "${query}":`, err.message);
        return [];
      }

    }
    
    // AnimeKAI get anime info from watch page - uses backend API if available

    // AnimeKAI get anime info from watch page - uses backend API if available
    async function animeKaiInfo(slug) {
      // Try backend API first
      if (ANIMEKAI_API_URL) {
        const apiResult = await callAnimeKaiApi('/aniwatch/info', { id: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}` });
        if (apiResult && apiResult._aniId) {
          return {
            aniId: apiResult._aniId || apiResult.aniId,
            title: apiResult.name,
            jname: apiResult.jname,
            description: apiResult.description,
            poster: apiResult.poster,
            sub: apiResult.stats?.episodes?.sub || 0,
            dub: apiResult.stats?.episodes?.dub || 0,
            type: apiResult.stats?.type,
            status: apiResult.stats?.status,
            genres: apiResult.genres || [],
          };
        }
      }
      
      // Fallback to direct scraping
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const url = `${ANIMEKAI_URL}/watch/${slug}`;
        const response = await fetch(url, { headers: ANIMEKAI_HEADERS, signal: controller.signal });
        clearTimeout(timeoutId);
        
        const html = await response.text();

        // Extract ani_id from syncData script
        const syncMatch = html.match(/<script id="syncData"[^>]*>([^<]+)<\/script>/);
        let aniId = '';
        if (syncMatch) {
          try {
            const syncData = JSON.parse(syncMatch[1]);
            aniId = syncData.anime_id || '';
          } catch {}
        }

        // Extract title
        const titleMatch = html.match(/<h1[^>]*class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h1>/);
        const title = titleMatch ? titleMatch[2].trim() : '';
        const jname = titleMatch ? titleMatch[1] : '';

        // Extract description
        const descMatch = html.match(/<div class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract poster
        const posterMatch = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/);
        const poster = posterMatch ? posterMatch[1] : '';

        // Extract info spans
        const infoMatch = html.match(/<div class="info">([\s\S]*?)<\/div>/);
        const info = parseAnimeKaiInfoSpans(infoMatch ? infoMatch[1] : '');

        // Extract genres
        const genres = [];
        const genreSection = html.match(/Genres?:\s*<span[^>]*>([\s\S]*?)<\/span>/i);
        if (genreSection) {
          const genreLinks = genreSection[1].match(/<a[^>]*>([^<]+)<\/a>/g) || [];
          genreLinks.forEach(link => {
            const name = link.match(/>([^<]+)</);
            if (name) genres.push(name[1].trim());
          });
        }

        // Extract status
        const statusMatch = html.match(/Status:\s*<span[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
        const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

        return {
          aniId,
          title,
          jname,
          description,
          poster,
          sub: info.sub ? parseInt(info.sub) : 0,
          dub: info.dub ? parseInt(info.dub) : 0,
          type: info.type,
          status,
          genres,
        };
      } catch (err) {
        console.error('[AnimeKAI info error]:', err.message);
        return { aniId: '', title: '', jname: '', description: '', poster: '', sub: 0, dub: 0, type: 'TV', status: 'Unknown', genres: [] };
      }
    }

    // AnimeKAI get episodes list - uses backend API if available
    async function animeKaiEpisodes(aniId, slug = '') {
      // Try backend API first
      if (ANIMEKAI_API_URL) {
        try {
          const apiResult = await callAnimeKaiApi('/aniwatch/episodes', { id: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug || aniId}` });
          if (apiResult?.episodes) {
            return apiResult.episodes.map(ep => ({
              number: ep.number,
              token: ep.episodeId?.split(ID_SEPARATOR)[2] || '',
              hasSub: true,
              hasDub: ep.episodeId?.includes('dub') || false,
            }));
          }
        } catch (err) {
          console.error('[AnimeKAI episodes API error]:', err.message);
        }
      }
      
      // Fallback to direct scraping
      try {
        const encoded = await encodeAnimeKaiToken(aniId);
        if (!encoded) return [];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`${ANIMEKAI_EPISODES_URL}?ani_id=${aniId}&_=${encoded}`, {
          headers: ANIMEKAI_AJAX_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (!data.result) return [];

        const html = data.result;
        const episodes = [];
      
        const aTagRegex = /<a\s+[^>]*num="[^"]*"[^>]*>/g;
        let tagMatch;
        while ((tagMatch = aTagRegex.exec(html)) !== null) {
          const tag = tagMatch[0];
          const numMatch = tag.match(/num="(\d+)"/);
          const slugMatch = tag.match(/slug="([^"]*)"/);
          const langsMatch = tag.match(/langs="(\d+)"/);
          const tokenMatch = tag.match(/token="([^"]*)"/);
          
          if (numMatch && tokenMatch) {
            const langsNum = langsMatch ? parseInt(langsMatch[1]) : 3;
            episodes.push({
              number: parseInt(numMatch[1]),
              slug: slugMatch ? slugMatch[1] : '',
              token: tokenMatch[1],
              hasSub: Boolean(langsNum & 1),
              hasDub: Boolean(langsNum & 2),
            });
          }
        }
        return episodes;
      } catch (err) {
        console.error('[AnimeKAI episodes scraping error]', err.message);
        return [];
      }
    }

    // AnimeKAI get servers for an episode - uses backend API if available
    async function animeKaiServers(epToken, slug = '') {
      // Try backend API first
      if (ANIMEKAI_API_URL) {
        try {
          // Build proper episodeId from slug and token
          const episodeId = slug 
            ? `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${epToken}`
            : `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${epToken}`;
          
          const apiResult = await callAnimeKaiApi('/aniwatch/servers', { episodeId });
          if (apiResult) {
            return {
              sub: apiResult.sub || [],
              dub: apiResult.dub || [],
              softsub: apiResult.raw || [],
            };
          }
        } catch (err) {
          console.error('[AnimeKAI servers API error]:', err.message);
        }
      }
      
      // Fallback to direct scraping
      try {
        const encoded = await encodeAnimeKaiToken(epToken);
        if (!encoded) return { sub: [], dub: [], softsub: [] };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`${ANIMEKAI_SERVERS_URL}?token=${epToken}&_=${encoded}`, {
          headers: ANIMEKAI_AJAX_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (!data.result) return { sub: [], dub: [], softsub: [] };

        const html = data.result;
        const servers = { sub: [], dub: [], softsub: [] };

        const parseServers = (dataId) => {
          const list = [];
          const sectionRegex = new RegExp(
            'class="server-items[^"]*"[^>]*data-id="' + dataId + '"[^>]*>([\\s\\S]*?)(?=<div[^>]*class="server-items|$)'
          );
          const match = html.match(sectionRegex);
          if (match) {
            const serverRegex = /data-lid="([^"]*)"[^>]*>([^<]+)/g;
            let m;
            while ((m = serverRegex.exec(match[1])) !== null) {
              list.push({ linkId: m[1], name: m[2].trim() });
            }
          }
          return list;
        };

        servers.sub = parseServers('sub');
        servers.softsub = parseServers('softsub');
        servers.dub = parseServers('dub');

        return servers;
      } catch (err) {
        console.error('[AnimeKAI servers scraping error]', err.message);
        return { sub: [], dub: [], softsub: [] };
      }
    }

    // AnimeKAI resolve streaming source - uses backend API if available
    async function animeKaiSource(linkId, episodeId = '') {
      // Try backend API first
      if (ANIMEKAI_API_URL && episodeId) {
        try {
          // Extract category from episodeId if present
          const isDub = episodeId.includes(`${ID_SEPARATOR}dub`);
          const category = isDub ? 'dub' : 'sub';
          
          const apiResult = await callAnimeKaiApi('/aniwatch/sources', { 
            episodeId,
            category,
            server: linkId 
          });
          if (apiResult?.sources && apiResult.sources.length > 0) {
            return {
              embedUrl: apiResult.headers?.Referer || '',
              skip: apiResult.intro || apiResult.outro ? { 
                intro: [apiResult.intro?.start || 0, apiResult.intro?.end || 0], 
                outro: [apiResult.outro?.start || 0, apiResult.outro?.end || 0] 
              } : {},
              sources: apiResult.sources,
              tracks: apiResult.tracks || [],
              download: '',
            };
          }
        } catch (err) {
          console.error('[AnimeKAI sources API error]:', err.message);
        }
      }
      
      // Fallback to direct scraping
      try {
        const encoded = await encodeAnimeKaiToken(linkId);
        if (!encoded) return null;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`${ANIMEKAI_LINKS_VIEW_URL}?id=${linkId}&_=${encoded}`, {
          headers: ANIMEKAI_AJAX_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (!data.result) return null;

        // Decrypt the embed URL
        const embedData = await decodeAnimeKaiResponse(data.result);
        if (!embedData?.url) return null;

        const embedUrl = embedData.url;
        const videoId = embedUrl.split('/').filter(Boolean).pop()?.split('?')[0];
        const embedBase = embedUrl.includes('/e/') 
          ? embedUrl.split('/e/')[0] 
          : embedUrl.substring(0, embedUrl.lastIndexOf('/'));

        // Use /media/ endpoint directly
        let mediaData;
        try {
          const mediaResponse = await fetch(`${embedBase}/media/${videoId}`, { 
            headers: {
              ...ANIMEKAI_HEADERS,
              'Referer': embedUrl,
            }
          });
          if (mediaResponse.ok) {
            mediaData = await mediaResponse.json();
          }
        } catch {}
        
        if (!mediaData) return null;

        // Decrypt the encrypted result
        let finalData;
        if (mediaData.result) {
          finalData = await decodeMegaResponse(mediaData.result);
        } else if (mediaData.sources) {
          if (typeof mediaData.sources === 'string') {
            finalData = await decodeMegaResponse(mediaData.sources);
          } else {
            finalData = mediaData;
          }
        }
        
        if (!finalData) return null;

        return {
          embedUrl,
          skip: embedData.skip || {},
          sources: finalData.sources || [],
          tracks: finalData.tracks || [],
          download: finalData.download || '',
        };
      } catch (err) {
        console.error('[AnimeKAI source scraping error]', err.message);
        return null;
      }
    }

    // AnimeKAI get servers for an episode - uses backend API if available

    const allanimeSearchQuery = 'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name englishName thumbnail availableEpisodesDetail } } }';
    const allanimeShowQuery = 'query ($showId: String!) { show(_id: $showId) { _id name englishName description thumbnail availableEpisodesDetail genres status type } }';
    const allanimeEpisodeQuery = 'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }';

    const allAnimeGraphQL = async (query, variables) => {
      const url = `${allanimeApi}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Referer: allanimeReferer,
          'User-Agent': 'nyanime/allanime-adapter',
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`AllAnime ${response.status}: ${text.slice(0, 200)}`);
      }
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
        throw new Error(parsed.errors[0]?.message || 'AllAnime GraphQL error');
      }
      if (!parsed?.data) {
        throw new Error('AllAnime empty data payload');
      }
      return parsed.data;
    };

    // Jikan API helper — reliable metadata (no scraping)
    const jikanGet = async (path) => {
      try {
        const response = await fetch(`https://api.jikan.moe/v4${path}`, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'nyanime/jikan-adapter',
          },
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`Jikan ${response.status}: ${text.slice(0, 200)}`);
        }
        return JSON.parse(text);
      } catch (err) {
        // Log and rethrow - caller will handle fallback
        throw new Error(`Jikan fetch failed: ${err.message}`);
      }
    };

    const consumetGet = async (path) => {
      const response = await fetch(`${CONSUMET_API_URL}${path}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'nyanime/consumet-adapter',
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Consumet ${response.status}: ${text.slice(0, 200)}`);
      }
      return JSON.parse(text);
    };

    const anipyGet = async (path) => {
      if (!anipyApiUrl) throw new Error('ANIPY_API_URL not configured');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, anipyTimeoutMs);
      const response = await fetch(`${anipyApiUrl}${path}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'nyanime/anipy-bridge-client',
        },
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`ANIPY ${response.status}: ${text.slice(0, 240)}`);
      }
      return JSON.parse(text);
    };

    const decodeAnipyAnimeId = (value) => {
      if (!value || typeof value !== 'string') return null;
      const parts = value.split(ID_SEPARATOR);
      if (parts.length !== 3 || parts[0] !== anipyPrefix) return null;
      return { provider: parts[1], rawId: parts[2] };
    };

    const decodeAnipyEpisodeId = (value) => {
      if (!value || typeof value !== 'string') return null;
      const parts = value.split(ID_SEPARATOR);
      if (parts.length !== 4 || parts[0] !== anipyPrefix) return null;
      return { provider: parts[1], rawId: parts[2], episode: parts[3] };
    };

    const toInternalAnimeId = (value) => {
      const decoded = decodeAnipyAnimeId(value);
      if (!decoded) return value;
      if (decoded.provider === allanimeProvider) {
        return `${allanimeProvider}${ID_SEPARATOR}${decoded.rawId}`;
      }
      return value;
    };

    const toInternalEpisodeId = (value) => {
      const decoded = decodeAnipyEpisodeId(value);
      if (!decoded) return value;
      if (decoded.provider === allanimeProvider) {
        return `${allanimeProvider}${ID_SEPARATOR}${decoded.rawId}${ID_SEPARATOR}${decoded.episode}`;
      }
      return value;
    };

    const fetchProviderInfo = async (providerName, id) => {
      try {
        return await consumetGet(`/anime/${providerName}/info?id=${encodeURIComponent(id)}`);
      } catch {
        return consumetGet(`/anime/${providerName}/info/${encodeURIComponent(id)}`);
      }
    };

    const sanitizeMediaUrl = (value) => {
      if (!value || typeof value !== 'string') return '';
      let url = value.trim().replace(/^['"]|['"]$/g, '');
      if (!url) return '';
      const replaceIdx = url.indexOf('.replace(');
      if (replaceIdx > 0) {
        url = url.slice(0, replaceIdx);
      }
      try {
        return new URL(url).toString();
      } catch {
        return '';
      }
    };

    const decodeAllAnimeSourceUrl = (value) => {
      if (!value || typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return sanitizeMediaUrl(trimmed);
      if (!trimmed.startsWith('--')) {
        if (trimmed.startsWith('//')) return sanitizeMediaUrl(`https:${trimmed}`);
        if (trimmed.startsWith('/')) return sanitizeMediaUrl(`https://allanime.day${trimmed}`);
        return sanitizeMediaUrl(trimmed);
      }

      const encoded = trimmed.slice(2).replace(/\s+/g, '');
      let decoded = '';
      for (let i = 0; i < encoded.length; i += 2) {
        decoded += allanimeDecodeMap[encoded.slice(i, i + 2).toLowerCase()] || '';
      }
      if (decoded.includes('/clock')) decoded = decoded.replace('/clock', '/clock.json');
      if (decoded.startsWith('//')) decoded = `https:${decoded}`;
      if (decoded.startsWith('/')) decoded = `https://allanime.day${decoded}`;
      return sanitizeMediaUrl(decoded);
    };

    const looksPlayableMediaUrl = (value) => {
      const lower = String(value || '').toLowerCase();
      return (
        lower.includes('.m3u8') ||
        lower.includes('.mp4') ||
        lower.includes('.webm') ||
        lower.includes('/media') ||
        lower.includes('tools.fast4speed')
      );
    };

    const normalizeTracks = (payload) => {
      const trackRaw = Array.isArray(payload?.tracks)
        ? payload.tracks
        : Array.isArray(payload?.subtitles)
          ? payload.subtitles
          : [];

      const seen = new Set();
      const tracks = [];
      for (const t of trackRaw) {
        const url = sanitizeMediaUrl(t?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        tracks.push({ lang: t?.lang || t?.language || 'Unknown', url });
      }
      return tracks;
    };

    const hasEnglishTrack = (tracks) => {
      return tracks.some((track) => {
        const lang = String(track?.lang || '').toLowerCase();
        return lang === 'en' || lang === 'eng' || lang.includes('english');
      });
    };

    const enrichTracksFromServers = async (providerName, episodeId, category, initialTracks) => {
      // Keep the first watch response for video sources, but probe server variants for richer subtitles.
      let bestTracks = initialTracks;
      if (category !== 'sub' || hasEnglishTrack(bestTracks) || bestTracks.length > 1) {
        return bestTracks;
      }

      try {
        const servers = await consumetGet(`/anime/${providerName}/servers/${encodeURIComponent(episodeId)}`);
        if (!Array.isArray(servers) || servers.length === 0) {
          return bestTracks;
        }

        for (const srv of servers) {
          const name = srv?.name;
          if (!name || typeof name !== 'string') continue;
          try {
            const serverPayload = await consumetGet(
              `/anime/${providerName}/watch/${encodeURIComponent(episodeId)}?category=${category}&server=${encodeURIComponent(name)}`,
            );
            const serverTracks = normalizeTracks(serverPayload);
            if (serverTracks.length === 0) continue;

            const bestHasEnglish = hasEnglishTrack(bestTracks);
            const serverHasEnglish = hasEnglishTrack(serverTracks);
            const shouldReplace =
              (!bestHasEnglish && serverHasEnglish) ||
              (bestHasEnglish === serverHasEnglish && serverTracks.length > bestTracks.length);

            if (shouldReplace) {
              bestTracks = serverTracks;
            }

            if (hasEnglishTrack(bestTracks) && bestTracks.length > 1) {
              break;
            }
          } catch {
            // Ignore per-server failures and keep probing.
          }
        }
      } catch {
        // Server listing endpoint is provider-dependent; ignore if unavailable.
      }

      return bestTracks;
    };

    if (['home', 'search', 'suggestions', 'info', 'episodes', 'servers', 'sources'].includes(String(action))) {
      if (action === 'home') {
        // Get random anime for home page using AnimeKAI
        const popularTerms = ['demon slayer', 'attack on titan', 'naruto', 'one piece', 'jujutsu kaisen', 'bleach', 'dragon ball', 'my hero academia', 'death note', 'fullmetal alchemist', 'chainsaw man', 'spy x family', 'one punch man', 'mob psycho', 'sword art online', 'tokyo ghoul', 'hunter x hunter', 'black clover', 'fairy tail', 'blue lock'];
        const randomTerm = popularTerms[Math.floor(Math.random() * popularTerms.length)];
        
        try {
          const results = await animeKaiSearch(randomTerm);
          if (results.length > 0) {
            const randomAnime = results[Math.floor(Math.random() * results.length)];
            return res.json({
              success: true,
              data: {
                spotlightAnimes: results.slice(0, 5),
                trendingAnimes: results.slice(0, 10),
                latestEpisodeAnimes: [],
                top10Animes: { today: results.slice(0, 10), week: [], month: [] },
                randomAnime,
                suggestedAnimes: results.slice(0, 10),
                provider: ANIMEKAI_PROVIDER,
              },
            });
          }
        } catch (err) {
          console.error('[AnimeKAI home error]', err.message);
        }

        return res.json({
          success: true,
          data: {
            spotlightAnimes: [],
            trendingAnimes: [],
            latestEpisodeAnimes: [],
            top10Animes: { today: [], week: [], month: [] },
            provider: ANIMEKAI_PROVIDER,
          },
        });
      }

    if (action === 'search' || action === 'suggestions') {
      const q = String(req.query.q || '');
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const page = parseInt(req.query.page) || 1;

      // USE JIKAN API FOR SEARCH (As requested)
      try {
        const jikanData = await jikanGet(`/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${action === 'suggestions' ? 10 : 25}`);
        const jikanAnimes = Array.isArray(jikanData?.data) ? jikanData.data : [];
        if (jikanAnimes.length > 0) {
          const mapped = jikanAnimes.map((item) => ({
            id: `jikan${ID_SEPARATOR}${item?.mal_id}`,
            name: item?.title || item?.title_english || '',
            poster: item?.images?.jpg?.image_url || '',
            type: item?.type || 'TV',
            episodes: { sub: item?.episodes || 0, dub: 0 },
          }));
          if (action === 'suggestions') {
            return res.json({ 
              success: true, 
              data: mapped.slice(0, 10).map((item) => ({ id: item.id, name: item.name, poster: item.poster })) 
            });
          }
          return res.json({ 
            success: true, 
            data: { 
              currentPage: page, 
              totalPages: jikanData?.pagination?.last_visible_page || 1, 
              hasNextPage: jikanData?.pagination?.has_next_page || false, 
              provider: 'jikan', 
              animes: mapped 
            } 
          });
        }
      } catch (err) {
        console.error('[Jikan search error]', err.message);
      }

      // Fallback to AnimeKAI search if Jikan finds nothing
      try {
        const kaiResults = await animeKaiSearch(q);
        if (kaiResults.length > 0) {
          if (action === 'suggestions') {
            return res.json({ 
              success: true, 
              data: kaiResults.slice(0, 10).map((item) => ({ id: item.id, name: item.name, poster: item.poster })) 
            });
          }
          return res.json({ 
            success: true, 
            data: { 
              currentPage: 1, 
              totalPages: 1, 
              hasNextPage: false, 
              provider: ANIMEKAI_PROVIDER, 
              animes: kaiResults 
            } 
          });
        }
      } catch (err) {
        console.error('[AnimeKAI search error]', err.message);
      }

      return res.status(502).json({ success: false, error: `Search failed for all providers` });
    }

    

    
      if (action === 'info' || action === 'episodes') {

        // Handle Jikan provider - Transfer to AnimeKAI for episodes/info
        if (idParam.startsWith(`jikan${ID_SEPARATOR}`)) {
          try {
            const malId = idParam.slice(`jikan${ID_SEPARATOR}`.length);
            console.log(`[Jikan->AnimeKAI] Processing malId: ${malId}`);
            const animeData = await jikanGet(`/anime/${malId}`);
            const anime = animeData?.data;
            if (!anime) return res.status(404).json({ success: false, error: 'Anime not found on Jikan' });
            
            const animeTitle = anime?.title || anime?.title_english || '';
            console.log(`[Jikan->AnimeKAI] Anime Title: "${animeTitle}"`);
            
            // Search for this title in AnimeKAI to get the slug
            const kaiResults = await animeKaiSearch(animeTitle);
            const matchedAnime = findBestAnimeKaiMatch(animeTitle, kaiResults);
            
            if (matchedAnime) {
              const slug = matchedAnime.id.split(ID_SEPARATOR)[1];
              console.log(`[Jikan->AnimeKAI] Matched to AnimeKAI slug: ${slug} (${matchedAnime.name})`);
              
              const info = await animeKaiInfo(slug);
              if (info && info.aniId) {
                const episodes = await animeKaiEpisodes(info.aniId, slug);

                const mappedSub = episodes.filter(ep => ep.hasSub).map(ep => ({
                  number: ep.number,
                  title: `Episode ${ep.number}`,
                  episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}`,
                  isFiller: false,
                }));

                const mappedDub = episodes.filter(ep => ep.hasDub).map(ep => ({
                  number: ep.number,
                  title: `Episode ${ep.number}`,
                  episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}${ID_SEPARATOR}dub`,
                  isFiller: false,
                }));

                if (action === 'episodes') {
                  console.log(`[Jikan->AnimeKAI] Returning ${mappedSub.length} episodes for slug ${slug}`);
                  return res.json({
                    success: true,
                    data: {
                      totalEpisodes: episodes.length,
                      provider: ANIMEKAI_PROVIDER,
                      episodes: mappedSub,
                    },
                  });
                }

                console.log(`[Jikan->AnimeKAI] Returning info for slug ${slug}`);
                return res.json({
                  success: true,
                  data: {
                    id: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}`,
                    name: info.title,
                    jname: info.jname,
                    poster: info.poster,
                    description: info.description,
                    stats: {
                      type: info.type,
                      status: info.status,
                      episodes: { sub: info.sub, dub: info.dub },
                    },
                    genres: info.genres,
                    episodes: { sub: mappedSub, dub: mappedDub },
                    provider: ANIMEKAI_PROVIDER,
                    _aniId: info.aniId,
                  },
                });
                 }
                 }
                 
                 // FALLBACK: Original Jikan logic if AnimeKAI fails

            console.warn(`[Jikan->AnimeKAI] Falling back to Jikan metadata for malId ${malId}`);
            const episodesData = await jikanGet(`/anime/${malId}/episodes`);
            const jikanEpisodes = Array.isArray(episodesData?.data) ? episodesData.data : [];
            const mappedEpisodes = jikanEpisodes.map((ep, idx) => ({
              number: ep?.mal_id || (idx + 1),
              title: ep?.title || `Episode ${ep?.mal_id || (idx + 1)}`,
              episodeId: `jikan${ID_SEPARATOR}${malId}${ID_SEPARATOR}${ep?.mal_id || (idx + 1)}`,
              isFiller: false,
            }));

            if (action === 'episodes') {
              return res.json({
                success: true,
                data: {
                  totalEpisodes: anime?.episodes || mappedEpisodes.length,
                  provider: 'jikan',
                  episodes: mappedEpisodes,
                },
              });
            }

            return res.json({
              success: true,
              data: {
                id: idParam,
                name: anime?.title || '',
                jname: anime?.title_japanese || '',
                poster: anime?.images?.jpg?.image_url || '',
                description: anime?.synopsis || '',
                stats: {
                  type: anime?.type || 'TV',
                  status: anime?.status || 'Unknown',
                  episodes: { sub: anime?.episodes || 0, dub: 0 },
                },
                genres: anime?.genres?.map((g) => g?.name) || [],
                episodes: { sub: mappedEpisodes, dub: [] },
                provider: 'jikan',
                _aniId: malId,
              },
            });
          } catch (err) {
            console.error('[Jikan->AnimeKAI error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch anime data from Jikan/AnimeKAI' });
          }
        }

        // Handle AnimeKAI provider
        if (idParam.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
          try {
            const slug = idParam.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length);
            const info = await animeKaiInfo(slug);
            if (!info.aniId) return res.status(404).json({ success: false, error: 'Anime not found' });

            const episodes = await animeKaiEpisodes(info.aniId, slug);

            const mappedSub = episodes.filter(ep => ep.hasSub).map(ep => ({
              number: ep.number,
              title: `Episode ${ep.number}`,
              episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}`,
              isFiller: false,
            }));

            const mappedDub = episodes.filter(ep => ep.hasDub).map(ep => ({
              number: ep.number,
              title: `Episode ${ep.number}`,
              episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}${ID_SEPARATOR}dub`,
              isFiller: false,
            }));

            if (action === 'episodes') {
              return res.json({
                success: true,
                data: {
                  totalEpisodes: episodes.length,
                  provider: ANIMEKAI_PROVIDER,
                  episodes: mappedSub,
                },
              });
            }

            return res.json({
              success: true,
              data: {
                id: idParam,
                name: info.title,
                jname: info.jname,
                poster: info.poster,
                description: info.description,
                stats: {
                  type: info.type,
                  status: info.status,
                  episodes: { sub: info.sub, dub: info.dub },
                },
                genres: info.genres,
                episodes: { sub: mappedSub, dub: mappedDub },
                provider: ANIMEKAI_PROVIDER,
                _aniId: info.aniId,
              },
            });
          } catch (err) {
            console.error('[AnimeKAI info error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch anime info' });
          }
        }

        return res.status(404).json({ success: false, error: 'Provider not supported or not found' });
      }


      if (action === 'servers') {
        const episodeIdParam = toInternalEpisodeId(String(req.query.episodeId || ''));
        if (!episodeIdParam) return res.status(400).json({ error: 'Missing episodeId' });

        // Handle AnimeKAI provider
        if (episodeIdParam.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
          try {
            const parts = episodeIdParam.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length).split(ID_SEPARATOR);
            const slug = parts[0] || '';
            const epToken = parts[1] || '';
            const isDub = parts[2] === 'dub';

            const servers = await animeKaiServers(epToken, slug);
            const serverList = isDub ? servers.dub : servers.sub;

            return res.json({
              success: true,
              data: {
                episodeId: episodeIdParam,
                episodeNo: 0,
                sub: isDub ? [] : serverList.map((s, i) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })),
                dub: isDub ? serverList.map((s, i) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })) : [],
                raw: [],
              },
            });
          } catch (err) {
            console.error('[AnimeKAI servers error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch servers' });
          }
        }

        return res.status(404).json({ success: false, error: 'Provider not supported or not found' });
      }

      if (action === 'sources') {
        const episodeIdParam = toInternalEpisodeId(String(req.query.episodeId || ''));
        if (!episodeIdParam) return res.status(400).json({ error: 'Missing episodeId' });

        // Handle Jikan provider — use AnimeKAI for streaming
        if (episodeIdParam.startsWith(`jikan${ID_SEPARATOR}`)) {
          try {
            const parts = episodeIdParam.slice(`jikan${ID_SEPARATOR}`.length).split(ID_SEPARATOR);
            const malId = parts[0];
            const episodeNum = parseInt(parts[1], 10);

            // Get anime title from Jikan
            const animeData = await jikanGet(`/anime/${malId}`);
            const anime = animeData?.data;
            if (!anime) return res.status(404).json({ success: false, error: 'Anime not found on Jikan' });

            const animeTitle = anime?.title || '';

            // Search for anime on AnimeKAI
            console.log(`[Jikan->AnimeKAI] Searching for "${animeTitle}"`);
            const animeKaiResults = await animeKaiSearch(animeTitle);
            if (!animeKaiResults || animeKaiResults.length === 0) {
              console.warn(`[Jikan->AnimeKAI] No results for "${animeTitle}"`);
              return res.status(404).json({ success: false, error: 'Anime not found on AnimeKAI' });
            }

            // Use the first result
            const matchedAnime = animeKaiResults[0];
            const slug = matchedAnime.id.split('::')[1]; // Extract slug from id
            console.log(`[Jikan->AnimeKAI] Found: ${matchedAnime.name} (${slug})`);

            // Get AnimeKAI info to fetch episodes
            const animeInfo = await animeKaiInfo(slug);
            if (!animeInfo.aniId) {
              console.warn(`[Jikan->AnimeKAI] Failed to get info for ${slug}`);
              return res.status(404).json({ success: false, error: 'Failed to fetch anime from AnimeKAI' });
            }

            // Get AnimeKAI episodes
            const episodes = await animeKaiEpisodes(animeInfo.aniId, slug);
            console.log(`[Jikan->AnimeKAI] Found ${episodes.length} episodes, looking for episode ${episodeNum}`);

            // Find the episode that matches the requested episode number
            const targetEpisode = episodes.find(ep => ep.number === episodeNum);
            if (!targetEpisode) {
              console.warn(`[Jikan->AnimeKAI] Episode ${episodeNum} not found`);
              return res.status(404).json({ success: false, error: `Episode ${episodeNum} not found` });
            }

            const epToken = targetEpisode.token;
            const category = req.query.category === 'dub' ? 'dub' : 'sub';
            const serverId = req.query.server || '';

            // Get servers list to find the linkId
            const servers = await animeKaiServers(epToken, slug);
            const serverList = category === 'dub' ? servers.dub : servers.sub;
            if (serverList.length === 0) {
              return res.status(404).json({ success: false, error: 'No servers available' });
            }

            // Find the linkId
            let linkId;
            if (serverId && !/^\d+$/.test(serverId)) {
              linkId = serverId;
            } else {
              const serverIdx = parseInt(serverId, 10) - 1;
              const matchedServer = (serverIdx >= 0 && serverIdx < serverList.length) ? serverList[serverIdx] : serverList[0];
              linkId = matchedServer.linkId;
            }

            // Build proper episodeId for sources call
            const fullEpisodeId = `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${epToken}${category === 'dub' ? ID_SEPARATOR + 'dub' : ''}`;
            const source = await animeKaiSource(linkId, fullEpisodeId);
            if (!source || !source.sources?.length) {
              return res.status(404).json({ success: false, error: 'No streaming sources found' });
            }

            // Extract referer from embed URL (megaup.nl for AnimeKAI)
            let embedHost = 'https://megaup.nl';
            if (source.embedUrl) {
              try {
                embedHost = new URL(source.embedUrl).origin;
              } catch {}
            }

            console.log(`[Jikan->AnimeKAI] Found ${source.sources.length} sources for episode ${episodeNum}`);

            return res.json({
              success: true,
              data: {
                headers: {
                  Referer: embedHost + '/',
                  Origin: embedHost,
                  'User-Agent': 'Mozilla/5.0',
                },
                sources: source.sources.map(s => ({
                  url: s.file || s.url,
                  quality: s.label || 'auto',
                  isM3U8: (s.file || s.url || '').includes('.m3u8'),
                })),
                tracks: source.tracks || [],
                subtitles: (source.tracks || []).filter(t => t.kind === 'captions'),
                intro: source.skip?.intro ? { start: source.skip.intro[0], end: source.skip.intro[1] } : null,
                outro: source.skip?.outro ? { start: source.skip.outro[0], end: source.skip.outro[1] } : null,
                provider: 'jikan->animekai',
              },
            });
          } catch (err) {
            console.error('[Jikan->AnimeKAI sources error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch streaming sources' });
          }
        }

        // Handle AnimeKAI provider
        if (episodeIdParam.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
          try {
            const parts = episodeIdParam.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length).split(ID_SEPARATOR);
            const slug = parts[0] || '';
            const epToken = parts[1] || '';
            const category = req.query.category === 'dub' ? 'dub' : 'sub';
            const serverId = req.query.server || '';

            // Get servers list to find the linkId
            const servers = await animeKaiServers(epToken, slug);
            const serverList = category === 'dub' ? servers.dub : servers.sub;
            if (serverList.length === 0) {
              return res.status(404).json({ success: false, error: 'No servers available' });
            }

            // Find the linkId - either by serverId number or use the provided value directly if it looks like a linkId
            let linkId;
            if (serverId && !/^\d+$/.test(serverId)) {
              // serverId looks like a linkId (not a pure number)
              linkId = serverId;
            } else {
              // serverId is a 1-indexed number or empty - find by index or use first server
              const serverIdx = parseInt(serverId, 10) - 1;
              const matchedServer = (serverIdx >= 0 && serverIdx < serverList.length) ? serverList[serverIdx] : serverList[0];
              linkId = matchedServer.linkId;
            }

            const source = await animeKaiSource(linkId, episodeIdParam);
            if (!source || !source.sources?.length) {
              return res.status(404).json({ success: false, error: 'No streaming sources found' });
            }

            // Extract referer from embed URL (megaup.nl for AnimeKAI)
            let embedHost = 'https://megaup.nl';
            if (source.embedUrl) {
              try {
                embedHost = new URL(source.embedUrl).origin;
              } catch {}
            }

            return res.json({
              success: true,
              data: {
                headers: {
                  Referer: embedHost + '/',
                  Origin: embedHost,
                  'User-Agent': 'Mozilla/5.0',
                },
                sources: source.sources.map(s => ({
                  url: s.file || s.url,
                  quality: s.label || 'auto',
                  isM3U8: (s.file || s.url || '').includes('.m3u8'),
                })),
                tracks: source.tracks || [],
                subtitles: (source.tracks || []).filter(t => t.kind === 'captions'),
                intro: source.skip?.intro ? { start: source.skip.intro[0], end: source.skip.intro[1] } : null,
                outro: source.skip?.outro ? { start: source.skip.outro[0], end: source.skip.outro[1] } : null,
                provider: ANIMEKAI_PROVIDER,
              },
            });
          } catch (err) {
            console.error('[AnimeKAI sources error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch sources' });
          }
        }

        return res.status(404).json({ success: false, error: 'Provider not supported or not found' });
      }
    }


    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[aniwatch] Adapter error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});


// Stream proxy for video content - handles M3U8 and video segments
// Uses Node.js http/https modules directly (NOT fetch/undici) to avoid
// automatic Sec-Fetch-* headers that CDN WAFs flag as bot traffic.
app.get('/stream', async (req, res) => {

  if (req.query.probe !== undefined) {
    res.set('Access-Control-Allow-Origin', '*');
    return res.status(204).end();
  }

  const targetUrl = req.query.url;
  const headersParam = req.query.h;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }
  
  // Parse custom headers if provided (base64 encoded JSON)
  let customHeaders = {};
  if (headersParam) {
    try {
      const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
      customHeaders = JSON.parse(decoded);
    } catch {
      // Ignore parsing errors
    }
  }
  
  // Get the correct referer for this CDN
  const referer = getRefererForHost(
    target.hostname, 
    customHeaders.Referer || customHeaders.referer
  );
  
  // Build upstream request — keep headers minimal and browser-like.
  // IMPORTANT: Do NOT include Sec-Fetch-* headers — they flag the request as bot.
  // Do NOT include Connection or Origin headers either.
  // Do NOT include Accept-Encoding — we need uncompressed text for M3U8 rewriting.
  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',  // Request uncompressed — needed for M3U8 text rewriting
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
  
  // Merge custom headers (they take priority)
  Object.entries(customHeaders).forEach(([key, value]) => {
    if (value && typeof value === 'string' && key.toLowerCase() !== 'referer') {
      upstreamHeaders[key] = value;
    }
  });
  
  // Forward Range header for partial content requests
  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range;
  }
  
  console.log(`[stream-proxy] Fetching: ${targetUrl.substring(0, 80)}... with Referer: ${referer}`);
  
  // Determine request type
  const pathname = target.pathname.toLowerCase();
  const isM3U8File = pathname.endsWith('.m3u8');
  const isVideoSegment = pathname.endsWith('.ts') || pathname.endsWith('.jpg') || 
                         pathname.endsWith('.jpeg') || pathname.endsWith('.mp4') || 
                         pathname.endsWith('.m4s') || pathname.endsWith('.key') ||
                         pathname.endsWith('.html');

  // Referer candidates for retries
  const refererCandidates = [
    'https://megacloud.blog/',
    'https://megacloud.tv/',
    'https://hianime.to/',
    'https://aniwatch.to/',
    `${target.protocol}//${target.host}/`,
  ];

  // Track which headers ultimately worked (for M3U8 URL rewriting)
  let workingReferer = referer;
  // For M3U8: if we read the text during retry validation, cache it here
  let cachedM3U8Text = null;
  
  try {
    let response = await proxyRequest(target.toString(), upstreamHeaders);
    
    // ── Streamlined retry logic ──
    // Previous version tried 10+ retries with 30-40s total delay, causing client timeouts.
    // New approach: 3 quick referer retries + 1 delayed retry for rate-limiting.
    // Total worst-case: ~5s instead of ~40s. Let HLS.js handle its own retry strategy.
    const needsRetry = !response.ok || 
      (response.contentType.toLowerCase().includes('text/html') && !pathname.endsWith('.html'));
    
    if (needsRetry) {
      const initialStatus = response.status;
      console.warn(`[stream-proxy] Initial request failed/blocked: ${initialStatus} ${response.contentType.substring(0, 30)} for ${pathname.substring(0, 60)}`);
      response.stream.resume(); // drain failed response
      
      // Quick referer retries (300ms between each — fast enough to stay responsive)
      const maxRefRetries = isM3U8File ? 3 : 2;
      for (let ri = 0; ri < Math.min(refererCandidates.length, maxRefRetries); ri++) {
        if (ri > 0) await new Promise(r => setTimeout(r, 300));
        const ref = refererCandidates[ri];
        try {
          const retryResp = await proxyRequest(target.toString(), { ...upstreamHeaders, 'Referer': ref });
          
          if (retryResp.ok) {
            if (isM3U8File) {
              const text = await readStream(retryResp.stream);
              const trimmed = text.replace(/^\uFEFF/, '').trim();
              if (trimmed.startsWith('#EXTM3U')) {
                response = retryResp;
                cachedM3U8Text = text;
                workingReferer = ref;
                console.log(`[stream-proxy] Referer retry ${ri+1} succeeded with ${ref}`);
                break;
              }
            } else if (!retryResp.contentType.toLowerCase().includes('text/html')) {
              response = retryResp;
              workingReferer = ref;
              console.log(`[stream-proxy] Segment retry ${ri+1} succeeded with ${ref}`);
              break;
            } else {
              retryResp.stream.resume();
            }
          } else {
            retryResp.stream.resume();
          }
        } catch { /* ignore individual retry errors */ }
      }
      
      // Single delayed retry for CDN rate-limiting (400/403/429) on M3U8 only.
      // MegaCloud CDN blocks datacenter IPs temporarily — a 2s wait often clears it.
      const isRateLimited = initialStatus === 400 || initialStatus === 403 || initialStatus === 429;
      if (!response.ok && isM3U8File && isRateLimited) {
        console.log(`[stream-proxy] CDN rate-limiting (${initialStatus}), waiting 2s for delayed retry...`);
        await new Promise(r => setTimeout(r, 2000));
        try {
          const delayedResp = await proxyRequest(target.toString(), {
            ...upstreamHeaders,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
            'Referer': 'https://megacloud.blog/',
          });
          if (delayedResp.ok) {
            const text = await readStream(delayedResp.stream);
            const trimmed = text.replace(/^\uFEFF/, '').trim();
            if (trimmed.startsWith('#EXTM3U')) {
              response = delayedResp;
              cachedM3U8Text = text;
              workingReferer = 'https://megacloud.blog/';
              console.log(`[stream-proxy] Delayed retry succeeded after 2s`);
            }
          } else {
            delayedResp.stream.resume();
          }
        } catch { /* ignore */ }
      }
      
      // One delayed retry for segments on rate-limit too
      if (!response.ok && isVideoSegment && (initialStatus === 400 || initialStatus === 403 || initialStatus === 429)) {
        console.log(`[stream-proxy] Segment rate-limited (${initialStatus}), waiting 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        try {
          const segResp = await proxyRequest(target.toString(), upstreamHeaders);
          if (segResp.ok && !segResp.contentType.toLowerCase().includes('text/html')) {
            response = segResp;
            console.log(`[stream-proxy] Segment delayed retry succeeded`);
          } else {
            segResp.stream.resume();
          }
        } catch { /* ignore */ }
      }
    }
    
    if (!response.ok) {
      console.error(`[stream-proxy] All retries failed. Final: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        status: response.status
      });
    }
    
    const contentType = response.contentType;
    
    // Reject HTML responses for video segments (CDN returned error page)
    if (isVideoSegment && contentType.toLowerCase().includes('text/html')) {
      response.stream.resume(); // drain
      console.warn(`[stream-proxy] CDN returned HTML for segment: ${target.pathname}`);
      return res.status(502).json({ error: 'CDN returned HTML instead of video data' });
    }
    
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || 
                   contentType.toLowerCase().includes('x-mpegurl') ||
                   isM3U8File;
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // For non-M3U8 content (video segments), pipe directly
    if (!isM3U8) {
      const inferDirectMediaType = (upstreamContentType, pathnameValue) => {
        const ct = String(upstreamContentType || '').toLowerCase();
        const lowerPath = String(pathnameValue || '').toLowerCase();
        const isUnknownBinary = !ct || ct.includes('application/octet-stream');
        const looksLikeDirectVideoPath = /\/media\d*\/videos\//.test(lowerPath) || /\/videos\//.test(lowerPath);

        if (!isUnknownBinary) return upstreamContentType;
        if (lowerPath.endsWith('.webm')) return 'video/webm';
        if (lowerPath.endsWith('.m4v')) return 'video/mp4';
        if (lowerPath.endsWith('.mp4')) return 'video/mp4';
        if (looksLikeDirectVideoPath) return 'video/mp4';
        return upstreamContentType;
      };

      // Copy relevant headers
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
        const val = response.getHeader(h);
        if (val) res.set(h, val);
      });

      // Some direct movie URLs are served as application/octet-stream; set a
      // playable media type when the path clearly looks like a video endpoint.
      const normalizedCt = inferDirectMediaType(response.getHeader('content-type'), target.pathname);
      if (normalizedCt) {
        res.set('Content-Type', normalizedCt);
      }
      
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(response.status);
      
      // Pipe the upstream response directly to Express response
      response.stream.pipe(res);
      response.stream.on('error', (err) => {
        console.error('[stream-proxy] Stream error:', err);
        res.end();
      });
      return;
    }
    
    // For M3U8 playlists, read and rewrite URLs
    const text = cachedM3U8Text || await readStream(response.stream);
    
    // Validate M3U8 content — handle BOM and leading whitespace
    const trimmedM3U8 = text.replace(/^\uFEFF/, '').trim();
    if (!trimmedM3U8.startsWith('#EXTM3U') && !trimmedM3U8.includes('#EXT')) {
      console.warn('[stream-proxy] M3U8 validation failed — content does not look like a playlist');
      res.set('Content-Type', contentType || 'text/plain');
      return res.send(text);
    }
    
    // Rewrite URLs in M3U8 playlist to go through our proxy
    const baseUrl = new URL('.', target.toString()).toString();
    // Use X-Forwarded-Proto header to detect HTTPS (Render/Heroku/etc terminate SSL at load balancer)
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const proxyBase = `${protocol}://${req.get('host')}/stream?`;
    const headersB64 = Buffer.from(JSON.stringify({ Referer: workingReferer })).toString('base64');
    
    // First pass: rewrite URI="..." inside tag lines (#EXT-X-KEY, #EXT-X-MAP, etc.)
    const firstPass = text.replace(/URI="([^"]+)"/g, (_match, uri) => {
      try {
        let absoluteUrl;
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          absoluteUrl = uri;
        } else if (uri.startsWith('/')) {
          absoluteUrl = `${target.origin}${uri}`;
        } else {
          absoluteUrl = `${baseUrl}${uri}`;
        }
        return `URI="${proxyBase}url=${encodeURIComponent(absoluteUrl)}&h=${headersB64}"`;
      } catch {
        return `URI="${uri}"`;
      }
    });
    
    // Second pass: rewrite bare URL lines (segment/variant playlist references)
    const rewritten = firstPass.split('\n').map(line => {
      const trimmed = line.trim();
      
      // Skip comments/tags and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      
      // Handle relative and absolute URLs
      let absoluteUrl;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith('/')) {
        absoluteUrl = `${target.origin}${trimmed}`;
      } else {
        absoluteUrl = `${baseUrl}${trimmed}`;
      }
      
      return `${proxyBase}url=${encodeURIComponent(absoluteUrl)}&h=${headersB64}`;
    }).join('\n');
    
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');
    res.send(rewritten);
    
  } catch (error) {
    console.error('[stream-proxy] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch stream', details: error.message });
  }
});

// ============================================================================
// CLI SYNC API - Synchronize watch history from ny-cli terminal client
// Uses the SAME history field as the website for unified Continue Watching
// ============================================================================

// Initialize Firebase Admin SDK (only once)
let firebaseAdminInitialized = false;
function initFirebaseAdmin() {
  if (firebaseAdminInitialized) return;
  
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[firebase-admin] Initialized with service account');
    } else {
      console.warn('[firebase-admin] No FIREBASE_SERVICE_ACCOUNT env var found');
      return;
    }
    firebaseAdminInitialized = true;
  } catch (error) {
    console.error('[firebase-admin] Failed to initialize:', error.message);
  }
}

// Initialize on module load
initFirebaseAdmin();

// Get Firestore instance
const getDb = () => {
  if (!firebaseAdminInitialized) {
    throw new Error('Firebase Admin not initialized - check FIREBASE_SERVICE_ACCOUNT env var');
  }
  return admin.firestore();
};

// Fetch anime info using Jikan API
async function getAnimeInfo(animeSlug) {
  try {
    // Since we only have the slug, we'd need to search for the title first.
    // This is complex, so we rely on the client providing malId for CLI sync.
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Sync watch progress from ny-cli
 * POST /api/cli/sync-watch
 * Headers: X-Firebase-UID (required)
 * Body: { animeSlug, animeTitle, episodeNum, malId (optional) }
 * 
 * Stores in the SAME history field as the website uses
 */
app.post('/api/cli/sync-watch', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const { animeSlug, animeTitle, episodeNum, malId: providedMalId } = req.body;
    
    if (!animeSlug || !animeTitle) {
      return res.status(400).json({ error: 'Missing required fields: animeSlug, animeTitle' });
    }
    
    console.log(`[cli-sync] Syncing for user ${firebaseUid}: ${animeTitle} (${animeSlug}), ep=${episodeNum}`);
    
    // Get malId - either from request or fetch from API
    let malId = parseInt(providedMalId) || 0;
    if (!malId) {
      const animeInfo = await getAnimeInfo(animeSlug);
      if (animeInfo) {
        malId = animeInfo.malId;
      }
    }
    
    const db = getDb();
    const userRef = db.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let history = userData.history || [];
    
    // Use malId as animeId, episodeNum as episodeId (same format as website)
    const animeId = malId;
    const episodeId = parseInt(episodeNum) || 1;
    
    // Find existing entry for this anime (by animeId/malId)
    const existingIndex = history.findIndex(item => item.animeId === animeId);
    
    const now = new Date();
    const newEntry = {
      animeId,
      episodeId,
      progress: 0, // CLI doesn't track exact progress
      timestamp: Math.floor(now.getTime() / 1000),
      lastWatched: now,
      // Add slug for CLI compatibility
      animeSlug,
      animeTitle
    };
    
    if (existingIndex >= 0) {
      // Update existing - keep animeSlug if we have it, update episode
      history[existingIndex] = {
        ...history[existingIndex],
        ...newEntry
      };
    } else {
      // Add new entry at the front
      history.unshift(newEntry);
    }
    
    // Keep only last 100 entries
    history = history.slice(0, 100);
    
    // Update user document
    await userRef.update({ history });
    
    console.log(`[cli-sync] Successfully synced: ${animeTitle} ep ${episodeNum} (malId: ${malId})`);
    res.json({ success: true, message: 'Watch history synced', malId });
    
  } catch (error) {
    console.error('[cli-sync] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * Get watch history for CLI
 * GET /api/cli/history
 * Headers: X-Firebase-UID (required)
 * 
 * Returns the SAME history as the website, with slug info for CLI
 */
app.get('/api/cli/history', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const db = getDb();
    const userRef = db.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let history = userData.history || [];
    
    // Sort by lastWatched, most recent first
    history.sort((a, b) => {
      const dateA = a.lastWatched?.toDate ? a.lastWatched.toDate() : new Date(a.lastWatched || a.timestamp * 1000 || 0);
      const dateB = b.lastWatched?.toDate ? b.lastWatched.toDate() : new Date(b.lastWatched || b.timestamp * 1000 || 0);
      return dateB - dateA;
    });
    
    // Convert to CLI-friendly format
    history = history.map(item => ({
      animeId: item.animeId,
      animeSlug: item.animeSlug || '',
      animeTitle: item.animeTitle || '',
      episodeNum: item.episodeId,
      progress: item.progress || 0,
      lastWatched: item.lastWatched?.toDate ? item.lastWatched.toDate().toISOString() : item.lastWatched
    }));
    
    res.json({ success: true, history });
    
  } catch (error) {
    console.error('[cli-history] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
// Express 5 requires named wildcard parameters (path-to-regexp breaking change)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`[error] ${err.stack}`);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

function onServerStarted() {
  console.log(`Server running on ${HOST}:${PORT}`);
}

const server = app.listen({ port: PORT, host: HOST, ipv6Only: false }, onServerStarted);

// Graceful shutdown
const shutdown = () => {
  console.info('[server] Shutting down gracefully...');
  server.close(() => {
    console.info('[server] Closed out all connections.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.on('error', (error) => {
  if (HOST === '::' && (error?.code === 'EADDRNOTAVAIL' || error?.code === 'EINVAL')) {
    console.warn('[startup] IPv6 bind unavailable, falling back to 0.0.0.0');
    app.listen({ port: PORT, host: '0.0.0.0' }, () => {
      console.log(`Server running on 0.0.0.0:${PORT}`);
      runProviderHealthCheck('startup').catch((err) => {
        console.warn('[provider-health] Startup probe failed:', err?.message || err);
      });
    });
    return;
  }

  console.error('[startup] Failed to start server:', error?.message || error);
  process.exit(1);
});
