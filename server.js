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

// Dynamic import: optional legacy scraper package.
// Keep startup resilient when aniwatch is intentionally removed.
let HiAnime = null;
try {
  ({ HiAnime } = await import('aniwatch'));
} catch (error) {
  console.warn('[startup] Legacy aniwatch package not installed; using Consumet-only provider adapter.');
}

const app = express();
const PORT = process.env.PORT || 3000;
const hianime = HiAnime ? new HiAnime.Scraper() : null;

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

// Old API fallback URL
const OLD_API_URL = process.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com';
const CONSUMET_API_URL = process.env.VITE_CONSUMET_API_URL || 'https://consumet.nyanime.tech';
const CONSUMET_PROVIDER = process.env.CONSUMET_ANIME_PROVIDER || 'animesaturn';
const CONSUMET_FALLBACK_PROVIDERS = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'animepahe,animekai,kickassanime,animeunity')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const CONSUMET_PROVIDER_PRIORITY = [CONSUMET_PROVIDER, ...CONSUMET_FALLBACK_PROVIDERS].filter((p, i, arr) => arr.indexOf(p) === i);
const PROVIDER_HEALTH_QUERY = process.env.PROVIDER_HEALTH_QUERY || 'naruto';

// Trust proxy headers (required for Render/Heroku/etc where SSL terminates at load balancer)
app.set('trust proxy', 1);

// Lightweight runtime health status for provider chain:
// search -> episodes -> sources
const providerHealth = {
  status: 'unknown', // unknown | ok | degraded
  provider: CONSUMET_PROVIDER,
  providerPriority: CONSUMET_PROVIDER_PRIORITY,
  checkedAt: null,
  latencyMs: null,
  details: {
    search: false,
    episodes: false,
    sources: false,
    searchId: null,
    episodeId: null,
    sourceCount: 0,
  },
  lastError: null,
};

async function fetchProviderJson(path) {
  const response = await fetch(`${CONSUMET_API_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nyanime/provider-health-check',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${text.slice(0, 180)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON for ${path}`);
  }
}

async function runProviderHealthCheck(trigger = 'manual') {
  const started = Date.now();

  try {
    let usedProvider = CONSUMET_PROVIDER;
    let animeId = null;
    let episodeId = null;
    let sourceCount = 0;

    for (const providerName of CONSUMET_PROVIDER_PRIORITY) {
      try {
        const candidate = await fetchProviderJson(`/anime/${providerName}/${encodeURIComponent(PROVIDER_HEALTH_QUERY)}?page=1`);
        const results = Array.isArray(candidate?.results) ? candidate.results : [];

        for (const result of results.slice(0, 5)) {
          if (!result?.id) continue;

          let info;
          try {
            info = await fetchProviderJson(`/anime/${providerName}/info?id=${encodeURIComponent(result.id)}`);
          } catch {
            info = await fetchProviderJson(`/anime/${providerName}/info/${encodeURIComponent(result.id)}`);
          }

          const episodes = Array.isArray(info?.episodes) ? info.episodes : [];
          const firstEpisodeId = episodes[0]?.id;
          if (!firstEpisodeId) continue;

          const watch = await fetchProviderJson(
            `/anime/${providerName}/watch/${encodeURIComponent(firstEpisodeId)}?category=sub`,
          );
          const sources = Array.isArray(watch?.sources) ? watch.sources : [];
          if (!sources.length) continue;

          usedProvider = providerName;
          animeId = result.id;
          episodeId = firstEpisodeId;
          sourceCount = sources.length;
          break;
        }

        if (animeId && episodeId) {
          break;
        }
      } catch {
        // Try next provider.
      }
    }

    if (!animeId || !episodeId) throw new Error('No playable anime resolved from provider chain');

    providerHealth.status = 'ok';
    providerHealth.provider = usedProvider;
    providerHealth.checkedAt = new Date().toISOString();
    providerHealth.latencyMs = Date.now() - started;
    providerHealth.details = {
      search: true,
      episodes: true,
      sources: true,
      searchId: animeId,
      episodeId,
      sourceCount,
    };
    providerHealth.lastError = null;

    if (trigger === 'startup') {
      console.log(
        `[provider-health] OK (${usedProvider}) in ${providerHealth.latencyMs}ms; id=${animeId}, episode=${episodeId}, sources=${sourceCount}`,
      );
    }

    return providerHealth;
  } catch (error) {
    providerHealth.status = 'degraded';
    providerHealth.provider = CONSUMET_PROVIDER;
    providerHealth.checkedAt = new Date().toISOString();
    providerHealth.latencyMs = Date.now() - started;
    providerHealth.details = {
      search: false,
      episodes: false,
      sources: false,
      searchId: null,
      episodeId: null,
      sourceCount: 0,
    };
    providerHealth.lastError = error instanceof Error ? error.message : String(error);

    if (trigger === 'startup') {
      console.warn(
        `[provider-health] WARNING: provider chain degraded (${CONSUMET_PROVIDER_PRIORITY.join(' -> ')}) - ${providerHealth.lastError}`,
      );
    }

    return providerHealth;
  }
}

// MegaCloud ecosystem domains
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike', 'sunburst', 'clearskyline',  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
  'crimsonstorm', 'netmagcdn'  // Additional MegaCloud CDN domains observed in the wild
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

// Parse JSON bodies
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providerHealth: {
      status: providerHealth.status,
      checkedAt: providerHealth.checkedAt,
      provider: providerHealth.provider,
    },
  });
});

// Provider runtime health details.
// Add `?refresh=1` to force a fresh search->episodes->sources probe.
app.get('/health/provider', async (req, res) => {
  try {
    if (req.query.refresh === '1') {
      await runProviderHealthCheck('manual');
    }
    res.status(200).json({
      status: providerHealth.status,
      provider: providerHealth.provider,
      checkedAt: providerHealth.checkedAt,
      latencyMs: providerHealth.latencyMs,
      details: providerHealth.details,
      lastError: providerHealth.lastError,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'provider health check failed' });
  }
});

// ============================================================================
// ANIWATCH API — Direct scraping via npm package (no external API needed)
// Supports both new action-based (?action=search&q=...) and legacy path-based (?path=/api/v2/...)
// Falls back to old hosted API on scraper errors
// ============================================================================

/** Proxy to old hosted API as fallback */
async function proxyOldApi(apiPath, res) {
  try {
    const url = `${OLD_API_URL}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return res.status(r.status).json({ error: r.statusText });
    return res.json(await r.json());
  } catch (err) {
    return res.status(502).json({ error: 'Old API fallback failed', details: err.message });
  }
}

/** Handle legacy ?path=/api/v2/hianime/... */
async function handleLegacyPath(p, res) {
  try {
    if (!hianime) {
      return proxyOldApi(p, res);
    }

    if (p.includes('/home')) return res.json({ success: true, data: await hianime.getHomePage() });

    if (p.includes('/search')) {
      const u = new URL('http://x' + p);
      const q = u.searchParams.get('q') || '';
      if (!q) return res.status(400).json({ error: 'Missing q' });
      return res.json({ success: true, data: await hianime.search(q, parseInt(u.searchParams.get('page') || '1')) });
    }

    if (p.includes('/episode/sources')) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return res.status(400).json({ error: 'Missing animeEpisodeId' });
      const _cat = u.searchParams.get('category') || 'sub';
      
      // Pre-check available servers
      let availableServers = [];
      try {
        const serverData = await hianime.getEpisodeServers(eid);
        const serverList = _cat === 'dub' ? serverData.dub : serverData.sub;
        availableServers = (serverList || []).map(s => s.serverName);
      } catch { availableServers = ['hd-1', 'hd-2']; }
      
      // hd-2 (MegaF/netmagcdn) is more reliable than hd-1 (MegaCloud/rotating domains).
      // Prefer hd-2 first; hd-1 (MegaCloud) as last resort per user preference.
      const knownExtractors = ['streamtape', 'streamsb', 'hd-2', 'hd-1'];
      const serversToTry = knownExtractors.filter(s => availableServers.includes(s));
      if (serversToTry.length === 0) serversToTry.push('hd-2');
      
      let lastError = null;
      const PER_SERVER_TIMEOUT = 10000;
      
      for (const server of serversToTry) {
        // Stop processing if the client disconnected (e.g., rapid episode change)
        if (req.socket.destroyed) {
          console.log('[aniwatch] Client disconnected (legacy), stopping extractor loop');
          return;
        }
        try {
          const srcData = await Promise.race([
            withRetry(
              () => hianime.getEpisodeSources(eid, server, _cat),
              { retries: 1, delay: 800, label: `legacy-${server}` }
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${server} extractor timed out after ${PER_SERVER_TIMEOUT/1000}s`)), PER_SERVER_TIMEOUT))
          ]);
          if (req.socket.destroyed) return; // Check again after async work
          if (srcData?.sources?.length > 0) {
            console.log(`[aniwatch] Legacy sources resolved via server: ${server}`);
            srcData._usedServer = server;
            srcData._availableServers = availableServers;
            srcData._triedServers = serversToTry;
            
            // For MegaCloud servers, resolve embed URL for iframe fallback
            if (server === 'hd-1' || server === 'hd-2') {
              try {
                const epNum = eid.includes('?ep=') ? eid.split('?ep=')[1] : eid;
                const srvResp = await fetch(
                  `https://hianimez.to/ajax/v2/episode/servers?episodeId=${epNum}`,
                  { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://hianimez.to/watch/${eid}` } }
                );
                if (srvResp.ok) {
                  const srvJson = await srvResp.json();
                  const srvHtml = srvJson?.html || '';
                  const srvNameToId = { 'hd-1': '4', 'hd-2': '1' };
                  const targetServerId = srvNameToId[server] || '4';
                  const re = new RegExp(`data-type="${_cat}"\\s+data-id="(\\d+)"\\s+data-server-id="${targetServerId}"`);
                  const match = re.exec(srvHtml);
                  const sourceId = match?.[1];
                  if (sourceId) {
                    const ajaxResp = await fetch(
                      `https://hianimez.to/ajax/v2/episode/sources?id=${sourceId}`,
                      { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://hianimez.to/' } }
                    );
                    if (ajaxResp.ok) {
                      const ajaxData = await ajaxResp.json();
                      if (ajaxData?.link) {
                        srcData.embedURL = ajaxData.link.replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                      }
                    }
                  }
                }
              } catch { /* ignore embed URL errors */ }
            }
            
            return res.json({ success: true, data: srcData });
          }
        } catch (err) {
          console.warn(`[aniwatch] Legacy server "${server}" failed: ${err.message}`);
          lastError = err;
        }
      }
      throw lastError || new Error('All servers/extractors failed');
    }

    if (p.includes('/episode/servers')) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return res.status(400).json({ error: 'Missing animeEpisodeId' });
      return res.json({ success: true, data: await hianime.getEpisodeServers(eid) });
    }

    const epsMatch = p.match(/\/anime\/([^/]+)\/episodes/);
    if (epsMatch) return res.json({ success: true, data: await hianime.getEpisodes(epsMatch[1]) });

    const infoMatch = p.match(/\/anime\/([^/]+)$/);
    if (infoMatch) return res.json({ success: true, data: await hianime.getInfo(infoMatch[1]) });

    return proxyOldApi(p, res);
  } catch (err) {
    console.error('[aniwatch] Legacy handler error, falling back:', err.message);
    return proxyOldApi(p, res);
  }
}

/** Build legacy path from action params for fallback */
function toLegacyPath(q) {
  switch (q.action) {
    case 'home': return '/api/v2/hianime/home';
    case 'search': return `/api/v2/hianime/search?q=${encodeURIComponent(q.q || '')}&page=${q.page || 1}`;
    case 'info': return `/api/v2/hianime/anime/${q.id}`;
    case 'episodes': return `/api/v2/hianime/anime/${q.id}/episodes`;
    case 'servers': return `/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(q.episodeId || '')}`;
    case 'sources': return `/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(q.episodeId || '')}&server=${q.server || 'hd-2'}&category=${q.category || 'sub'}`;
    default: return null;
  }
}

app.get('/aniwatch', async (req, res) => {
  try {
    // Legacy path-based routing is intentionally disabled.
    if (req.query.path) {
      return res.status(410).json({ success: false, error: 'Legacy path routing is disabled. Use action-based /aniwatch API.' });
    }

    const action = req.query.action;
    if (!action) return res.status(400).json({ error: 'Missing action param' });

    // Consumet-first adapter (HiAnime is unavailable after shutdown).
    // Keeps the existing /aniwatch?action=... contract used by the frontend.
    const primaryProvider = process.env.CONSUMET_ANIME_PROVIDER || 'animesaturn';
    const allanimeProvider = 'allanime';
    const allanimeApi = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
    const allanimeReferer = process.env.ALLANIME_REFERER || 'https://allmanga.to';
    const fallbackProviders = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'animepahe,animekai,kickassanime,animeunity')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const providerPriority = [primaryProvider, ...fallbackProviders].filter((p, i, arr) => arr.indexOf(p) === i);
    const ID_SEPARATOR = '::';
    const allanimeDecodeMap = {
      '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
      '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
      '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
      '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
    };
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

    const toEpisodeList = (value) => {
      if (!Array.isArray(value)) return [];
      return value
        .map((v) => String(v).trim())
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));
    };

    const encodeProviderId = (providerName, value) => {
      if (!value || typeof value !== 'string') return '';
      const separatorIdx = value.indexOf(ID_SEPARATOR);
      if (separatorIdx > 0) {
        const prefix = value.slice(0, separatorIdx);
        if (prefix === allanimeProvider || providerPriority.includes(prefix)) {
          return value;
        }
      }
      return `${providerName}${ID_SEPARATOR}${value}`;
    };

    const decodeProviderId = (value) => {
      if (!value || typeof value !== 'string') {
        return { provider: primaryProvider, rawId: '' };
      }
      if (value.includes(ID_SEPARATOR)) {
        const [providerName, ...rest] = value.split(ID_SEPARATOR);
        const rawId = rest.join(ID_SEPARATOR);
        if (providerName && rawId && (providerName === allanimeProvider || providerPriority.includes(providerName))) {
          return { provider: providerName, rawId };
        }
      }
      return { provider: primaryProvider, rawId: value };
    };

    const decodeAllAnimeEpisodeId = (value) => {
      if (!value || typeof value !== 'string' || !value.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) return null;
      const rest = value.slice(`${allanimeProvider}${ID_SEPARATOR}`.length);
      const splitAt = rest.indexOf(ID_SEPARATOR);
      if (splitAt <= 0) return null;
      return { showId: rest.slice(0, splitAt), episodeString: rest.slice(splitAt + ID_SEPARATOR.length) };
    };

    const providerCandidatesForValue = (value) => {
      if (typeof value === 'string' && value.includes(ID_SEPARATOR)) {
        return [decodeProviderId(value).provider];
      }
      return providerPriority;
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
        return res.json({
          success: true,
          data: {
            spotlightAnimes: [],
            trendingAnimes: [],
            latestEpisodeAnimes: [],
            top10Animes: { today: [], week: [], month: [] },
            provider: allanimeProvider,
            providerPriority: [allanimeProvider, ...providerPriority],
          },
        });
      }

      if (action === 'search' || action === 'suggestions') {
        const q = String(req.query.q || '');
        if (!q) return res.status(400).json({ error: 'Missing q' });
        const page = parseInt(req.query.page) || 1;
        try {
          const data = await allAnimeGraphQL(allanimeSearchQuery, {
            search: { allowAdult: false, allowUnknown: false, query: q },
            limit: action === 'suggestions' ? 10 : 40,
            page: action === 'suggestions' ? 1 : page,
            translationType: 'sub',
            countryOrigin: 'ALL',
          });
          const edges = Array.isArray(data?.shows?.edges) ? data.shows.edges : [];
          const animes = edges.map((item) => ({
            id: encodeProviderId(allanimeProvider, item?._id || ''),
            name: item?.englishName || item?.name || '',
            poster: item?.thumbnail || '',
            type: 'TV',
            episodes: {
              sub: toEpisodeList(item?.availableEpisodesDetail?.sub).length,
              dub: toEpisodeList(item?.availableEpisodesDetail?.dub).length,
            },
          }));
          if (animes.length > 0) {
            if (action === 'suggestions') {
              return res.json({ success: true, data: animes.slice(0, 10).map((item) => ({ id: item.id, name: item.name, poster: item.poster })) });
            }
            return res.json({ success: true, data: { currentPage: 1, totalPages: 1, hasNextPage: false, provider: allanimeProvider, animes } });
          }
        } catch {
          // Fall through to Consumet providers.
        }

        let usedProvider = primaryProvider;
        let payload = null;
        let results = [];

        for (const providerName of providerPriority) {
          try {
            const candidate = await consumetGet(`/anime/${providerName}/${encodeURIComponent(q)}?page=${page}`);
            const candidateResults = Array.isArray(candidate?.results) ? candidate.results : [];
            if (candidateResults.length > 0) {
              usedProvider = providerName;
              payload = candidate;
              results = candidateResults;
              break;
            }
          } catch {
            // Try next provider.
          }
        }

        if (!payload) {
          return res.status(502).json({ success: false, error: `Search failed for providers: ${providerPriority.join(', ')}` });
        }

        const mapped = {
          currentPage: payload?.currentPage ?? page,
          totalPages: payload?.totalPages ?? 1,
          hasNextPage: Boolean(payload?.hasNextPage),
          provider: usedProvider,
          animes: results.map((item) => {
            const sub = typeof item?.episodes === 'number' ? item.episodes : Number(item?.episodes?.sub || 0);
            const dub = typeof item?.episodes === 'object' ? Number(item?.episodes?.dub || 0) : 0;
            return {
              id: encodeProviderId(usedProvider, item?.id || ''),
              name: item?.title || '',
              poster: item?.image || '',
              type: item?.type || 'TV',
              episodes: { sub, dub },
            };
          }),
        };

        if (action === 'suggestions') {
          return res.json({
            success: true,
            data: mapped.animes.slice(0, 10).map((item) => ({
              id: item.id,
              name: item.name,
              poster: item.poster,
            })),
          });
        }

        return res.json({ success: true, data: mapped });
      }

      if (action === 'info' || action === 'episodes') {
        const idParam = String(req.query.id || '');
        if (!idParam) return res.status(400).json({ error: 'Missing id' });
        if (idParam.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
          const showId = idParam.slice(`${allanimeProvider}${ID_SEPARATOR}`.length);
          const data = await allAnimeGraphQL(allanimeShowQuery, { showId });
          const show = data?.show;
          if (!show?._id) return res.status(404).json({ success: false, error: 'Anime not found' });

          const subEpisodes = toEpisodeList(show?.availableEpisodesDetail?.sub);
          const dubEpisodes = toEpisodeList(show?.availableEpisodesDetail?.dub);
          const mappedSub = subEpisodes.map((ep) => ({ number: Number(ep), title: `Episode ${ep}`, episodeId: encodeProviderId(allanimeProvider, `${show._id}${ID_SEPARATOR}${ep}`), isFiller: false }));
          const mappedDub = dubEpisodes.map((ep) => ({ number: Number(ep), title: `Episode ${ep}`, episodeId: encodeProviderId(allanimeProvider, `${show._id}${ID_SEPARATOR}${ep}`), isFiller: false }));

          if (action === 'episodes') {
            return res.json({ success: true, data: { totalEpisodes: mappedSub.length, provider: allanimeProvider, episodes: mappedSub } });
          }

          return res.json({
            success: true,
            data: {
              id: encodeProviderId(allanimeProvider, show._id),
              name: show?.englishName || show?.name || '',
              poster: show?.thumbnail || '',
              description: show?.description || '',
              genres: Array.isArray(show?.genres) ? show.genres : [],
              provider: allanimeProvider,
              episodes: { sub: mappedSub, dub: mappedDub },
            },
          });
        }
        const decoded = decodeProviderId(idParam);
        const providerCandidates = providerCandidatesForValue(idParam);

        let usedProvider = decoded.provider;
        let info = null;
        let lastInfoError = null;
        for (const providerName of providerCandidates) {
          try {
            info = await fetchProviderInfo(providerName, decoded.rawId);
            usedProvider = providerName;
            break;
          } catch (err) {
            lastInfoError = err;
          }
        }

        if (!info) {
          throw lastInfoError || new Error('Failed to resolve anime info from all providers');
        }

        const eps = Array.isArray(info?.episodes) ? info.episodes : [];
        const mappedEpisodes = eps.map((ep, index) => {
          const number = Number(ep?.number || index + 1);
          return {
            number,
            title: ep?.title || `Episode ${number}`,
            episodeId: encodeProviderId(usedProvider, ep?.id || ''),
            isFiller: false,
          };
        });

        if (action === 'episodes') {
          return res.json({
            success: true,
            data: {
              totalEpisodes: info?.totalEpisodes || mappedEpisodes.length,
              provider: usedProvider,
              episodes: mappedEpisodes,
            },
          });
        }

        return res.json({
          success: true,
          data: {
            id: encodeProviderId(usedProvider, info?.id || decoded.rawId),
            name: info?.title || '',
            poster: info?.image || '',
            description: info?.description || '',
            genres: Array.isArray(info?.genres) ? info.genres : [],
            provider: usedProvider,
            episodes: { sub: mappedEpisodes, dub: [] },
          },
        });
      }

      if (action === 'servers') {
        const episodeIdParam = String(req.query.episodeId || '');
        if (!episodeIdParam) return res.status(400).json({ error: 'Missing episodeId' });
        if (episodeIdParam.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
          return res.json({
            success: true,
            data: {
              episodeId: episodeIdParam,
              episodeNo: 0,
              sub: [{ serverId: 1, serverName: allanimeProvider }],
              dub: [],
              raw: [],
            },
          });
        }
        const decodedEpisode = decodeProviderId(episodeIdParam);
        return res.json({
          success: true,
          data: {
            episodeId: episodeIdParam,
            episodeNo: 0,
            sub: [{ serverId: 1, serverName: decodedEpisode.provider }],
            dub: [],
            raw: [],
          },
        });
      }

      if (action === 'sources') {
        const episodeIdParam = String(req.query.episodeId || '');
        if (!episodeIdParam) return res.status(400).json({ error: 'Missing episodeId' });
        const allanimeEpisode = decodeAllAnimeEpisodeId(episodeIdParam);
        if (allanimeEpisode) {
          const category = req.query.category === 'dub' ? 'dub' : 'sub';
          const data = await allAnimeGraphQL(allanimeEpisodeQuery, {
            showId: allanimeEpisode.showId,
            translationType: category,
            episodeString: allanimeEpisode.episodeString,
          });
          const rawSources = Array.isArray(data?.episode?.sourceUrls) ? data.episode.sourceUrls : [];
          const seen = new Set();
          const sources = rawSources
            .map((source) => {
              const mediaUrl = decodeAllAnimeSourceUrl(source?.sourceUrl || '');
              if (!mediaUrl || !looksPlayableMediaUrl(mediaUrl) || seen.has(mediaUrl)) return null;
              seen.add(mediaUrl);
              const qualityMatch = String(source?.sourceName || '').match(/(360|480|720|1080|1440|2160)/);
              return {
                url: mediaUrl,
                quality: qualityMatch ? `${qualityMatch[1]}p` : 'auto',
                isM3U8: mediaUrl.includes('.m3u8'),
              };
            })
            .filter(Boolean);

          if (!sources.length) {
            return res.status(404).json({ success: false, error: 'No streaming sources found' });
          }

          return res.json({
            success: true,
            data: {
              headers: { Referer: allanimeReferer, Origin: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' },
              provider: allanimeProvider,
              providerPriority,
              sources,
              tracks: [],
              subtitles: [],
            },
          });
        }
        const decodedEpisode = decodeProviderId(episodeIdParam);

        const category = req.query.category === 'dub' ? 'dub' : 'sub';
        const serverParam = req.query.server ? `&server=${encodeURIComponent(String(req.query.server))}` : '';
        let usedProvider = decodedEpisode.provider;
        let payload = null;
        let lastWatchError = null;
        const watchProviders = providerCandidatesForValue(episodeIdParam);
        for (const providerName of watchProviders) {
          try {
            payload = await consumetGet(
              `/anime/${providerName}/watch/${encodeURIComponent(decodedEpisode.rawId)}?category=${category}${serverParam}`,
            );
            usedProvider = providerName;
            break;
          } catch (err) {
            lastWatchError = err;
          }
        }

        if (!payload) {
          throw lastWatchError || new Error('Failed to resolve sources from all providers');
        }

        const baseTracks = normalizeTracks(payload);
        const tracks = await enrichTracksFromServers(usedProvider, decodedEpisode.rawId, category, baseTracks);

        const data = {
          headers: payload?.headers || { Referer: 'https://www.animesaturn.cx/' },
          provider: usedProvider,
          providerPriority,
          sources: (Array.isArray(payload?.sources) ? payload.sources : [])
            .map((s) => {
              const url = sanitizeMediaUrl(s?.url);
              return {
              url,
              quality: s.quality || 'auto',
              isM3U8: typeof s.isM3U8 === 'boolean' ? s.isM3U8 : String(url || '').includes('.m3u8'),
            };
            })
            .filter((s) => Boolean(s.url)),
          tracks,
          subtitles: tracks,
          download: payload?.download,
        };

        if (!data.sources.length) {
          return res.status(404).json({ success: false, error: 'No streaming sources found' });
        }

        return res.json({ success: true, data });
      }
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

    switch (action) {
      case 'home':
        return res.json({ success: true, data: await hianime.getHomePage() });

      case 'search': {
        if (!req.query.q) return res.status(400).json({ error: 'Missing q' });
        return res.json({ success: true, data: await hianime.search(req.query.q, parseInt(req.query.page) || 1) });
      }

      case 'suggestions': {
        if (!req.query.q) return res.status(400).json({ error: 'Missing q' });
        return res.json({ success: true, data: await hianime.searchSuggestions(req.query.q) });
      }

      case 'info': {
        if (!req.query.id) return res.status(400).json({ error: 'Missing id' });
        return res.json({ success: true, data: await hianime.getInfo(req.query.id) });
      }

      case 'episodes': {
        if (!req.query.id) return res.status(400).json({ error: 'Missing id' });
        return res.json({ success: true, data: await hianime.getEpisodes(req.query.id) });
      }

      case 'servers': {
        if (!req.query.episodeId) return res.status(400).json({ error: 'Missing episodeId' });
        return res.json({ success: true, data: await hianime.getEpisodeServers(req.query.episodeId) });
      }

      case 'sources': {
        if (!req.query.episodeId) return res.status(400).json({ error: 'Missing episodeId' });
        const _eid = req.query.episodeId;
        const _cat = req.query.category || 'sub';
        
        // First, check which servers are actually available for this episode.
        // StreamTape (id=3) and StreamSB (id=5) are rarely listed on hianimez.to.
        // Most episodes only have hd-1 (id=4), hd-2 (id=1), hd-3 (id=6).
        let availableServers = [];
        try {
          const serverData = await hianime.getEpisodeServers(_eid);
          const serverList = _cat === 'dub' ? serverData.dub : serverData.sub;
          availableServers = (serverList || []).map(s => s.serverName);
          console.log(`[aniwatch] Available ${_cat} servers for ${_eid}: ${availableServers.join(', ')}`);
        } catch (srvErr) {
          console.warn(`[aniwatch] Could not fetch servers: ${srvErr.message}`);
          // Default to trying hd-1 and hd-2 if servers check fails
          availableServers = ['hd-1', 'hd-2'];
        }
        
        // Build ordered server list: non-MegaCloud first, then MegaCloud LAST.
        // aniwatch only handles: hd-1 (serverId=4), hd-2 (serverId=1), 
        // streamsb (serverId=5), streamtape (serverId=3).
        // hd-3 (serverId=6) is NOT in the aniwatch switch — skip it.
        // hd-2 (MegaF/netmagcdn.com) is more reliable than hd-1 (MegaCloud rotating domains).
        // hd-1 (MegaCloud) is tried LAST as it uses ads and rotating CDN domains.
        const knownExtractors = ['streamtape', 'streamsb', 'hd-2', 'hd-1'];
        const serversToTry = knownExtractors.filter(s => availableServers.includes(s));
        // If none match (shouldn't happen), fall back to hd-2 (more reliable)
        if (serversToTry.length === 0) serversToTry.push('hd-2');
        
        console.log(`[aniwatch] Will try extractors: ${serversToTry.join(' → ')}`);
        
        let lastError = null;
        const PER_SERVER_TIMEOUT = 10000; // 10s max per extractor
        
        for (const server of serversToTry) {
          // Stop processing if the client disconnected (e.g., rapid episode change)
          if (req.socket.destroyed) {
            console.log('[aniwatch] Client disconnected, stopping extractor loop');
            return;
          }
          try {
            const srcData = await Promise.race([
              withRetry(
                () => hianime.getEpisodeSources(_eid, server, _cat),
                { retries: 1, delay: 800, label: `sources-${server}` }
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`${server} extractor timed out after ${PER_SERVER_TIMEOUT/1000}s`)), PER_SERVER_TIMEOUT))
            ]);
            if (req.socket.destroyed) return; // Check again after async work
            if (srcData && srcData.sources && srcData.sources.length > 0) {
              console.log(`[aniwatch] Sources resolved via server: ${server} (${srcData.sources.length} sources)`);
              srcData._usedServer = server;
              srcData._availableServers = availableServers;
              srcData._triedServers = serversToTry;
              
              // For MegaCloud servers (hd-1/hd-2), resolve embed URL for iframe fallback.
              if (server === 'hd-1' || server === 'hd-2') {
                try {
                  const epNum = _eid.includes('?ep=') ? _eid.split('?ep=')[1] : _eid;
                  const srvResp = await fetch(
                    `https://hianimez.to/ajax/v2/episode/servers?episodeId=${epNum}`,
                    { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://hianimez.to/watch/${_eid}` } }
                  );
                  if (srvResp.ok) {
                    const srvJson = await srvResp.json();
                    const srvHtml = srvJson?.html || '';
                    const srvNameToId = { 'hd-1': '4', 'hd-2': '1' };
                    const targetServerId = srvNameToId[server] || '4';
                    const re = new RegExp(`data-type="${_cat}"\\s+data-id="(\\d+)"\\s+data-server-id="${targetServerId}"`);
                    const match = re.exec(srvHtml);
                    const sourceId = match?.[1];
                    if (sourceId) {
                      const ajaxResp = await fetch(
                        `https://hianimez.to/ajax/v2/episode/sources?id=${sourceId}`,
                        { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://hianimez.to/' } }
                      );
                      if (ajaxResp.ok) {
                        const ajaxData = await ajaxResp.json();
                        if (ajaxData?.link) {
                          srcData.embedURL = ajaxData.link.replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                          console.log(`[aniwatch] Embed URL resolved: ${srcData.embedURL.substring(0, 60)}`);
                        }
                      }
                    }
                  }
                } catch (embedErr) {
                  console.warn('[aniwatch] Could not resolve embed URL:', embedErr.message);
                }
              }
              
              return res.json({ success: true, data: srcData });
            }
          } catch (err) {
            console.warn(`[aniwatch] Server "${server}" failed for ${_cat}: ${err.message}`);
            lastError = err;
          }
        }
        // All servers failed
        throw lastError || new Error('All servers/extractors failed');
      }

      case 'category': {
        if (!req.query.name) return res.status(400).json({ error: 'Missing name' });
        return res.json({ success: true, data: await hianime.getCategoryAnime(req.query.name, parseInt(req.query.page) || 1) });
      }

      case 'schedule': {
        if (!req.query.date) return res.status(400).json({ error: 'Missing date' });
        return res.json({ success: true, data: await hianime.getEstimatedSchedule(req.query.date) });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[aniwatch] Adapter error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Consumet API proxy (for anime metadata: search, info, episodes)

app.use('/consumet', createProxyMiddleware({
  target: CONSUMET_API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/consumet': '', // Remove /consumet prefix when forwarding
  },
  onProxyRes: (proxyRes) => {
    proxyRes.headers['access-control-allow-origin'] = '*';
  },
}));

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

// Fetch anime info using aniwatch npm package directly
async function getAnimeInfo(animeSlug) {
  try {
    const data = await hianime.getInfo(animeSlug);
    return {
      malId: data?.anime?.info?.malId || 0,
      title: data?.anime?.info?.name || animeSlug
    };
  } catch (error) {
    console.error('[getAnimeInfo] Scraper error, trying old API:', error.message);
    // Fallback to old API
    try {
      const response = await fetch(`${OLD_API_URL}/api/v2/hianime/anime/${animeSlug}`);
      if (!response.ok) return null;
      const apiData = await response.json();
      return {
        malId: apiData.data?.anime?.info?.malId || 0,
        title: apiData.data?.anime?.info?.name || animeSlug
      };
    } catch {
      return null;
    }
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Non-blocking startup probe to detect provider degradation early.
  runProviderHealthCheck('startup').catch((err) => {
    console.warn('[provider-health] Startup probe failed:', err?.message || err);
  });
});
