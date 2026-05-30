/**
 * Express server for Render deployment
 * Uses Consumet provider adapters for anime metadata/sources
 * Serves static files and proxies stream requests to bypass CORS
 */
import 'dotenv/config';
import express from 'express';
import { Readable } from 'stream';
import fs from 'fs';
import { spawn, execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'node:dns';
import https from 'https';
import http from 'http';
import os from 'os';
import zlib from 'node:zlib';
import compression from 'compression';
import helmet from 'helmet';
import WebTorrent from 'webtorrent';
// Compatibility check for different WebTorrent versions/exports
const WebTorrentClass = WebTorrent.WebTorrent || WebTorrent;
import crypto from 'crypto';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';



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
  try {
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
} catch (err) {
  dns.lookup(hostname, options, callback);
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

// Cache for resolved streaming links and metadata (TTL: 1 hour)
const LINK_CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function getCached(key) {
  const entry = LINK_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    LINK_CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  LINK_CACHE.set(key, {
    value,
    expiry: Date.now() + CACHE_TTL,
  });
}

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

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}


// ============================================================================
// PYTHON MICROSERVICES INTEGRATION (Single Instance Consolidation)
// ============================================================================
// Automatically spawn internal Python microservices inside the Node.js container
// to bypass Cloudflare using curl_cffi, without needing separate Render instances.
if (process.env.NODE_ENV === 'production') {
  const venvPython = fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python3'))
    ? path.join(__dirname, 'venv', 'bin', 'python3')
    : 'python3';

  function spawnPythonService(dirName, port) {
    console.log(`[system] Spawning Python service ${dirName} on port ${port}...`);
    const proc = spawn(venvPython, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', port.toString()], {
      cwd: path.join(__dirname, dirName),
      env: { ...process.env, PORT: port.toString() }
    });

    proc.stdout.on('data', (d) => console.log(`[${dirName}] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => console.error(`[${dirName}] ${d.toString().trim()}`));
    proc.on('close', (code) => console.log(`[${dirName}] Exited with code ${code}`));
    return proc;
  }

  // Spawn Anipy API on port 8001 and AnimeKAI API on port 8002
  spawnPythonService('anipy_api_service', 8001);
  spawnPythonService('animekai_api_service', 8002);

  // Override environment variables to point to the local child processes
  process.env.ANIPY_API_URL = 'http://127.0.0.1:8001';
  process.env.ANIMEKAI_API_URL = 'http://127.0.0.1:8002';
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
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
  'dev23app', 'dev24app', 'shop21pro', 'shop22pro',  // Miruro/MegaUp CDN streaming domains
  'gqv', 'rrr',  // MegaUp subdomain prefixes
];

const MIRURO_PIPE_URL = process.env.MIRURO_PIPE_URL || 'https://www.miruro.online/api/secure/pipe';
const MIRURO_PIPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': 'https://www.miruro.online/',
};

function base64UrlEncode(value) {
  return Buffer.from(String(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBuffer(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function base64UrlDecodeToString(value) {
  return base64UrlDecodeToBuffer(value).toString('utf-8');
}

function miruroTranslateId(encodedId) {
  if (!encodedId || typeof encodedId !== 'string') return encodedId;
  try {
    const decoded = base64UrlDecodeToString(encodedId);
    return decoded.includes(':') ? decoded : encodedId;
  } catch {
    return encodedId;
  }
}

function miruroDeepTranslate(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) => miruroDeepTranslate(item));
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'id' && typeof value === 'string') {
        obj[key] = miruroTranslateId(value);
      } else if (value && typeof value === 'object') {
        obj[key] = miruroDeepTranslate(value);
      }
    }
  }
  return obj;
}

function miruroInjectSourceSlugs(data, anilistId) {
  const providers = data?.providers || {};
  for (const [providerName, providerData] of Object.entries(providers)) {
    if (!providerData || typeof providerData !== 'object') continue;
    let episodes = providerData.episodes;
    if (!episodes || typeof episodes !== 'object') {
      if (Array.isArray(episodes)) {
        providerData.episodes = { sub: episodes };
        episodes = providerData.episodes;
      } else {
        continue;
      }
    }

    for (const [category, epList] of Object.entries(episodes)) {
      if (!Array.isArray(epList)) continue;
      for (const ep of epList) {
        if (!ep || typeof ep !== 'object') continue;
        if (typeof ep.id !== 'string' || ep.number === undefined) continue;
        const origId = ep.id;
        const prefix = origId.includes(':') ? origId.split(':')[0] : origId;
        ep.id = `watch/${providerName}/${anilistId}/${category}/${prefix}-${ep.number}`;
      }
    }
  }
  return data;
}

async function miruroPipeRequest(payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const url = `${MIRURO_PIPE_URL}?e=${encodeURIComponent(encoded)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: MIRURO_PIPE_HEADERS, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Miruro pipe ${response.status}: ${text.slice(0, 160)}`);
    }
    const compressed = base64UrlDecodeToBuffer(text.trim());
    const decoded = zlib.gunzipSync(compressed).toString('utf-8');
    return JSON.parse(decoded);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function miruroFetchRawEpisodes(anilistId) {
  const payload = {
    path: 'episodes',
    method: 'GET',
    query: { anilistId },
    body: null,
    version: '0.1.0',
  };
  const data = await miruroPipeRequest(payload);
  return miruroDeepTranslate(data);
}

async function miruroFetchEpisodesWithSlugs(anilistId) {
  const data = await miruroFetchRawEpisodes(anilistId);
  return miruroInjectSourceSlugs(data, anilistId);
}

async function miruroFetchSources({ episodeId, provider, anilistId, category }) {
  const encodedEpisodeId = base64UrlEncode(episodeId);
  const payload = {
    path: 'sources',
    method: 'GET',
    query: { episodeId: encodedEpisodeId, provider, category, anilistId },
    body: null,
    version: '0.1.0',
  };
  const data = await miruroPipeRequest(payload);
  return miruroDeepTranslate(data);
}

async function miruroFetchWatchSources(provider, anilistId, category, slug) {
  const data = await miruroFetchRawEpisodes(anilistId);
  const provData = data?.providers?.[provider] || {};
  const epList = provData?.episodes?.[category] || [];
  let targetId = null;
  for (const ep of epList) {
    if (!ep?.id || ep.number === undefined) continue;
    const prefix = String(ep.id).includes(':') ? String(ep.id).split(':')[0] : String(ep.id);
    const generated = `${prefix}-${ep.number}`;
    if (generated === slug) {
      targetId = ep.id;
      break;
    }
  }
  if (!targetId) {
    throw new Error(`Miruro episode slug not found: ${slug}`);
  }
  return miruroFetchSources({ episodeId: targetId, provider, anilistId, category });
}

function getRenderServiceUrl(serviceName) {
  if (!process.env.RENDER_EXTERNAL_URL) return '';
  return `https://${serviceName}.onrender.com`;
}

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
      agent: url.protocol === 'https:' ? https.globalAgent : http.globalAgent,
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
    // Handle both async iterable streams and event-based streams
    if (stream[Symbol.asyncIterator]) {
      // Modern Node.js with async iterable streams
      for await (const chunk of stream) { chunks.push(chunk); }
    } else {
      // Older Node.js - use event-based approach
      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        stream.on('end', () => {
          resolve();
        });
        stream.on('error', (err) => {
          reject(err);
        });
      });
    }
  } catch (err) {
    console.warn('[readStream] Stream read error:', err.message);
    // Return what we have so far (partial data is better than crash)
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Buffer Node.js Readable stream with size limit */
async function bufferStream(stream, limit = 25 * 1024 * 1024) { // 25MB default limit
  const chunks = [];
  let totalSize = 0;

  try {
    // Handle both async iterable streams and event-based streams
    if (stream[Symbol.asyncIterator]) {
      // Modern Node.js with async iterable streams
      for await (const chunk of stream) {
        chunks.push(chunk);
        totalSize += chunk.length;
        if (totalSize >= limit) {
          console.warn(`[bufferStream] Stream exceeded buffer limit of ${limit} bytes`);
          break;
        }
      }
    } else {
      // Older Node.js - use event-based approach
      await new Promise((resolve, reject) => {
        stream.on("data", (chunk) => {
          chunks.push(chunk);
          totalSize += chunk.length;
          if (totalSize >= limit) {
            console.warn(`[bufferStream] Stream exceeded buffer limit of ${limit} bytes`);
            stream.destroy(new Error(`Buffer limit exceeded`));
            reject(new Error(`Buffer limit exceeded`));
          }
        });
        stream.on("end", () => {
          resolve();
        });
        stream.on("error", (err) => {
          reject(err);
        });
      });
    }
  } catch (err) {
    console.warn(`[bufferStream] Stream read error:`, err.message);
    // Return what we have so far (partial data is better than crash)
  }
  return Buffer.concat(chunks);
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

// AniFlix API — in-memory cached routes (avoids rate limiting: 15 req/min)
const aniflixCache = new Map();
const ANIFLIX_TTL = 5 * 60 * 1000;
const deadHosts = new Map();
const DEAD_HOST_TTL = 5 * 60 * 1000;

app.get('/api/anime/:anilistId/episodes', async (req, res) => {
  let anilistId = req.params.anilistId;
  const audioType = req.query.audio === 'dub' ? 'dub' : 'sub';
  
  // Nyanime frontend passes Jikan MAL ID. Map it to AniList ID.
  const malId = req.params.anilistId; // preserve original MAL id for Jikan lookups
  const mappingKey = `mal_to_anilist:${anilistId}`;
  let animeTitle = '';
  let animeTitleRo = '';
  let jikanEpisodeCount = 0; // authoritative episode count from Jikan/MAL
  const cachedMapping = aniflixCache.get(mappingKey);
  
  if (cachedMapping) {
    if (typeof cachedMapping.data === 'object') {
      anilistId = cachedMapping.data.id;
      animeTitle = cachedMapping.data.title;
      animeTitleRo = cachedMapping.data.titleRo || '';
      jikanEpisodeCount = cachedMapping.data.episodeCount || 0;
    } else {
      anilistId = cachedMapping.data;
    }
  }

  if (!animeTitle) {
    // Fetch title from AniList using MAL id
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query($id: Int) { Media(idMal: $id, type: ANIME) { id episodes title { romaji english } } }',
          variables: { id: parseInt(malId, 10) }
        }),
        signal: AbortSignal.timeout(5000)
      });
      const d = await r.json();
      if (d?.data?.Media?.id) {
        const titleData = d.data.Media.title;
        animeTitle = titleData.english || titleData.romaji;
        animeTitleRo = titleData.romaji || titleData.english;
        // AniList episodes field is null for ongoing long-running anime; use as hint only
        const anilistEpCount = d.data.Media.episodes || 0;
        anilistId = d.data.Media.id.toString();
        aniflixCache.set(mappingKey, { data: { id: anilistId, title: animeTitle, titleRo: animeTitleRo, episodeCount: anilistEpCount }, ts: Date.now() });
        jikanEpisodeCount = anilistEpCount;
      }
    } catch(e) {
      console.error('[Aniflix] Failed to map MAL to AniList ID / fetch title:', e);
    }

    // Also fetch from Jikan directly for accurate ongoing episode count
    // (AniList often shows null for airing long-running series like One Piece)
    if (malId) {
      try {
        const jikanR = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (jikanR.ok) {
          const jikanData = await jikanR.json();
          const epCount = jikanData?.data?.episodes;
          if (epCount && epCount > jikanEpisodeCount) {
            jikanEpisodeCount = epCount;
            // Update cache with accurate count
            const existing = aniflixCache.get(mappingKey);
            if (existing && typeof existing.data === 'object') {
              existing.data.episodeCount = jikanEpisodeCount;
              aniflixCache.set(mappingKey, existing);
            }
            console.info(`[Jikan] Got episode count for ${animeTitle}: ${jikanEpisodeCount}`);
          }
        }
      } catch(e) {
        console.warn('[Jikan] Failed to fetch episode count:', e.message);
      }
    }
  }

  const key = `episodes:${anilistId}:${audioType}`;
  const cached = aniflixCache.get(key);
  if (cached && Date.now() - cached.ts < ANIFLIX_TTL) {
    return res.json(cached.data);
  }
  let episodes = [];
  try {
    const r = await fetch(
      `https://aniflix.n1yshi.dev/episodes/${anilistId}`,
      { headers: { 'User-Agent': 'nyanime/1.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (r.ok) {
      const resData = await r.json();
      // Parse episodes
      if (resData.providers) {
        const categoryKey = audioType;
        for (const prov of Object.values(resData.providers)) {
          const cat = prov?.episodes?.[categoryKey];
          if (Array.isArray(cat) && cat.length > 0) {
            episodes = cat;
            break;
          }
        }
        if (episodes.length === 0 && categoryKey === 'dub') {
          for (const prov of Object.values(resData.providers)) {
            const cat = prov?.episodes?.['sub'];
            if (Array.isArray(cat) && cat.length > 0) {
              episodes = cat;
              break;
            }
          }
        }
        episodes = episodes.map(ep => ({
          id: ep.id,
          number: Number(ep.number),
          title: ep.title,
          episodeId: ep.id
        }));
      } else if (resData.provider && Array.isArray(resData.episodes)) {
        episodes = resData.episodes.map(ep => {
          const epId = ep.token || ep.slug || ep.episodeId || ep.id;
          const provider = resData.provider.toLowerCase();
          return {
            id: `watch/${provider}/${anilistId}/${audioType}/${epId}`,
            number: Number(ep.number),
            title: ep.title || ep.japaneseTitle,
            episodeId: epId
          };
        });
      }
    }
  } catch (err) {
    console.warn(`[Aniflix] Episodes failed for ${anilistId}: ${err.message}`);
  }

  // Fallback to anipy-api if no episodes
  if (episodes.length === 0 && animeTitle) {
    try {
      console.info(`[Anipy] Falling back to get episodes for "${animeTitle}" (jikan count: ${jikanEpisodeCount})`);
      const anipyApiUrl = process.env.ANIPY_API_URL || 'http://localhost:8001';

      // Build query — pass total_episodes so anipy generates a full sequential list
      let anipyUrl = `${anipyApiUrl}/episodes?title=${encodeURIComponent(animeTitle)}&title_ro=${encodeURIComponent(animeTitleRo)}&audio=${audioType}`;
      if (jikanEpisodeCount > 0) {
        anipyUrl += `&total_episodes=${jikanEpisodeCount}`;
      }

      const r = await fetch(anipyUrl, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const resData = await r.json();
        if (resData.episodes && resData.episodes.length > 0) {
          episodes = resData.episodes.map(ep => ({
            id       : `anipy-${ep.number}`,
            number   : ep.number,
            title    : `Episode ${ep.number}`,
            episodeId: ep.number
          }));
          console.info(`[Anipy] Got ${episodes.length} episodes for "${animeTitle}" (source: ${resData.source || 'provider'})`);
        }
      }
    } catch (err) {
      console.error(`[Anipy] Fallback episodes failed for ${animeTitle}: ${err.message}`);
    }
  }

  if (episodes.length > 0) {
    const data = { episodes };
    aniflixCache.set(key, { data, ts: Date.now() });
    return res.json(data);
  }

  return res.status(502).json({ error: 'Failed to fetch episodes from any provider' });
});

/**
 * GET /api/anime/:malId/next-episode
 *
 * Returns when the next episode of a currently-airing anime will release.
 * Data cascade (most → least accurate):
 *   1. AniList nextAiringEpisode.airingAt — exact Unix timestamp
 *   2. Jikan broadcast day+time — mathematical computation of next occurrence in JST
 *   3. null — caller shows static "releases weekly" label
 */
const nextEpisodeCache = new Map();
const NEXT_EP_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Given a weekday name (e.g. "Sundays") and a time string "HH:MM" in JST (UTC+9),
 * compute the Unix timestamp (seconds) of the next occurrence from now.
 */
function computeNextBroadcastTimestamp(dayName, timeStr) {
  const DAY_MAP = {
    sundays: 0, mondays: 1, tuesdays: 2, wednesdays: 3,
    thursdays: 4, fridays: 5, saturdays: 6
  };
  const targetDay = DAY_MAP[dayName.toLowerCase()];
  if (targetDay === undefined || !timeStr) return null;

  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  // Work in JST (UTC+9 = +540 minutes)
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowUtcMs = Date.now();
  const nowJstMs = nowUtcMs + JST_OFFSET_MS;

  // Build a candidate: this week's targetDay at hours:minutes JST
  const nowJst = new Date(nowJstMs);
  const currentDayJst = nowJst.getUTCDay(); // 0=Sun…6=Sat in JST

  let daysUntil = (targetDay - currentDayJst + 7) % 7;

  // If it's the same day, check if broadcast time has already passed
  if (daysUntil === 0) {
    const broadcastTodayMs = Date.UTC(
      nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(),
      hours - 9, minutes // convert JST → UTC
    );
    // If the time is in the past (even by 1 min), push to next week
    if (broadcastTodayMs <= nowUtcMs + 60000) daysUntil = 7;
  }

  // Next broadcast in UTC milliseconds
  const nextBroadcastMs = Date.UTC(
    nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + daysUntil,
    hours - 9, minutes
  );

  return Math.floor(nextBroadcastMs / 1000); // Unix timestamp in seconds
}

app.get('/api/anime/:anilistId/next-episode', async (req, res) => {
  const { anilistId } = req.params;
  const cacheKey = `next_ep:${anilistId}`;
  const cached = nextEpisodeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < NEXT_EP_TTL) {
    return res.json(cached.data);
  }

  let result = { nextEpisode: null, airingAt: null, source: null, broadcast: null };
  let resolvedMalId = null;

  // --- Tier 1: AniList nextAiringEpisode (exact timestamp) ---
  try {
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($id: Int) {
          Media(id: $id, type: ANIME) {
            idMal
            status
            nextAiringEpisode { airingAt episode }
          }
        }`,
        variables: { id: parseInt(anilistId, 10) }
      }),
      signal: AbortSignal.timeout(5000)
    });
    const d = await r.json();
    const media = d?.data?.Media;
    
    if (media?.idMal) {
      resolvedMalId = media.idMal;
    }

    if (media?.nextAiringEpisode?.airingAt) {
      result.nextEpisode = media.nextAiringEpisode.episode;
      result.airingAt = media.nextAiringEpisode.airingAt;
      result.source = 'anilist';
      console.info(`[NextEp] AniList: ep ${result.nextEpisode} at ${new Date(result.airingAt * 1000).toISOString()}`);
    }
  } catch (e) {
    console.warn('[NextEp] AniList query failed:', e.message);
  }

  // --- Tier 2: Jikan broadcast (mathematical fallback) ---
  if (!result.airingAt && resolvedMalId) {
    try {
      const jr = await fetch(`https://api.jikan.moe/v4/anime/${resolvedMalId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (jr.ok) {
        const jd = await jr.json();
        const data = jd?.data;
        // Only compute for currently-airing anime
        if (data?.status === 'Currently Airing' && data?.broadcast?.day && data?.broadcast?.time) {
          const { day, time, string: broadcastStr } = data.broadcast;
          const airingAt = computeNextBroadcastTimestamp(day, time);
          if (airingAt) {
            // Estimate next episode number from aired count
            const airingEp = data.aired?.prop?.to?.day ? null : null; // Jikan doesn't expose current ep count directly
            result.airingAt = airingAt;
            result.source = 'jikan_broadcast';
            result.broadcast = broadcastStr || `${day} at ${time} (JST)`;
            console.info(`[NextEp] Jikan broadcast fallback: ${result.broadcast}, next=${new Date(airingAt * 1000).toISOString()}`);
          }
        }
      }
    } catch (e) {
      console.warn('[NextEp] Jikan broadcast query failed:', e.message);
    }
  } else if (resolvedMalId) {
    // Enrich with broadcast string from Jikan even when AniList gave us the timestamp
    try {
      const jr = await fetch(`https://api.jikan.moe/v4/anime/${resolvedMalId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (jr.ok) {
        const jd = await jr.json();
        if (jd?.data?.broadcast?.string) {
          result.broadcast = jd.data.broadcast.string;
        }
      }
    } catch (_) { /* non-critical */ }
  }

  nextEpisodeCache.set(cacheKey, { data: result, ts: Date.now() });
  return res.json(result);
});

app.get(/^\/api\/aniflix\/watch\/(.+)$/, async (req, res) => {
  const slug = req.params[0];
  const key = `watch:${slug}`;
  const cached = aniflixCache.get(key);
  // Only serve cached results if they contain real sources, not stale errors
  if (cached && Date.now() - cached.ts < ANIFLIX_TTL && cached.data?.sources?.length > 0) {
    return res.json(cached.data);
  }
  try {
    const r = await fetch(
      `https://aniflix.n1yshi.dev/watch/${slug}`,
      { headers: { 'User-Agent': 'nyanime/1.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return res.status(r.status).json({ error: 'AniFlix upstream error' });
    const raw = await r.json();

    /**
     * Aniflix /watch returns 4 different shapes depending on provider:
     *
     * Shape A — Standard (Miruro/old): { sources: [{file, kind:'captions'}], tracks: [{file,label,kind}] }
     * Shape B — dune/bee: { ssub: { streams: [{url, type:'hls', referer}], subtitles: [{file, label, kind}] }, providerType }
     * Shape C — kiwi: { streams: [{url, type:'hls', quality}], download, providerType }
     * Shape D — ally: { streams: [{url, type:'embed', server}], download, providerType }
     *
     * We normalize all shapes to: { sources: [{url, isM3U8, referer?}], subtitleTracks: [{lang, url}] }
     */
    const data = { ...raw };
    const normSubtitles = (trackArr) => {
      if (!Array.isArray(trackArr)) return [];
      return trackArr
        .filter(t => !t.kind || t.kind === 'captions' || t.kind === 'subtitles')
        .map(t => ({ lang: t.label || t.language || 'English', url: t.file || t.url || '' }))
        .filter(t => t.url);
    };

    // Shape B: ssub / sdub wrapper
    if (raw.ssub || raw.sdub) {
      const audioData = raw.ssub || raw.sdub;
      const streams = audioData.streams || [];
      data.sources = streams
        .filter(s => s.type === 'hls' || s.url?.includes('.m3u8'))
        .map(s => ({ url: s.url, isM3U8: true, referer: s.referer || null }));
      data.subtitleTracks = normSubtitles(audioData.subtitles);
    }
    // Shape C/D: top-level streams array
    else if (Array.isArray(raw.streams)) {
      data.sources = raw.streams
        .filter(s => s.type === 'hls' || s.type === 'embed' || s.url?.includes('.m3u8') || s.url?.includes('.mp4'))
        .map(s => {
          return { url: s.url, type: s.type, isM3U8: s.type === 'hls' || (s.url && s.url.includes('.m3u8')), referer: s.referer || null };
        });
      data.subtitleTracks = normSubtitles(raw.subtitles);
    }
    // Shape A: old sources[] format
    else if (Array.isArray(raw.sources)) {
      data.sources = raw.sources.map(s => ({
        ...s,
        url: s.url || s.file || null,
        isM3U8: (s.url || s.file || '').includes('.m3u8'),
      }));
      data.subtitleTracks = normSubtitles(raw.tracks);
    } else {
      data.sources = [];
      data.subtitleTracks = [];
    }

    console.log(`[aniflix-watch] ${slug} → ${data.sources.length} source(s), ${data.subtitleTracks.length} subtitle track(s)`);

    // Only cache successful responses with real sources
    if (data.sources.length > 0) {
      aniflixCache.set(key, { data, ts: Date.now() });
    }
    return res.json(data);
  } catch (err) {
    console.error('[aniflix-watch] fetch error:', err.message);
    return res.status(502).json({ error: 'AniFlix fetch failed' });
  }
});

// Removed: app.use('/api/aniflix', createProxyMiddleware(...)) — replaced by cached routes above

// ============================================================================
// PLAYBACK ORCHESTRATOR — Unifies AniFlix, Torrents, and Subtitles
// ============================================================================

app.get('/api/anime/:anilistId/playback', async (req, res) => {
  const { anilistId } = req.params;
  const { episode, titleEn, titleRo, audio, isMovie } = req.query;
  const audioType = audio === 'dub' ? 'dub' : 'sub';

  console.info(`[playback-orchestrator] anilistId=${anilistId} episode=${episode} audio=${audioType}`);

  const port = process.env.PORT || 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const [subRes, aniflixEpRes, torrentRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/subtitles?anilistId=${anilistId}&episode=${episode}`),
      fetch(`${baseUrl}/api/anime/${anilistId}/episodes?audio=${audioType}`),
      (titleEn || titleRo) ? fetch(`${baseUrl}/api/torrent-search?${new URLSearchParams({
        title: titleEn || titleRo || '',
        romaji: titleRo || titleEn || '',
        episode: episode || '',
        dub: String(audioType === 'dub'),
        isMovie: String(isMovie === 'true')
      })}`) : Promise.reject('No title provided')
    ]);

    let subtitleTracks = [];
    if (subRes.status === 'fulfilled' && subRes.value.ok) {
      subtitleTracks = await subRes.value.json();
    }

    let aniflixSource = null;
    let epDataCached = null;
    let epsArray = [];
    if (aniflixEpRes.status === 'fulfilled' && aniflixEpRes.value.ok) {
      epDataCached = await aniflixEpRes.value.clone().json().catch(() => null);
      if (epDataCached) {
        if (Array.isArray(epDataCached)) epsArray = epDataCached;
        else if (Array.isArray(epDataCached.episodes)) epsArray = epDataCached.episodes;
        else if (epDataCached.providers) {
          const prov = epDataCached.providers.ally || Object.values(epDataCached.providers)[0];
          if (prov && prov.episodes) {
            epsArray = Array.isArray(prov.episodes) ? prov.episodes : (prov.episodes[audioType] || prov.episodes.sub || []);
          }
        }
      }
      const matchedEp = epsArray.find(ep => ep.number === Number(episode)) || epsArray[Number(episode) - 1];
      
      if (matchedEp && matchedEp.id) {
        const watchId = matchedEp.id.replace(/^watch\//, '');
        const aniflixStart = Date.now();
        const watchRes = await fetch(`${baseUrl}/api/aniflix/watch/${watchId}`);
        if (watchRes.ok) {
          const watchData = await watchRes.json();
          let rawUrl = null;
          let streamHeaders = {};

          if (Array.isArray(watchData.sources) && watchData.sources.length > 0) {
            // Prefer M3U8, then anything else
            const src = watchData.sources.find(s => s.isM3U8) || watchData.sources.find(s => s.type === 'embed') || watchData.sources[0];
            rawUrl = src.url || src.file || src.embedUrl || null;
            if (src.headers) {
              Object.assign(streamHeaders, src.headers);
            }
            if (src.referer) streamHeaders['Referer'] = src.referer;

            if (rawUrl) {
              if (src.type === 'embed') {
                aniflixSource = {
                  url: rawUrl,
                  embedUrl: rawUrl,
                  quality: 'Server 1 (AniFlix Embed)',
                  type: 'embed',
                  isM3U8: false,
                  score: 80,
                  providerName: 'AniFlix',
                  latency: Date.now() - aniflixStart,
                  tracks: watchData.subtitleTracks || []
                };
                console.info(`[playback-orchestrator] AniFlix: success (embed, score 80)`);
              } else {
                const hParam = Object.keys(streamHeaders).length > 0 ? Buffer.from(JSON.stringify(streamHeaders)).toString('base64') : '';
                const proxyUrl = hParam 
                  ? `/stream?url=${encodeURIComponent(rawUrl)}&h=${hParam}`
                  : `/stream?url=${encodeURIComponent(rawUrl)}`;
                
                aniflixSource = {
                  url: proxyUrl,
                  quality: 'Server 1 (AniFlix)',
                  type: 'hls',
                  isM3U8: true,
                  score: 80,
                  providerName: 'AniFlix',
                  latency: Date.now() - aniflixStart,
                  tracks: watchData.subtitleTracks || []
                };
                console.info(`[playback-orchestrator] AniFlix: success (score 80)`);
              }
            }
          } else if (watchData.url && typeof watchData.url === 'string') {
            rawUrl = watchData.url;
            Object.assign(streamHeaders, watchData.headers || {});
            
            const hParam = Object.keys(streamHeaders).length > 0 ? Buffer.from(JSON.stringify(streamHeaders)).toString('base64') : '';
            const proxyUrl = hParam 
              ? `/stream?url=${encodeURIComponent(rawUrl)}&h=${hParam}`
              : `/stream?url=${encodeURIComponent(rawUrl)}`;
            
            aniflixSource = {
              url: proxyUrl,
              quality: 'Server 1 (AniFlix)',
              type: 'hls',
              isM3U8: true,
              score: 80,
              providerName: 'AniFlix',
              latency: Date.now() - aniflixStart,
              tracks: watchData.subtitleTracks || []
            };
            console.info(`[playback-orchestrator] AniFlix: success (score 80)`);
          }
        } else {
          console.info(`[playback-orchestrator] AniFlix watch returned ${watchRes.status}`);
        }
      }
    }

    const sources = [];

    if (torrentRes.status === 'fulfilled' && torrentRes.value.ok) {
      const tData = await torrentRes.value.json();
      let results = [];
      if (Array.isArray(tData)) {
        results = tData;
      } else if (tData && tData.results && Array.isArray(tData.results)) {
        results = tData.results;
      } else if (tData && (tData.magnetLink || tData.magnetUrl || tData.link)) {
        results = [tData];
      }

      // Take top 5 torrent results to avoid cluttering, but keep low seeders
      const topTorrents = results.slice(0, 5);
      
      for (const t of topTorrents) {
        const magnet = t.magnetLink || t.magnetUrl || t.link;
        if (!magnet) continue;

        const seeders = t.seeders || 0;
        // Base score off seeders
        let score = Math.min(seeders * 5, 60); 

        const torrentName = (t.name || t.title || '').toLowerCase();
        
        // Match strictness
        if (titleEn && torrentName.includes(titleEn.toLowerCase())) score += 15;
        else if (titleRo && torrentName.includes(titleRo.toLowerCase())) score += 15;
        
        // Preferred groups bonus
        const PREFERRED_GROUPS = ['subsplease', 'erai-raws', 'judas', 'ember', 'horriblesubs'];
        if (PREFERRED_GROUPS.some(g => torrentName.includes(g))) score += 10;
        
        // Resolution bonus
        if (torrentName.includes('1080p')) score += 10;
        else if (torrentName.includes('720p')) score += 5;

        // Hard episode filter — reject torrents that contain a DIFFERENT episode number
        // This prevents ep 08 from appearing when the user requests ep 11
        const epNum = Number(episode);
        const epFormatted = String(epNum).padStart(2, '0');
        const epFormatted3 = String(epNum).padStart(3, '0');

        // Check if torrent name contains ANY episode-like pattern (- NN [ or _ NN _)
        const epPatternInName = torrentName.match(/[-\s_](\d{2,3})[\s_\[.(]/g);
        if (epPatternInName) {
          const hasCorrectEp = epPatternInName.some(m => {
            const num = m.replace(/[^0-9]/g, '');
            return num === epFormatted || num === epFormatted3 || num === String(epNum);
          });
          if (!hasCorrectEp) {
            console.info(`[playback-orchestrator] Torrent rejected (wrong episode): ${t.name || t.title}`);
            continue; // skip this torrent entirely
          }
        }

        console.info(`[playback-orchestrator] Torrent: seeders=${seeders} score=${score} name="${t.name || t.title}" visible=true`);

        sources.push({
          url: `/api/torrent-stream?magnet=${encodeURIComponent(magnet)}`,
          quality: `Torrent (${seeders} seeders, ${t.quality || t.size || 'Auto'})`,
          type: 'torrent',
          magnetUrl: magnet,
          score: score
        });
      }
    }

    let allanimeSource = null;

    // Fallback: if AniFlix returned 0 sources and the episode came from the ally provider,
    // use the AllAnime show ID directly with the existing AllAnime GraphQL scraper
    if (!aniflixSource && aniflixEpRes.status === 'fulfilled' && aniflixEpRes.value.ok) {
      try {
        const matchedEp = epsArray.find(ep => ep.number === Number(episode)) || epsArray[Number(episode) - 1];

        if (matchedEp?.id || matchedEp?.episodeId) {
          let showId = null;
          let epNum = episode;

          if (matchedEp.episodeId && matchedEp.episodeId.startsWith('allmanga:')) {
            showId = matchedEp.episodeId.split(':')[1];
            epNum = matchedEp.episodeId.split(':')[2] || episode;
          } else if (matchedEp.id) {
            const allyPattern = /(?:watch\/)?ally\/(\d+)\/(?:sub|dub)\/allmanga-(\d+)/;
            const allyMatch = matchedEp.id.match(allyPattern);
            if (allyMatch) {
              // Note: this may be an AniList ID, which fails for AllAnime, but we try anyway.
              showId = allyMatch[1];
              epNum = allyMatch[2];
            }
          }

          if (showId) {
            const allAnimeStart = Date.now();
            // Call the AllAnime action via the existing /aniwatch route
            const allAnimeUrl = `${baseUrl}/aniwatch?action=sources&episodeId=allanime%3A%3A${showId}&server=default&category=${audioType}&episode=${epNum}`;
            const allAnimeRes = await fetch(allAnimeUrl, {
              signal: AbortSignal.timeout(12000)
            });
            if (allAnimeRes.ok) {
              const allAnimeData = await allAnimeRes.json();
              const allanimeStreams = allAnimeData?.sources || [];
              for (const [idx, src] of allanimeStreams.entries()) {
                const srcUrl = src.url || src.file;
                if (!srcUrl || (!srcUrl.includes('.m3u8') && !srcUrl.includes('.mp4'))) continue;
                const headers = src.headers || (src.referer ? { Referer: src.referer } : {});
                const hParam = Object.keys(headers).length > 0
                  ? Buffer.from(JSON.stringify(headers)).toString('base64') : '';
                const proxyUrl = hParam
                  ? `/stream?url=${encodeURIComponent(srcUrl)}&h=${hParam}`
                  : `/stream?url=${encodeURIComponent(srcUrl)}`;
                // Only set the primary allanimeSource on first result; others go into sources[]
                if (idx === 0) {
                  allanimeSource = {
                    url: proxyUrl,
                    quality: `Server 1 (AllAnime ${src.quality || src.server || 'Direct'})`,
                    type: srcUrl.includes('.m3u8') ? 'hls' : 'mp4',
                    isM3U8: srcUrl.includes('.m3u8'),
                    score: 78,
                    providerName: 'AllAnime',
                    latency: Date.now() - allAnimeStart,
                    tracks: allAnimeData?.tracks || []
                  };
                  console.info(`[playback-orchestrator] AllAnime direct: success (score 78)`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[playback-orchestrator] AllAnime fallback failed: ${err.message}`);
      }
    }

    if (aniflixSource) sources.push(aniflixSource);
    if (allanimeSource) sources.push(allanimeSource);

    // Python anipy-api fallback integration
    try {
      const pythonTitle = titleEn || titleRo;
      if (pythonTitle && episode) {
        console.info(`[playback-orchestrator] Attempting anipy-api fallback for "${pythonTitle}" Ep ${episode} (${audioType})`);
        const anipyStart = Date.now();
        const anipyApiUrl = process.env.ANIPY_API_URL || 'http://localhost:8001';
        
        // Timeout 25 seconds so we don't stall the player forever if it hangs
        // (Render instances can be slow to start, and Cloudflare bypass takes time)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        
        const response = await fetch(`${anipyApiUrl}/sources?title=${encodeURIComponent(pythonTitle)}&title_ro=${encodeURIComponent(titleRo || '')}&episode=${episode}&audio=${audioType}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const anipyData = await response.json();
          if (anipyData.sources && anipyData.sources.length > 0) {
            console.info(`[playback-orchestrator] anipy-api returned ${anipyData.sources.length} sources`);
            for (const src of anipyData.sources) {
              const hParam = Object.keys(src.headers || {}).length > 0
                ? Buffer.from(JSON.stringify(src.headers)).toString('base64') : '';
              
              const proxyUrl = hParam
                ? `/stream?url=${encodeURIComponent(src.url)}&h=${hParam}`
                : `/stream?url=${encodeURIComponent(src.url)}`;

              sources.push({
                url         : proxyUrl,
                quality     : `Server 2 (${src.quality})`,
                type        : src.type,
                isM3U8      : src.isM3U8,
                score       : src.score,
                providerName: 'Anipy',
                latency     : Date.now() - anipyStart,
                tracks      : []
              });
            }
          } else {
            console.warn(`[playback-orchestrator] anipy-api no sources: ${anipyData.error || 'Unknown error'}`);
          }
        }
      }
    } catch (err) {
      console.error(`[playback-orchestrator] anipy-api execution failed: ${err.message}`);
    }

    const apiSources = sources.filter(s => s.type !== 'torrent');
    const torrentSources = sources.filter(s => s.type === 'torrent');

    // Deduplicate API sources by providerName (keep highest score)
    const uniqueApiSources = [];
    const providerSeen = new Set();
    apiSources.sort((a, b) => b.score - a.score);
    for (const src of apiSources) {
      if (!src.providerName || !providerSeen.has(src.providerName)) {
        uniqueApiSources.push(src);
        if (src.providerName) providerSeen.add(src.providerName);
      }
    }

    // Rank API sources by latency (fastest first)
    uniqueApiSources.sort((a, b) => (a.latency || 99999) - (b.latency || 99999));

    // Assign anonymous Server X names
    uniqueApiSources.forEach((src, idx) => {
      src.quality = `Server ${idx + 1}`;
    });

    sources.length = 0;
    sources.push(...uniqueApiSources, ...torrentSources);

    console.info(`[playback-orchestrator] primary=${sources[0]?.type || 'none'} secondary=${sources[1]?.type || 'none'} totalSources=${sources.length}`);

    // Merge jimaku subtitles with the highest score source if needed, or return at root level
    // In our player, we'll map top level tracks.
    if (subtitleTracks.length === 0 && aniflixSource && aniflixSource.tracks) {
        subtitleTracks = aniflixSource.tracks;
    }

    return res.json({
      sources,
      tracks: subtitleTracks
    });

  } catch (err) {
    console.error('[playback-orchestrator] Error:', err);
    return res.status(500).json({ error: 'Internal playback orchestration error' });
  }
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

    const idParam = req.query.id;
    if ((action === 'info' || action === 'episodes') && !idParam) {
      return res.status(400).json({ error: 'Missing id param for this action' });
    }


    const ID_SEPARATOR = '::';

    // ═══════════════════════════════════════════════════════════════════════════
    // AllAnime (AllManga) Configuration
    // ═══════════════════════════════════════════════════════════════════════════
    const allanimeApi = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
    const allanimeReferer = 'https://allmanga.to/';

    const allanimeProvider = 'allanime';
    const allanimeDecodeMap = {
      '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
      '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
      '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
      '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
      '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
      '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // AnimeKAI Provider Configuration
    // Use hosted backend API for production, direct scraping for local dev
    // ═══════════════════════════════════════════════════════════════════════════
    const ANIMEKAI_PROVIDER = 'animekai';
    const renderAnimeKaiUrl = getRenderServiceUrl('animekai-api');
    const renderMiruroUrl = getRenderServiceUrl('miruro-api');
    const hostName = String(req.hostname || '');
    const hostHeader = String(req.get('host') || '');
    const isLocalRequest =
      hostName.includes('localhost') ||
      hostName === '127.0.0.1' ||
      hostHeader.includes('localhost') ||
      hostHeader.includes('127.0.0.1');
    const localAnimeKaiUrl = isLocalRequest ? 'http://localhost:8789' : '';
    const localMiruroUrl = isLocalRequest ? 'http://localhost:8000' : '';
    const ANIMEKAI_API_URL = (isLocalRequest && localAnimeKaiUrl)
      ? localAnimeKaiUrl
      : (process.env.ANIMEKAI_API_URL || renderAnimeKaiUrl);
    console.log(`[Server] ANIMEKAI_API_URL: ${ANIMEKAI_API_URL}`);
    const MIRURO_API_URL = (isLocalRequest && localMiruroUrl)
      ? localMiruroUrl
      : (process.env.MIRURO_API_URL || renderMiruroUrl);
    console.log(`[Server] MIRURO_API_URL: ${MIRURO_API_URL}`);
    if (!ANIMEKAI_API_URL) {
      console.warn('[PROD WARNING] ANIMEKAI_API_URL is not set. Falling back to direct scraping, which is often blocked on Render/datacenter IPs.');
    }
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
      console.log(`[callAnimeKaiApi] ${endpoint}`);
      if (!ANIMEKAI_API_URL) {
        console.error('[callAnimeKaiApi] ANIMEKAI_API_URL is not set');
        return null;
      }
      try {
        const url = new URL(endpoint, ANIMEKAI_API_URL);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
          }
        });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s — fail fast to direct scraping fallback
        
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[callAnimeKaiApi] HTTP Error: ${response.status} ${errorText.slice(0, 200)}`);
          throw new Error(`AnimeKAI API returned ${response.status}`);
        }
        
        const data = await response.json();
        // Don't log full response body — can be very large
        if (data.success && data.data) {
          return data.data;
        }
        console.log(`[callAnimeKaiApi] API returned success=false or no data:`, data);
        return null;
      } catch (err) {
        console.error('[AnimeKAI API] Call failed:', err.message);
        return null;
      }
    }


    // Helper: Call Miruro backend API if available
    async function callMiruroApi(endpoint, params = {}) {
      if (!MIRURO_API_URL) {
        return await callMiruroDirect(endpoint);
      }
      
      try {
        const url = new URL(endpoint, MIRURO_API_URL);
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
          throw new Error(`Miruro API returned ${response.status}`);
        }
        
        return await response.json();
      } catch (err) {
        console.error('[Miruro API] Call failed:', err.message);
        return await callMiruroDirect(endpoint);
      }
    }

    async function callMiruroDirect(endpoint) {
      try {
        if (endpoint.startsWith('/episodes/')) {
          const rawId = endpoint.slice('/episodes/'.length);
          const anilistId = parseInt(rawId, 10);
          if (!Number.isNaN(anilistId)) {
            return await miruroFetchEpisodesWithSlugs(anilistId);
          }
        }

        if (endpoint.startsWith('/watch/')) {
          const parts = endpoint.split('/').filter(Boolean);
          if (parts.length >= 5) {
            const provider = parts[1];
            const anilistId = parseInt(parts[2], 10);
            const category = parts[3];
            const slug = parts.slice(4).join('/');
            if (!Number.isNaN(anilistId)) {
              return await miruroFetchWatchSources(provider, anilistId, category, slug);
            }
          }
        }
      } catch (err) {
        console.error('[Miruro Direct] Call failed:', err.message);
      }
      return null;
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

    // Vidsrc fallback for absolute reliability (last resort)
    async function vidsrcSource(malId, episodeNum) {
      if (!malId || !episodeNum) return null;
      const embedUrl = `https://vidsrc.me/embed/anime?mal_id=${malId}&episode=${episodeNum}`;
      return {
        embedUrl,
        sources: [],
        tracks: [],
        provider: 'vidsrc',
      };
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
        if (apiResult) {
          return {
            aniId: apiResult.aniId || apiResult.id || slug,
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
        const response = await fetch(`${ANIMEKAI_URL}/watch/${slug}`, { headers: ANIMEKAI_HEADERS });
        const html = await response.text();
        const syncMatch = html.match(/<script id="syncData"[^>]*>([^<]+)<\/script>/);
        let aniId = '';
        if (syncMatch) {
          try {
            const syncData = JSON.parse(syncMatch[1]);
            aniId = syncData.anime_id || '';
          } catch {}
        }
        const titleMatch = html.match(/<h1[^>]*class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h1>/);
        const title = titleMatch ? titleMatch[2].trim() : '';
        const jname = titleMatch ? titleMatch[1] : '';
        const descMatch = html.match(/<div class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const posterMatch = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/);
        const poster = posterMatch ? posterMatch[1] : '';
        const infoMatch = html.match(/<div class="info">([\s\S]*?)<\/div>/);
        const info = parseAnimeKaiInfoSpans(infoMatch ? infoMatch[1] : '');
        const genres = [];
        const genreSection = html.match(/Genres?:\s*<span[^>]*>([\s\S]*?)<\/span>/i);
        if (genreSection) {
          const genreLinks = genreSection[1].match(/<a[^>]*>([^<]+)<\/a>/g) || [];
          genreLinks.forEach(link => {
            const name = link.match(/>([^<]+)</);
            if (name) genres.push(name[1].trim());
          });
        }
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
          // Keep the full episodeId — backend API expects it to start with "animekai::"
          const apiEpisodeId = episodeId;

          // Extract category from episodeId if present
          const isDub = apiEpisodeId.includes(`${ID_SEPARATOR}dub`);
          const category = isDub ? 'dub' : 'sub';
          
          const apiResult = await callAnimeKaiApi('/aniwatch/sources', { 
            episodeId: apiEpisodeId,
            category,
            server: linkId 
          });
          if (apiResult?.sources && apiResult.sources.length > 0) {
            // embedUrl: prefer the full embed URL from the API response (e.g., https://megaup.nl/e/VIDEO_ID)
            // Fall back to headers.Referer only if it looks like an actual embed URL
            const rawEmbed = apiResult.embedURL || apiResult.headers?.Referer || '';
            const isActualEmbed = rawEmbed.includes('/e/') || rawEmbed.includes('/embed/');
            return {
              embedUrl: isActualEmbed ? rawEmbed : '',
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
          sources: finalData.sources || mediaData.sources || [],
          tracks: finalData.tracks || mediaData.tracks || mediaData.subtitles || [],
          download: finalData.download || mediaData.download || '',
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
      return withRetry(async () => {
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
          throw new Error(`Jikan fetch failed: ${err.message}`);
        }
      }, { label: `Jikan ${path}` });
    };

    // Resolve MAL ID → AniList ID via AniList GraphQL API
    // Jikan does NOT provide AniList IDs, so we must query AniList directly.
    const resolveAniListId = async (malId) => {
      try {
        const query = `query ($malId: Int) { Media(idMal: $malId, type: ANIME) { id } }`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query, variables: { malId: parseInt(malId) } }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await resp.json();
        const anilistId = data?.data?.Media?.id || null;
        if (anilistId) console.log(`[AniList] Resolved MAL ${malId} → AniList ${anilistId}`);
        return anilistId;
      } catch (err) {
        console.error(`[AniList] Failed to resolve MAL ID ${malId}:`, err.message);
        return null;
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

    const allanimeSearch = async (query) => {
      try {
        const vars = {
          search: { allowAdult: false, allowUnknown: false, query },
          limit: 20,
          page: 1,
          translationType: 'sub',
          countryOrigin: 'ALL'
        };
        const data = await allAnimeGraphQL(allanimeSearchQuery, vars);
        return (data?.shows?.edges || []).map(edge => ({
          id: `${allanimeProvider}${ID_SEPARATOR}${edge._id}`,
          name: edge.englishName || edge.name,
          poster: edge.thumbnail,
          type: 'TV',
          episodes: { sub: edge.availableEpisodesDetail?.sub || 0, dub: edge.availableEpisodesDetail?.dub || 0 }
        }));
      } catch (err) {
        console.error('[AllAnime search error]', err.message);
        return [];
      }
    };

    const allanimeInfo = async (showId) => {
      try {
        const vars = { showId };
        const data = await allAnimeGraphQL(allanimeShowQuery, vars);
        const show = data?.show;
        if (!show) return null;
        
        const subCount = show.availableEpisodesDetail?.sub || 0;
        const dubCount = show.availableEpisodesDetail?.dub || 0;
        
        const mappedSub = [];
        for (let i = 1; i <= subCount; i++) {
          mappedSub.push({
            number: i,
            title: `Episode ${i}`,
            episodeId: `${allanimeProvider}${ID_SEPARATOR}${showId}${ID_SEPARATOR}${i}`,
            isFiller: false,
          });
        }
        const mappedDub = [];
        for (let i = 1; i <= dubCount; i++) {
          mappedDub.push({
            number: i,
            title: `Episode ${i}`,
            episodeId: `${allanimeProvider}${ID_SEPARATOR}${showId}${ID_SEPARATOR}${i}${ID_SEPARATOR}dub`,
            isFiller: false,
          });
        }

        return {
          id: `${allanimeProvider}${ID_SEPARATOR}${showId}`,
          name: show.englishName || show.name,
          jname: show.name,
          description: show.description || '',
          poster: show.thumbnail,
          stats: {
            type: show.type || 'TV',
            status: show.status || 'Unknown',
            episodes: { sub: subCount, dub: dubCount },
          },
          genres: show.genres || [],
          episodes: { sub: mappedSub, dub: mappedDub },
          provider: allanimeProvider,
        };
      } catch (err) {
        console.error('[AllAnime info error]', err.message);
        return null;
      }
    };

    const allanimeSources = async (showId, episodeNum, translationType = 'sub') => {
      try {
        const vars = { showId, translationType, episodeString: String(episodeNum) };
        const data = await allAnimeGraphQL(allanimeEpisodeQuery, vars);
        const rawSources = data?.episode?.sourceUrls || [];
        
        const sources = rawSources.map(s => {
          let url = s.sourceUrl;
          if (url.startsWith('--')) {
            const hex = url.slice(2);
            // Try legacy decode first, if it fails or looks too long for legacy, try AES
            if (hex.length < 100) {
              url = decodeAllAnimeSourceUrl(url);
            } else {
              url = decryptAllAnimeSource(hex);
            }
          }
          return {
            url: sanitizeMediaUrl(url),
            name: s.sourceName,
            isM3U8: url.includes('.m3u8')
          };
        }).filter(s => s.url && (s.url.startsWith('http') || s.url.startsWith('//')));
        
        return {
          sources: sources.map(s => ({ url: s.url, quality: s.name, isM3U8: s.isM3U8 })),
          tracks: []
        };
      } catch (err) {
        console.error('[AllAnime sources error]', err.message);
        return null;
      }
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
      
      // Modern AllAnime links often use hex-encoded AES payloads
      // Example: "--[HEX_PAYLOAD]"
      if (trimmed.startsWith('--')) {
        const encoded = trimmed.slice(2).replace(/\s+/g, '');
        // Check if it's the legacy mapping (pairs of 2 chars)
        if (/^[0-9a-f]+$/.test(encoded) && encoded.length % 2 === 0) {
          let decoded = '';
          for (let i = 0; i < encoded.length; i += 2) {
            decoded += allanimeDecodeMap[encoded.slice(i, i + 2).toLowerCase()] || '';
          }
          if (decoded.includes('/clock')) decoded = decoded.replace('/clock', '/clock.json');
          if (decoded.startsWith('//')) decoded = `https:${decoded}`;
          if (decoded.startsWith('/')) decoded = `https://allanime.day${decoded}`;
          return sanitizeMediaUrl(decoded);
        }
        return '';
      }

      if (trimmed.startsWith('//')) return sanitizeMediaUrl(`https:${trimmed}`);
      if (trimmed.startsWith('/')) return sanitizeMediaUrl(`https://allanime.day${trimmed}`);
      return sanitizeMediaUrl(trimmed);
    };

    const decryptAllAnimeSource = (encryptedHex) => {
      try {
        // Key derived from 'Xot36i3lK3:v1' as seen in ani-cli/allanime logic
        const key = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest();
        const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
        
        // AllAnime AES-256-CTR logic:
        // Offset 1 to 12 is the 12-byte IV.
        // We append '00000002' (4 bytes) to make a 16-byte counter block.
        const iv = encryptedBuffer.slice(1, 13);
        const counterSuffix = Buffer.from([0, 0, 0, 2]);
        const counter = Buffer.concat([iv, counterSuffix]);
        
        // Ciphertext starts at offset 13.
        // We also trim the last 16 bytes (often used for verification or padding in some variants,
        // though CTR doesn't need it, AllAnime's buffer structure includes it).
        const data = encryptedBuffer.slice(13, encryptedBuffer.length - 16);
        
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, counter);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (err) {
        console.error('[AllAnime] Decryption failed:', err.message);
        return '';
      }
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

      console.log(`[AggregatedSearch] Searching for "${q}" (page ${page})...`);

      // 1. Fetch from all sources in parallel
      const results = await Promise.allSettled([
        (async () => {
          try {
            const jikanData = await jikanGet(`/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${action === 'suggestions' ? 10 : 25}`);
            return (jikanData?.data || []).map((item) => ({
              id: `jikan${ID_SEPARATOR}${item?.mal_id}`,
              name: item?.title || item?.title_english || '',
              poster: item?.images?.jpg?.image_url || '',
              type: item?.type || 'TV',
              episodes: { sub: item?.episodes || 0, dub: 0 },
              provider: 'jikan'
            }));
          } catch { return []; }
        })(),
        (async () => {
          try {
            const kaiResults = await animeKaiSearch(q);
            return (kaiResults || []).map(item => ({ ...item, provider: ANIMEKAI_PROVIDER }));
          } catch { return []; }
        })(),
        (async () => {
          try {
            const allResults = await allanimeSearch(q);
            return (allResults || []).map(item => ({ ...item, provider: allanimeProvider }));
          } catch { return []; }
        })()
      ]);

      // 2. Merge and deduplicate
      let combined = [];
      const seenNames = new Set();

      results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          res.value.forEach(anime => {
            const normalizedName = anime.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!seenNames.has(normalizedName)) {
              seenNames.add(normalizedName);
              combined.push(anime);
            }
          });
        }
      });

      if (combined.length === 0) {
        return res.status(404).json({ success: false, error: 'No results found' });
      }

      if (action === 'suggestions') {
        return res.json({
          success: true,
          data: combined.slice(0, 10).map((item) => ({ id: item.id, name: item.name, poster: item.poster }))
        });
      }

      return res.json({
        success: true,
        data: {
          currentPage: page,
          totalPages: 1, // Aggregated results don't easily support totalPages
          hasNextPage: false,
          provider: 'aggregated',
          animes: combined
        }
      });
    }


    

    
      if (action === 'info' || action === 'episodes') {
        console.log(`[UnifiedResolver] Action: ${action}, ID: ${idParam}`);

        // 1. Try Miruro first (Fastest & most reliable)
        // Uses direct pipe fallback when MIRURO_API_URL is not configured.
        try {
          // We need an AniList ID for Miruro. If we have a MAL ID (jikan::), resolve via AniList GraphQL.
          let anilistId = null;
          if (idParam.startsWith(`jikan${ID_SEPARATOR}`)) {
            const malId = idParam.slice(`jikan${ID_SEPARATOR}`.length);
            anilistId = await resolveAniListId(malId);
          } else if (idParam.startsWith(`miruro${ID_SEPARATOR}`)) {
            anilistId = idParam.slice(`miruro${ID_SEPARATOR}`.length);
          }

          if (anilistId) {
            console.log(`[UnifiedResolver] Attempting Miruro for AniList ID: ${anilistId}`);
            if (action === 'info') {
              const cacheKey = `miruro_info:${anilistId}`;
              let miruroInfo = getCached(cacheKey);
              if (!miruroInfo) {
                miruroInfo = await callMiruroApi(`/info/${anilistId}`);
                if (miruroInfo) setCached(cacheKey, miruroInfo);
              }
              if (miruroInfo) {
                console.log(`[UnifiedResolver] Miruro Info Success`);
                return res.json({
                  success: true,
                  data: {
                    id: `miruro${ID_SEPARATOR}${anilistId}`,
                    name: miruroInfo.title.romaji || miruroInfo.title.english,
                    jname: miruroInfo.title.native,
                    poster: miruroInfo.coverImage.large,
                    description: miruroInfo.description,
                    stats: {
                      type: miruroInfo.format,
                      status: miruroInfo.status,
                      episodes: { sub: miruroInfo.episodes || 0, dub: 0 },
                    },
                    genres: miruroInfo.genres,
                    episodes: { sub: [], dub: [] },
                    provider: 'miruro',
                    _anilistId: anilistId,
                  },
                });
              }
            } else if (action === 'episodes') {
              const cacheKey = `miruro_eps:${anilistId}`;
              let miruroEps = getCached(cacheKey);
              if (!miruroEps) {
                miruroEps = await callMiruroApi(`/episodes/${anilistId}`);
                if (miruroEps) setCached(cacheKey, miruroEps);
              }
              if (miruroEps && miruroEps.providers) {
                console.log(`[UnifiedResolver] Miruro Episodes Success`);
                // Prefer 'arc' provider (AnimeKAI on Miruro — most reliable),
                // then fall back to providers with the most episodes
                const providerNames = Object.keys(miruroEps.providers);
                const PREFERRED_PROVIDERS = ['arc', 'dune', 'hop', 'kiwi', 'bee'];
                let bestProv = null;
                for (const pref of PREFERRED_PROVIDERS) {
                  if (providerNames.includes(pref)) {
                    const provEps = miruroEps.providers[pref]?.episodes?.sub || [];
                    if (provEps.length > 0) { bestProv = pref; break; }
                  }
                }
                // Fallback: pick provider with most sub episodes
                if (!bestProv) {
                  bestProv = providerNames.reduce((best, name) => {
                    const count = (miruroEps.providers[name]?.episodes?.sub || []).length;
                    const bestCount = (miruroEps.providers[best]?.episodes?.sub || []).length;
                    return count > bestCount ? name : best;
                  }, providerNames[0]);
                }
                console.log(`[UnifiedResolver] Using Miruro provider: ${bestProv}`);
                const category = req.query.category === 'dub' ? 'dub' : 'sub';
                const eps = miruroEps.providers[bestProv]?.episodes?.[category] || miruroEps.providers[bestProv]?.episodes?.sub || [];
                // Construct episode IDs in miruro::anilistId::provider::category::slug format
                // so the sources handler can parse them correctly
                const mappedEps = eps.map(ep => {
                  // ep.id from Miruro looks like "watch/arc/21/sub/animekai-1"
                  // Extract the slug part (last segment)
                  const idParts = (ep.id || '').split('/');
                  const slug = idParts[idParts.length - 1] || `${bestProv}-${ep.number}`;
                  const epCategory = idParts.length >= 4 ? idParts[idParts.length - 2] : category;
                  const epProvider = idParts.length >= 4 ? idParts[1] : bestProv;
                  return {
                    number: ep.number,
                    title: ep.title || `Episode ${ep.number}`,
                    episodeId: `miruro${ID_SEPARATOR}${anilistId}${ID_SEPARATOR}${epProvider}${ID_SEPARATOR}${epCategory}${ID_SEPARATOR}${slug}`,
                    isFiller: ep.filler || false,
                  };
                });
                return res.json({
                  success: true,
                  data: {
                    totalEpisodes: eps.length,
                    provider: 'miruro',
                    episodes: mappedEps,
                  },
                });
              }
            }
          }
        } catch (err) {
          console.error(`[UnifiedResolver] Miruro error: ${err.message}`);
        }



        // 2. Fallback to AnimeKAI (The previous logic)
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
            const searchCacheKey = `kai_search:${animeTitle}`;
            let kaiResults = getCached(searchCacheKey);
            if (!kaiResults) {
              kaiResults = await animeKaiSearch(animeTitle);
              if (kaiResults && kaiResults.length > 0) setCached(searchCacheKey, kaiResults);
            }
            const matchedAnime = findBestAnimeKaiMatch(animeTitle, kaiResults);
            
            if (matchedAnime) {
              const slug = matchedAnime.id.split(ID_SEPARATOR)[1];
              console.log(`[Jikan->AnimeKAI] Matched to AnimeKAI slug: ${slug} (${matchedAnime.name})`);
              
              const infoCacheKey = `kai_info:${slug}`;
              let info = getCached(infoCacheKey);
              if (!info) {
                info = await animeKaiInfo(slug);
                if (info && info.aniId) setCached(infoCacheKey, info);
              }

              if (info && info.aniId) {
                const epsCacheKey = `kai_eps:${info.aniId}:${slug}`;
                let episodes = getCached(epsCacheKey);
                if (!episodes) {
                  episodes = await animeKaiEpisodes(info.aniId, slug);
                  if (episodes && episodes.length > 0) setCached(epsCacheKey, episodes);
                }

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

            // FALLBACK: If AnimeKAI mapping fails, return Jikan metadata
            console.warn(`[Jikan->AnimeKAI] Falling back to Jikan metadata for malId ${malId}`);
            const episodesData = await jikanGet(`/anime/${malId}/episodes`);
            const jikanEpisodes = Array.isArray(episodesData?.data) ? episodesData.data : [];
            const mappedEpisodes = jikanEpisodes.map((ep, idx) => ({
              number: ep?.mal_id || (idx + 1),
              title: ep?.title || `Episode ${ep?.mal_id || (idx + 1)}`,
              episodeId: `jikan${ID_SEPARATOR}${malId}${ID_SEPARATOR}${ep?.mal_id || (idx + 1)}`,
              isFiller: ep?.filler || false,
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
                genres: (anime?.genres || []).map(g => g.name),
                episodes: { sub: mappedEpisodes, dub: [] },
                provider: 'jikan',
              },
            });
          } catch (err) {
            console.error('[Jikan->AnimeKAI error]', err.message);
            
            // 3. LAST RESORT: Try mapping to AllAnime by title
            try {
              const malId = idParam.slice(`jikan${ID_SEPARATOR}`.length);
              const animeData = await jikanGet(`/anime/${malId}`);
              const anime = animeData?.data;
              if (anime) {
                const title = anime.title || anime.title_english;
                console.log(`[Jikan->AllAnime] Attempting fallback for "${title}"`);
                const allResults = await allanimeSearch(title);
                const bestMatch = allResults[0]; // Assuming first is best for fallback
                
                if (bestMatch) {
                  const showId = bestMatch.id.split(ID_SEPARATOR)[1];
                  console.log(`[Jikan->AllAnime] Fallback match found: ${showId}`);
                  const allInfo = await allanimeInfo(showId);
                  
                  if (allInfo) {
                    if (action === 'episodes') {
                      return res.json({
                        success: true,
                        data: {
                          totalEpisodes: allInfo.episodes.sub.length,
                          provider: allanimeProvider,
                          episodes: allInfo.episodes.sub
                        }
                      });
                    }
                    
                    return res.json({
                      success: true,
                      data: {
                        ...allInfo,
                        id: idParam // Preserve original ID so frontend routing stays consistent
                      }
                    });
                  }
                }
              }
            } catch (fallbackErr) {
              console.error('[Jikan->AllAnime Fallback Error]', fallbackErr.message);
            }

            return res.status(502).json({ success: false, error: 'Failed to resolve jikan ID: ' + err.message });
          }
        }


        // Handle AnimeKAI provider
        if (idParam.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
          try {
            const slug = idParam.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length);
            const infoCacheKey = `kai_info:${slug}`;
            let info = getCached(infoCacheKey);
            if (!info) {
              info = await animeKaiInfo(slug);
              if (info && info.aniId) setCached(infoCacheKey, info);
            }
            if (!info || !info.aniId) return res.status(404).json({ success: false, error: 'Anime not found' });

            const epsCacheKey = `kai_eps:${info.aniId}:${slug}`;
            let episodes = getCached(epsCacheKey);
            if (!episodes) {
              episodes = await animeKaiEpisodes(info.aniId, slug);
              if (episodes && episodes.length > 0) setCached(epsCacheKey, episodes);
            }

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

        // Handle AllAnime provider
        if (idParam.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
          const showId = idParam.split(ID_SEPARATOR)[1];
          const info = await allanimeInfo(showId);
          if (info) {
            if (action === 'episodes') {
              const category = req.query.category === 'dub' ? 'dub' : 'sub';
              return res.json({
                success: true,
                data: {
                  totalEpisodes: info.episodes[category]?.length || 0,
                  provider: allanimeProvider,
                  episodes: info.episodes[category] || [],
                },
              });
            }
            return res.json({ success: true, data: info });
          }
        }

        return res.status(404).json({ success: false, error: 'Provider not supported or not found' });

      }


      if (action === 'servers') {
        const episodeIdParam = toInternalEpisodeId(String(req.query.episodeId || ''));
        if (!episodeIdParam) return res.status(400).json({ error: 'Missing episodeId' });
        
        // Handle Miruro provider
        if (episodeIdParam.startsWith(`miruro${ID_SEPARATOR}`)) {
          return res.json({
            success: true,
            data: {
              episodeId: episodeIdParam,
              episodeNo: 0,
              sub: [],
              dub: [],
              raw: [],
              // Miruro handles source resolution internally via the episode ID
              note: "Miruro handles sources directly via the episode ID"
            },
          });
        }

        // Handle AnimeKAI provider
        if (episodeIdParam.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {

            try {
              const parts = episodeIdParam.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length).split(ID_SEPARATOR);
              const slug = parts[0] || '';
              const epToken = parts[1] || '';
              const isDub = parts[2] === 'dub';
              
              const srvCacheKey = `kai_servers:${epToken}:${slug}`;
              let servers = getCached(srvCacheKey);
              if (!servers) {
                servers = await animeKaiServers(epToken, slug);
                if (servers) setCached(srvCacheKey, servers);
              }

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

        // Handle AllAnime provider
        if (episodeIdParam.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
          try {
            const parts = episodeIdParam.split(ID_SEPARATOR);
            const showId = parts[1];
            const epNum = parts[2] || req.query.episode;
            const category = (parts[3] || req.query.category) === 'dub' ? 'dub' : 'sub';
            
            console.log(`[AllAnime] Fetching sources for ${showId} EP ${epNum} (${category})...`);
            const allSources = await allanimeSources(showId, epNum, category);
            if (allSources && allSources.sources.length > 0) {
              return res.json({
                success: true,
                data: {
                  headers: {
                    'Referer': allanimeReferer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                  },

                  sources: allSources.sources,
                  tracks: allSources.tracks || [],
                  subtitles: [],
                  intro: null,
                  outro: null,
                  provider: allanimeProvider,
                },
              });
            }
          } catch (err) {
            console.error('[AllAnime sources error]', err.message);
          }
        }

        // Handle Miruro provider

        if (episodeIdParam.startsWith(`miruro${ID_SEPARATOR}`)) {
          try {
            const anilistId = episodeIdParam.split(ID_SEPARATOR)[1];
            const provider = episodeIdParam.split(ID_SEPARATOR)[2];
            const category = episodeIdParam.split(ID_SEPARATOR)[3];
            const slug = episodeIdParam.split(ID_SEPARATOR)[4];

            console.log(`[UnifiedResolver] Fetching Miruro sources for ${slug}...`);
            const srcCacheKey = `miruro_sources:${provider}:${anilistId}:${category}:${slug}`;
            let sourceData = getCached(srcCacheKey);
            if (!sourceData) {
              sourceData = await callMiruroApi(`/watch/${provider}/${anilistId}/${category}/${slug}`);
              if (sourceData && sourceData.streams) setCached(srcCacheKey, sourceData);
            }
            
            if (!sourceData || !sourceData.streams) {
              console.log(`[Miruro] No sources found, attempting Vidsrc fallback...`);
              try {
                // Resolve AniList ID to MAL ID via Jikan
                const jikanData = await jikanGet(`/anime?q=${anilistId}&limit=1`); // Jikan search can sometimes take AniList ID or we use anime info
                // Actually, a better way to resolve AniList ID is via the anime's info on Jikan
                // But we don't have a direct mapping. Let's try to find it by name.
                const miruroInfo = await callMiruroApi(`/info/${anilistId}`);
                if (miruroInfo && miruroInfo.title.romaji) {
                  const searchData = await jikanGet(`/anime?q=${encodeURIComponent(miruroInfo.title.romaji)}&limit=1`);
                  const malId = searchData?.data?.[0]?.mal_id;
                  if (malId) {
                    const vidsrc = await vidsrcSource(malId, slug); // slug is often the episode number in Miruro sources request
                    if (vidsrc) {
                      return res.json({
                        success: true,
                        data: {
                          headers: {
                            Referer: 'https://vidsrc.me/',
                            Origin: 'https://vidsrc.me/',
                            'User-Agent': 'Mozilla/5.0',
                          },
                          sources: [],
                          tracks: [],
                          subtitles: [],
                          intro: null,
                          outro: null,
                          provider: 'vidsrc',
                          embedUrl: vidsrc.embedUrl,
                        },
                      });
                    }
                  }
                }
              } catch (err) {
                console.error('[Miruro->Vidsrc fallback error]', err.message);
              }
              return res.status(404).json({ success: false, error: 'No streaming sources found on Miruro' });
            }

            const isEmbedUrl = (value) => {
              if (!value || typeof value !== 'string') return false;
              try {
                const url = new URL(value);
                const path = url.pathname.toLowerCase();
                if (path.includes('/iframe/') || path.includes('/embed/')) return true;
                if (path.startsWith('/e/') || path.includes('/e/')) return true; // MegaUp style
                return false;
              } catch {
                return false;
              }
            };

            // Filter streams: only include actual playable URLs (.m3u8/.mp4),
            // exclude iframe/embed URLs (e.g. /embed/, /iframe/, /e/)
            const playableStreams = sourceData.streams.filter(s => {
              if (!s.url) return false;
              if (isEmbedUrl(s.url)) return false;
              const lower = s.url.toLowerCase();
              // Include M3U8, MP4, and CDN-style URLs
              return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.webm') || lower.includes('/media/') || !lower.includes(ANIMEKAI_URL);
            });
            // Use first iframe/embed URL as fallback embedUrl
            const embedStream = sourceData.streams.find(s => isEmbedUrl(s.url));

            // Determine correct Referer from the actual stream CDN hostname.
            // CDNs reject requests with incorrect Referer (e.g. miruro.online).
            // Extract the Referer from the first playable stream URL.
            let streamReferer = 'https://megacloud.blog/';
            if (playableStreams.length > 0) {
              try {
                const streamHost = new URL(playableStreams[0].url).hostname;
                streamReferer = getRefererForHost(streamHost);
              } catch { /* use default */ }
            }

            return res.json({
              success: true,
              data: {
                headers: {
                  'Referer': streamReferer,
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },

                sources: playableStreams.map(s => ({
                  url: s.url,
                  quality: s.quality || 'auto',
                  isM3U8: s.url.includes('.m3u8'),
                })),
                tracks: sourceData.tracks || [],
                subtitles: sourceData.subtitles || [],
                intro: sourceData.intro,
                outro: sourceData.outro,
                embedUrl: embedStream?.url || null,
                embedURL: embedStream?.url || null,
                provider: 'miruro',
              },
            });
          } catch (err) {
            console.error('[Miruro sources error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch sources from Miruro' });
          }
        }

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
            const srvCacheKey = `kai_servers:${epToken}:${slug}`;
            let servers = getCached(srvCacheKey);
            if (!servers) {
              servers = await animeKaiServers(epToken, slug);
              if (servers) setCached(srvCacheKey, servers);
            }

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
            
            const srcCacheKey = `kai_sources:${linkId}:${fullEpisodeId}`;
            let source = getCached(srcCacheKey);
            if (!source) {
              source = await animeKaiSource(linkId, fullEpisodeId);
              if (source && source.sources?.length > 0) setCached(srcCacheKey, source);
            }
            
            // If primary server returned no sources, try remaining servers
            if ((!source || !source.sources?.length) && serverList.length > 1) {
              console.log(`[Jikan->AnimeKAI] Primary server (${linkId}) returned no sources, trying alternate servers...`);
              for (const altServer of serverList) {
                if (altServer.linkId === linkId) continue;
                const altCacheKey = `kai_sources:${altServer.linkId}:${fullEpisodeId}`;
                let altSource = getCached(altCacheKey);
                if (!altSource) {
                  altSource = await animeKaiSource(altServer.linkId, fullEpisodeId);
                  if (altSource && altSource.sources?.length > 0) setCached(altCacheKey, altSource);
                }
                if (altSource && altSource.sources?.length > 0) {
                  console.log(`[Jikan->AnimeKAI] Alternate server ${altServer.name} returned sources`);
                  source = altSource;
                  break;
                }
              }
            }
            
            if (!source || !source.sources?.length) {
              console.log(`[Jikan->AnimeKAI] No sources found, trying Vidsrc fallback...`);
              const vidsrc = await vidsrcSource(malId, episodeNum);
              if (vidsrc) {
                return res.json({
                  success: true,
                  data: {
                    headers: {
                      Referer: 'https://vidsrc.me/',
                      Origin: 'https://vidsrc.me/',
                      'User-Agent': 'Mozilla/5.0',
                    },
                    sources: [],
                    tracks: [],
                    subtitles: [],
                    intro: null,
                    outro: null,
                    provider: 'vidsrc',
                    embedUrl: vidsrc.embedUrl,
                  },
                });
              }
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
                embedURL: source.embedUrl || null,
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
            const srvCacheKey = `kai_servers:${epToken}:${slug}`;
            let servers = getCached(srvCacheKey);
            if (!servers) {
              servers = await animeKaiServers(epToken, slug);
              if (servers) setCached(srvCacheKey, servers);
            }

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
            
            const srcCacheKey = `kai_sources:${linkId}:${episodeIdParam}`;
            let source = getCached(srcCacheKey);
            if (!source) {
              source = await animeKaiSource(linkId, episodeIdParam);
              if (source && source.sources?.length > 0) setCached(srcCacheKey, source);
            }
            
            // If primary server returned no sources, try remaining servers
            // Different servers may use different CDN backends — some may not block datacenter IPs
            if ((!source || !source.sources?.length) && serverList.length > 1) {
              console.log(`[AnimeKAI] Primary server (${linkId}) returned no sources, trying ${serverList.length - 1} alternate servers...`);
              for (const altServer of serverList) {
                if (altServer.linkId === linkId) continue; // Skip the one we already tried
                const altCacheKey = `kai_sources:${altServer.linkId}:${episodeIdParam}`;
                let altSource = getCached(altCacheKey);
                if (!altSource) {
                  altSource = await animeKaiSource(altServer.linkId, episodeIdParam);
                  if (altSource && altSource.sources?.length > 0) setCached(altCacheKey, altSource);
                }
                if (altSource && altSource.sources?.length > 0) {
                  console.log(`[AnimeKAI] Alternate server ${altServer.name} (${altServer.linkId}) returned sources`);
                  source = altSource;
                  break;
                }
              }
            }
            if (!source || !source.sources?.length) {
              console.log(`[AnimeKAI] No sources found, attempting Vidsrc fallback...`);
              try {
                const info = await animeKaiInfo(slug);
                if (info && info.title) {
                  const jikanData = await jikanGet(`/anime?q=${encodeURIComponent(info.title)}&limit=1`);
                  const malId = jikanData?.data?.[0]?.mal_id;
                  if (malId) {
                    const vidsrc = await vidsrcSource(malId, parseInt(episodeIdParam.split(ID_SEPARATOR).pop() || '1'));
                    if (vidsrc) {
                      return res.json({
                        success: true,
                        data: {
                          headers: {
                            Referer: 'https://vidsrc.me/',
                            Origin: 'https://vidsrc.me/',
                            'User-Agent': 'Mozilla/5.0',
                          },
                          sources: [],
                          tracks: [],
                          subtitles: [],
                          intro: null,
                          outro: null,
                          provider: 'vidsrc',
                          embedUrl: vidsrc.embedUrl,
                        },
                      });
                    }
                  }
                }
              } catch (err) {
                console.error('[AnimeKAI->Vidsrc fallback error]', err.message);
              }
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
                embedURL: source.embedUrl || null,
              },
            });
          } catch (err) {
            console.error('[AnimeKAI sources error]', err.message);
            return res.status(502).json({ success: false, error: 'Failed to fetch sources' });
          }
        }

        return res.status(404).json({ success: false, error: 'Provider not supported or not found' });
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
  
  // Fail fast if upstream host is marked dead
  const deadTime = deadHosts.get(target.hostname);
  if (deadTime && Date.now() - deadTime < DEAD_HOST_TTL) {
    console.warn(`[stream-proxy] Rejecting request for dead host: ${target.hostname}`);
    return res.status(503).json({ error: 'Upstream Unreachable', reason: 'CACHED_DEAD_HOST' });
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
   // Do NOT include sec-ch-ua headers — they are Client Hints sent ONLY by real
   // browsers; sending them from a datacenter IP is a strong WAF bot signal.
   // We are keeping only User-Agent and Referer to match the working direct curl request.
   const upstreamHeaders = {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
     'Referer': referer,
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
                         pathname.endsWith('.vtt') || pathname.endsWith('.srt') ||
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

       // If we still need to retry
       if (!response.ok || 
           (response.contentType.toLowerCase().includes('text/html') && !pathname.endsWith('.html'))) {
         
         // Quick referer retries (300ms between each — fast enough to stay responsive)
         const maxRefRetries = isM3U8File ? 3 : 2;
         for (let ri = 0; ri < Math.min(refererCandidates.length, maxRefRetries); ri++) {
           if (ri > 0) await new Promise(r => setTimeout(r, 300));
           const ref = refererCandidates[ri];
           try {
             const retryResp = await proxyRequest(target.toString(), { ...upstreamHeaders, 'Referer': ref });
             
             if (retryResp.ok) {
               if (isM3U8File) {
                 const text = (cachedM3U8Text || await bufferStream(retryResp.stream)).toString('utf-8');
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
               const text = await bufferStream(delayedResp.stream);
               const trimmed = text.toString('utf-8').replace(/^\uFEFF/, '').trim();
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
    }
    
    if (!response.ok) {
      const isCdnBlock = response.status === 403 || response.status === 429;
      console.error(`[stream-proxy] All retries failed. Final: ${response.status} ${response.statusText}${isCdnBlock ? ' (CDN IP block detected)' : ''}`);
      
      if (isVideoSegment && (response.status === 403 || response.status === 429 || response.status >= 500)) {
        return res.status(503).json({ error: 'Upstream CDN failure normalized to 503' });
      }
      
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        status: response.status,
        cdnBlocked: isCdnBlock,  // Frontend uses this to fast-track to embed fallback
      });
    }
    
    const contentType = response.contentType || '';
    
    // Strict HTML rejection for ALL media proxy requests (playlists & segments)
    if (contentType.toLowerCase().includes('text/html') || contentType.toLowerCase().includes('application/xhtml+xml')) {
      response.stream.resume(); // drain
      console.warn(`[stream-proxy] Rejected HTML response upstream: ${target.pathname} (contentType: ${contentType})`);
      return res.status(502).json({ error: 'Upstream returned HTML instead of media' });
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
      if (pathname.endsWith('.ts')) {
        const validateTS = () => {
          return new Promise((resolve, reject) => {
            const onData = (chunk) => {
              response.stream.removeListener('data', onData);
              response.stream.removeListener('error', onError);
              response.stream.pause();
              response.stream.unshift(chunk);
              resolve(chunk[0] === 0x47);
            };
            const onError = (err) => {
              response.stream.removeListener('data', onData);
              response.stream.removeListener('error', onError);
              reject(err);
            };
            response.stream.on('data', onData);
            response.stream.on('error', onError);
          });
        };

        try {
          const isValid = await validateTS();
          if (!isValid) {
            console.warn(`[stream-proxy] Invalid MPEG-TS sync byte for ${pathname}. Aborting.`);
            response.stream.destroy();
            return res.status(502).json({ error: 'Invalid MPEG-TS sync byte' });
          }
        } catch (err) {
          console.error('[stream-proxy] Error reading TS chunk:', err);
          return res.status(502).json({ error: 'Error reading segment data' });
        }
      }
      const inferDirectMediaType = (upstreamContentType, pathnameValue) => {
        const ct = String(upstreamContentType || '').toLowerCase();
        const lowerPath = String(pathnameValue || '').toLowerCase();
        const isUnknownBinary = !ct || ct.includes('application/octet-stream');
        const looksLikeDirectVideoPath = /\/media\d*\/videos\//.test(lowerPath) || /\/videos\//.test(lowerPath);

        if (!isUnknownBinary) return upstreamContentType;
        if (lowerPath.endsWith('.vtt')) return 'text/vtt';
        if (lowerPath.endsWith('.srt')) return 'text/plain';
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
      
      if (target.pathname.toLowerCase().endsWith('.srt')) {
        res.set('Content-Type', 'text/vtt');
        try {
          const srtBuffer = await bufferStream(response.stream);
          let srtText = srtBuffer.toString('utf-8');
          // Convert SRT timestamps (00:00:00,000) to VTT (00:00:00.000)
          srtText = 'WEBVTT\n\n' + srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
          return res.send(srtText);
        } catch(err) {
          console.error('[stream-proxy] Error converting SRT to VTT:', err);
          return res.status(500).end();
        }
      }
      
      // Pipe the upstream response directly to Express response
      response.stream.pipe(res);
      response.stream.on('error', (err) => {
        console.error('[stream-proxy] Stream error:', err);
        res.end();
      });
      return;
    }
    
    // For M3U8 playlists, read and rewrite URLs
    const text = cachedM3U8Text || await bufferStream(response.stream);
    const textStr = text.toString('utf-8');
    
    // Validate M3U8 content — handle BOM and leading whitespace
    const trimmedM3U8 = textStr.replace(/^\uFEFF/, '').trim();
    if (!trimmedM3U8.startsWith('#EXTM3U') && !trimmedM3U8.includes('#EXT')) {
      console.warn('[stream-proxy] M3U8 validation failed — content does not look like a playlist');
      res.set('Content-Type', contentType || 'text/plain');
      return res.send(textStr);
    }
    
    // Rewrite URLs in M3U8 playlist to go through our proxy
    const baseUrl = new URL('.', target.toString()).toString();
    // Use X-Forwarded-Proto header to detect HTTPS (Render/Heroku/etc terminate SSL at load balancer)
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const proxyBase = `${protocol}://${req.get('host')}/stream?`;
    const headersB64 = Buffer.from(JSON.stringify({ Referer: workingReferer })).toString('base64');
    
    // First pass: rewrite URI="..." inside tag lines (#EXT-X-KEY, #EXT-X-MAP, etc.)
    const firstPass = textStr.replace(/URI="([^"]+)"/g, (_match, uri) => {
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
    const code = error.code || '';
    const msg = error.message || '';
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN' || msg === 'Request timeout') {
      const hostname = target.hostname;
      console.warn(`[stream-proxy] Upstream host ${hostname} is dead. Marking as failed.`);
      deadHosts.set(hostname, Date.now());
      // Invalidate aniflix cache entries containing this host
      for (const [key, cached] of aniflixCache.entries()) {
        if (cached.data?.sources?.some(s => s.url && s.url.includes(hostname))) {
          aniflixCache.delete(key);
          console.log(`[stream-proxy] Invalidated cache for ${key} due to dead host`);
        }
      }
      return res.status(503).json({ error: 'Upstream Unreachable', reason: code || 'TIMEOUT' });
    }
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

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE TORRENT STREAMING (WebTorrent over native TCP)
// ═══════════════════════════════════════════════════════════════════════════

// Normalize magnet link to infohash for consistent lookups
function getInfoHash(magnet) {
  const match = magnet.match(/btih:([a-zA-Z0-9]{32,40})/);
  if (!match) return null;
  let hash = match[1].toLowerCase();
  
  // If it's Base32 (32 chars), convert to Hex (40 chars)
  if (hash.length === 32) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    let bits = '';
    for (let i = 0; i < hash.length; i++) {
      const val = alphabet.indexOf(hash[i]);
      if (val === -1) return hash; // Fallback
      bits += val.toString(2).padStart(5, '0');
    }
    let hex = '';
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex.substr(0, 40);
  }
  
  return hash;
}

// Load trackers — use the browser-safe flat list (HTTP/HTTPS/WSS only, no UDP)
// UDP is blocked on Render's free tier and provides zero benefit server-side anyway.
const FALLBACK_TRACKERS = [
  // WSS — highest priority for peer discovery speed
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.webtorrent.dev",
  // HTTPS — anime-specific, reliable
  "https://tr.nyacat.pw:443/announce",
  "https://t.213891.xyz:443/announce",
  "https://1337.abcvg.info/announce",
  "https://tracker.gbitt.info/announce",
  "https://tracker.qu.ax/announce",
  "https://tracker.lilithraws.org/announce",
  "https://tracker.imgoingto.icu/announce",
  "https://trackers.run/announce",
  "https://tracker.bitsearch.to/announce",
  "https://tracker.ccp.ovh/announce",
  "https://tracker.foreverpirates.co:443/announce",
  "https://tracker.babico.name.tr:443/announce",
  // HTTP — anime-specialized
  "http://nyaa.tracker.wf:7777/announce",
  "http://sukebei.tracker.wf:8888/announce",
  "http://open.acgnxtracker.com/announce",
  "http://t.acg.rip:6699/announce",
  "http://1337.abcvg.info:80/announce",
  "http://bt1.archive.org:6969/announce",
  "http://bt2.archive.org:6969/announce",
  "http://tracker.gbitt.info/announce",
  "http://tracker.bt4g.com:2095/announce",
  "http://tracker.openbittorrent.com:80/announce",
  "http://tracker.anirena.com:80/announce",
  "http://open.tracker.cl:1337/announce",
  "http://tracker1.bt.moack.co.kr:80/announce",
  "http://tracker.acgnx.se/announce",
  "http://share.camoe.cn:8080/announce",
  "http://104.143.10.186:8000/announce",
];

let trackers = FALLBACK_TRACKERS;

try {
  const trackersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'trackers.json'), 'utf8'));
  // Use all trackers (including UDP) since we are running server-side
  const allTrackersList = trackersData?.flat_list?.all || trackersData?.flat_list?.webtorrent_browser_only;
  if (Array.isArray(allTrackersList) && allTrackersList.length > 0) {
    trackers = [...new Set([...allTrackersList])];
    console.log(`[torrent] Loaded ${trackers.length} trackers from trackers.json (flat_list.all)`);
  } else {
    console.warn('[torrent] Trackers not found in trackers.json, using hardcoded fallback list');
  }
} catch (err) {
  console.warn('[torrent] Failed to load trackers.json, using hardcoded fallback list:', err.message);
}



const isOnRender = Boolean(process.env.RENDER_EXTERNAL_URL);
const torrentClient = new WebTorrentClass({
  maxConns: isOnRender ? 20 : 150,
  dht: !isOnRender,
  lsd: !isOnRender,
  utp: !isOnRender,
});
// Prevent MaxListenersExceededWarning — torrent streams add multiple listeners per torrent
torrentClient.setMaxListeners(45);

// Map to track torrents currently being added (metadata fetch phase)
const pendingTorrents = new Map();

// Track last access time for torrents to prevent memory leaks on Render
const torrentLastUsed = new Map();

// ── TORRENT CAP ──────────────────────────────────────────────────────────────
// Hard-limit concurrent torrents to 3 on Render's 512 MB free tier.
// Each torrent in metadata-wait can consume 100–200 MB alone.
const MAX_CONCURRENT_TORRENTS = 3;

function evictLruTorrentIfNeeded() {
  const activeTorrents = torrentClient.torrents;
  if (activeTorrents.length < MAX_CONCURRENT_TORRENTS) return;

  // Find the least-recently-used torrent
  let lruHash = null;
  let lruTime = Infinity;
  for (const [hash, time] of torrentLastUsed.entries()) {
    if (time < lruTime) {
      lruTime = time;
      lruHash = hash;
    }
  }

  if (lruHash) {
    const lruTorrent = torrentClient.get(lruHash);
    if (lruTorrent) {
      console.log(`[torrent] Cap reached (${activeTorrents.length}). Evicting LRU: ${lruTorrent.name || lruHash}`);
      lruTorrent.destroy();
      torrentLastUsed.delete(lruHash);
    }
  }
}

// ── MEMORY GUARD ─────────────────────────────────────────────────────────────
// Check RSS every 60s. If over 400 MB, destroy idle torrents.
// If over 450 MB, refuse new torrent adds until memory recedes.
const RSS_WARN_MB = 400;
const RSS_BLOCK_MB = 450; // Lowered from 800 — match actual Render hosting memory ceiling

function getRssMb() {
  return process.memoryUsage().rss / (1024 * 1024);
}

function releaseIdleTorrents() {
  const now = Date.now();
  const idleThreshold = 5 * 60 * 1000; // 5 minutes idle
  torrentClient.torrents.forEach(torrent => {
    const lastUsed = torrentLastUsed.get(torrent.infoHash) || 0;
    if (now - lastUsed > idleThreshold) {
      console.log(`[torrent] Memory pressure: evicting idle torrent ${torrent.name || torrent.infoHash}`);
      torrent.destroy();
      torrentLastUsed.delete(torrent.infoHash);
    }
  });
}

setInterval(() => {
  const rssMb = getRssMb();
  if (rssMb > RSS_WARN_MB) {
    console.warn(`[memory] RSS ${rssMb.toFixed(0)} MB — releasing idle torrents`);
    releaseIdleTorrents();
  }
}, 60_000);

// ── CIRCUIT BREAKER ───────────────────────────────────────────────────────────
// Track consecutive upstream API failures. After 3 failures, skip for 5 min.
const circuitBreakers = new Map(); // provider → { failures, openUntil }

function isCircuitOpen(provider) {
  const cb = circuitBreakers.get(provider);
  if (!cb) return false;
  if (cb.openUntil && Date.now() < cb.openUntil) return true;
  if (cb.openUntil && Date.now() >= cb.openUntil) {
    // Reset after cooldown
    circuitBreakers.set(provider, { failures: 0, openUntil: null });
    return false;
  }
  return false;
}

function recordApiSuccess(provider) {
  circuitBreakers.set(provider, { failures: 0, openUntil: null });
}

function recordApiFailure(provider) {
  const cb = circuitBreakers.get(provider) || { failures: 0, openUntil: null };
  cb.failures = (cb.failures || 0) + 1;
  if (cb.failures >= 3) {
    cb.openUntil = Date.now() + 5 * 60 * 1000; // Trip for 5 minutes
    console.warn(`[circuit-breaker] ${provider} tripped after ${cb.failures} failures. Pausing for 5 min.`);
  }
  circuitBreakers.set(provider, cb);
}

// Cleanup idle torrents every 10 minutes (was 30min/1hr — too slow for Render)
setInterval(() => {
  const now = Date.now();
  const idleTimeout = 20 * 60 * 1000; // 20 minutes idle = evict
  torrentClient.torrents.forEach(torrent => {
    const lastUsed = torrentLastUsed.get(torrent.infoHash) || 0;
    if (now - lastUsed > idleTimeout) {
      console.log(`[torrent] Auto-removing idle torrent: ${torrent.name || torrent.infoHash}`);
      torrent.destroy();
      torrentLastUsed.delete(torrent.infoHash);
    }
  });
}, 10 * 60 * 1000);

// Global error handler for WebTorrent
torrentClient.on('error', (err) => {
  console.error('[torrent] Global Client Error:', err.message);
});

/**
 * Endpoint for streaming video files directly from a torrent magnet link.
 */
app.get('/api/torrent-stream', async (req, res) => {
  const { magnet, episode, torrentFile } = req.query;
  
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    console.log('[torrent] Client disconnected, stopping stream logic');
  });

  if (!magnet && !torrentFile) return res.status(400).json({ error: 'Missing magnet or torrentFile parameter' });
  if (clientDisconnected) return;


  try {
    let torrent;
    
    // 1. Resolve source and check for existing torrent
    const magnetStr = magnet ? String(magnet) : null;
    const infoHash = magnetStr ? getInfoHash(magnetStr) : null;

    if (infoHash) {
      const existing = torrentClient.get(infoHash);
      if (existing && (typeof existing.on === 'function' || typeof existing.once === 'function')) {
        torrent = existing;
        torrentLastUsed.set(torrent.infoHash, Date.now()); // Update access time
        console.log(`[torrent] Reusing existing valid torrent: ${torrent.name || infoHash}`);
      } else if (existing) {
        console.warn(`[torrent] Found existing object for ${infoHash} but it's invalid. Ignoring.`);
      }
    }



    // 2. Add if not found
    if (!torrent) {
      // Check if this torrent is already being added by another request
      if (infoHash && pendingTorrents.has(infoHash)) {
        console.log(`[torrent] Request for ${infoHash} is already pending. Waiting...`);
        torrent = await pendingTorrents.get(infoHash);
      } else {
        const addPromise = (async () => {
          // Memory guard — refuse new adds if RSS is critically high
          const rssMb = getRssMb();
          if (rssMb > RSS_BLOCK_MB) {
            releaseIdleTorrents();
            const rssAfter = getRssMb();
            if (rssAfter > RSS_BLOCK_MB) {
              throw new Error(`Server memory critically high (${rssAfter.toFixed(0)} MB). Try again in a moment.`);
            }
          }
          // Evict the LRU torrent if at the concurrent cap
          evictLruTorrentIfNeeded();

          console.log(`[torrent] Torrent not found in client. Adding... (magnet: ${!!magnetStr}, file: ${!!torrentFile})`);
          
          const addTorrent = async (src, opts = {}) => {
            return new Promise((resolve, reject) => {
              try {
                const t = torrentClient.add(src, opts, (readyTorrent) => {
                  torrentLastUsed.set(readyTorrent.infoHash, Date.now());
                  resolve(readyTorrent);
                });

                if (!t) return reject(new Error('client.add returned nothing'));

                // Initialize last used
                if (t.infoHash) torrentLastUsed.set(t.infoHash, Date.now());

                // Increase metadata timeout for slow discoveries
                const metaTimeout = setTimeout(() => {
                  reject(new Error('Torrent metadata timeout'));
                }, 180000); // 180 seconds

                if (t.ready || t.metadata) {
                  clearTimeout(metaTimeout);
                  return resolve(t);
                }

                t.once('metadata', () => {
                  clearTimeout(metaTimeout);
                  resolve(t);
                });

                t.once('ready', () => {
                  clearTimeout(metaTimeout);
                  resolve(t);
                });

                t.once('error', (err) => {
                  clearTimeout(metaTimeout);
                  if (err.message.includes('duplicate')) {
                    resolve(torrentClient.get(infoHash));
                  } else {
                    reject(err);
                  }
                });
              } catch (err) {
                if (err.message.includes('duplicate')) {
                  resolve(torrentClient.get(infoHash));
                } else {
                  reject(err);
                }
              }
            });
          };

          try {
            let t;
            if (torrentFile) {
              try {
                const resFile = await fetch(String(torrentFile), { signal: AbortSignal.timeout(15000) });
                if (resFile.ok) {
                  const buffer = Buffer.from(await resFile.arrayBuffer());
                  t = await addTorrent(buffer);
                }
              } catch (e) {
                console.warn(`[torrent] File fetch failed, falling back to magnet: ${e.message}`);
              }
            }

            if (!t && magnetStr) {
              t = await addTorrent(magnetStr, { announce: trackers });
            }

            if (!t) throw new Error('Failed to initialize torrent source');
            return t;
          } catch (err) {
            console.error(`[torrent] Add flow failed: ${err.message}`);
            throw err;
          }
        })();

        if (infoHash) pendingTorrents.set(infoHash, addPromise);
        
        try {
          torrent = await addPromise;
          if (clientDisconnected) return res.end();
        } finally {
          if (infoHash) pendingTorrents.delete(infoHash);
        }
      }
    }




    if (!torrent || (typeof torrent.once !== 'function' && typeof torrent.on !== 'function')) {
      console.error('[torrent] CRITICAL: Still got invalid torrent object!', {
        type: typeof torrent,
        hasOnce: !!(torrent && torrent.once),
        hasOn: !!(torrent && torrent.on),
        keys: torrent ? Object.keys(torrent) : []
      });
      throw new Error('Failed to initialize valid torrent source');
    }

    console.log(`[torrent] Active torrent: ${torrent.name || 'loading...'} (${torrent.infoHash})`);





    // 3. Wait for metadata if not ready
    // 3. Wait for metadata if not ready and not already present
    if (!torrent.ready && !torrent.metadata) {
      console.log(`[torrent] Waiting for metadata. InfoHash: ${torrent.infoHash || 'unknown'}`);
      
      const peerLogger = setInterval(() => {
        if (torrent) {
          console.log(`[torrent] Still waiting for metadata... Peers: ${torrent.numPeers}, Progress: ${Math.round(torrent.progress * 100)}%`);
        }
      }, 10000);

      try {
        await new Promise((resolve, reject) => {
          const metaTimeout = setTimeout(() => {
            clearInterval(peerLogger);
            reject(new Error('Torrent metadata timeout'));
          }, 180000); // 180 seconds

          torrent.once('metadata', () => {
            clearInterval(peerLogger);
            clearTimeout(metaTimeout);
            console.log(`[torrent] Metadata received for: ${torrent.name}`);
            resolve();
          });

          torrent.once('error', (err) => {
            clearInterval(peerLogger);
            clearTimeout(metaTimeout);
            reject(err);
          });
        });
        if (clientDisconnected) return res.end();
      } catch (err) {
        clearInterval(peerLogger);
        throw err;
      }

    } else if (!torrent.ready && torrent.metadata) {
      console.log(`[torrent] Metadata already present for ${torrent.name || torrent.infoHash}. Skipping wait.`);
    }


    // Update last used timestamp for the reaper
    torrentLastUsed.set(torrent.infoHash, Date.now());

    // Find all video files
    const videoFiles = (torrent.files || []).filter(f => 
      f.name.endsWith('.mkv') || 
      f.name.endsWith('.mp4') || 
      f.name.endsWith('.webm') ||
      f.name.endsWith('.avi')
    );

    if (videoFiles.length === 0) {
      console.error(`[torrent] No video files in torrent: ${torrent.infoHash}`);
      return res.status(404).json({ error: 'No video files found in torrent' });
    }

    let file;
    if (episode) {
      const epNum = parseInt(episode, 10);
      const ep2 = epNum.toString().padStart(2, '0');
      const ep3 = epNum.toString().padStart(3, '0');
      const epPattern = new RegExp(`(\\D|^)(0*${epNum})(\\D|$)`);
      
      // Try to find file matching episode number
      file = videoFiles.find(f => epPattern.test(f.name)) || 
             videoFiles.find(f => f.name.includes(ep2) || f.name.includes(ep3));
             
      if (file) {
        console.log(`[torrent] Selected file for episode ${episode}: ${file.name}`);
      }
    }

    // Fallback to largest file
    if (!file) {
      file = videoFiles.reduce((prev, current) => 
        (prev.length > current.length) ? prev : current
      );
      console.log(`[torrent] Fallback to largest file: ${file.name}`);
    }

    // PEER WAIT — must happen before res.writeHead.
    // Once 206 headers are sent, we cannot send 503. If there are no peers at that point,
    // createReadStream stalls silently and the browser waits forever.
    // Render's TCP handshake to trackers is slower (~5–8s) so we allow 20s there.
    const isOnRender = Boolean(process.env.RENDER_EXTERNAL_URL);
    const peerWaitMs = isOnRender ? 20000 : 10000;
    if (torrent.numPeers === 0) {
      console.log(`[torrent] No peers for ${file.name}. Waiting up to ${peerWaitMs / 1000}s...`);
      const peerConnected = await new Promise((resolve) => {
        if (torrent.numPeers > 0) return resolve(true);
        const deadline = setTimeout(() => resolve(false), peerWaitMs);
        torrent.once('wire', () => {
          clearTimeout(deadline);
          resolve(true);
        });
      });
      if (!peerConnected) {
        console.log(`[torrent] No peers after ${peerWaitMs / 1000}s for "${file.name}". Returning 503.`);
        return res.status(503).json({ error: 'No peers available', reason: 'no-peers' });
      }
      const speed = torrent.downloadSpeed ? (torrent.downloadSpeed / 1024).toFixed(0) + ' KB/s' : 'unknown';
      console.log(`[torrent] Peer connected (${torrent.numPeers} peers, ${speed}). Starting stream.`);
    } else {
      console.log(`[torrent] Already has ${torrent.numPeers} peers. Starting stream immediately.`);
    }


    // ── Piece Selection and Prioritization ───────────────────────────
    if (torrent.pieces && torrent.pieces.length > 0) {
      // Deselect everything in the torrent to prevent downloading background files
      torrent.deselect(0, torrent.pieces.length - 1, false);
    }
    
    // Calculate piece range matching the chosen file
    const pieceLength = torrent.pieceLength;
    const startPiece = Math.floor(file.offset / pieceLength);
    const endPiece = Math.floor((file.offset + file.length - 1) / pieceLength);
    
    console.log(`[torrent] Prioritizing file "${file.name}" (pieces ${startPiece} to ${endPiece})`);
    torrent.select(startPiece, endPiece, 1);
    
    // Mark the first 5 pieces as critical for immediate download start
    const criticalEnd = Math.min(endPiece, startPiece + 5);
    torrent.critical(startPiece, criticalEnd);

    if (clientDisconnected) return res.end();


    const range = req.headers.range;
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const needsTranscode = fileExt === 'mkv' || fileExt === 'avi';
    // Force transcode only for mkv/avi — mp4/webm are served directly
    const transcode = needsTranscode;

    console.log(`[torrent] File: ${file.name} | Extension: ${fileExt} | Needs transcode: ${needsTranscode}`);


    if (transcode) {
      console.log(`[torrent] Transcoding enabled for ${file.name}`);
      if (clientDisconnected) return res.end();

      // High-performance H264 transcoding:
      // - libx264 with preset ultrafast uses minimal CPU and starts instantly
      // - tune zerolatency minimizes buffer delay
      // - No downscaling to prevent high CPU overhead
      const ffmpegProcess = spawn(ffmpegPath.path, [
        '-analyzeduration', '20M',
        '-probesize', '20M',
        '-i', 'pipe:0',
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
        '-g', '30',           // Force keyframe every 30 frames (~1.25s @ 24fps) — prevents 10s+ stalls
        '-sc_threshold', '0', // Disable scene-cut keyframes — keeps keyframe interval regular
        '-acodec', 'aac',
        '-b:a', '128k',
        '-flags', '+low_delay',
        '-fflags', '+nobuffer+genpts',
        '-threads', '0',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      ]);

      const stream = file.createReadStream();
      
      // Handle read stream errors
      stream.on('error', (err) => {
        console.error(`[torrent-transcode] Read stream error: ${err.message}`);
      });

      // Handle ffmpeg stdin errors (like EPIPE when ffmpeg closes early)
      ffmpegProcess.stdin.on('error', (err) => {
        console.error(`[torrent-transcode] FFmpeg stdin error: ${err.message}`);
      });

      stream.pipe(ffmpegProcess.stdin);

      let headSent = false;
      let ffmpegFailed = false;
      const transcodeStartTime = Date.now();
      const stderrLines = [];

      // Collect stderr to detect crashes early
      ffmpegProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrLines.push(msg);
        console.log(`[ffmpeg-stderr] ${msg.trim()}`);
      });

      // Monitor peers and data during the transcode wait
      const progressInterval = setInterval(() => {
        if (headSent || clientDisconnected) {
          clearInterval(progressInterval);
          return;
        }
        const waitTime = Math.round((Date.now() - transcodeStartTime) / 1000);
        const speed = torrent.downloadSpeed ? (torrent.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s' : '0 MB/s';
        console.log(`[torrent-transcode] Waiting for first chunk (${waitTime}s)... Peers: ${torrent.numPeers}, Speed: ${speed}`);
        
        if (waitTime > 45 && !headSent) {
          console.warn(`[torrent-transcode] Transcode timed out after 45s. FFmpeg stderr:\n${stderrLines.slice(-5).join('')}`);
          clearInterval(progressInterval);
          if (!res.headersSent) res.status(504).json({ error: 'Transcoding timeout - no data received from peers' });
          ffmpegProcess.kill('SIGKILL');
          stream.destroy();
        }
      }, 5000);


      ffmpegProcess.stdout.once('data', (chunk) => {
        clearInterval(progressInterval);
        if (clientDisconnected || headSent) return;
        
        console.log(`[torrent-transcode] First chunk received (${chunk.length} bytes). Sending headers.`);
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Transfer-Encoding': 'chunked'
        });
        res.write(chunk);
        headSent = true;
        ffmpegProcess.stdout.pipe(res);
      });

      ffmpegProcess.on('error', (err) => {
        console.error(`[torrent-transcode] ffmpeg spawn error: ${err.message}`);
        clearInterval(progressInterval);
        stream.destroy();
        if (!headSent && !res.headersSent) res.status(500).json({ error: `FFmpeg spawn failed: ${err.message}` });
      });

      ffmpegProcess.on('exit', (code, signal) => {
        clearInterval(progressInterval);
        stream.destroy();
        if (!headSent && !res.headersSent && code !== 0) {
          const stderr = stderrLines.slice(-8).join('').trim();
          console.error(`[torrent-transcode] ffmpeg exited early (code=${code} signal=${signal}). Stderr:\n${stderr}`);
          res.status(503).json({ error: 'Transcoding failed — encoder not available or format unsupported', details: stderr.slice(-300) });
        }
      });


      req.on('close', () => {
        console.log(`[torrent-transcode] Client disconnected. Killing ffmpeg and cleaning up.`);
        ffmpegProcess.kill('SIGKILL');
        stream.destroy();
        // Remove stale lastUsed entry so LRU reaper doesn't try to re-serve a dead torrent
        if (torrent && torrent.infoHash) {
          torrentLastUsed.delete(torrent.infoHash);
          console.log(`[torrent-transcode] Cleared lastUsed for ${torrent.infoHash}`);
        }
      });
      return;
    }


    const fileSize = file.length;


    // Set content type based on extension
    let contentType = 'video/mp4';
    if (file.name.endsWith('.mkv')) contentType = 'video/x-matroska';
    else if (file.name.endsWith('.webm')) contentType = 'video/webm';

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });

      const stream = file.createReadStream({ start, end });
      stream.on('error', (err) => {
        console.error('[torrent-stream] Stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      const stream = file.createReadStream();
      stream.on('error', (err) => {
        console.error('[torrent-stream] Stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    }
  } catch (error) {
    console.error('[torrent-stream] Error:', error);
    res.status(error.message === 'Torrent metadata timeout' ? 503 : 500).json({ 
      error: 'Torrent streaming failed', 
      details: error.message 
    });
  }
});

/**
 * /api/subtitles — Fetch WebVTT subtitle tracks for an episode from jimaku.cc.
 * Requires a free API token set via the JIMAKU_API_TOKEN env var.
 * On failure, always returns { tracks: [] } — never a 500.
 */
app.get('/api/subtitles', async (req, res) => {
  const { anilistId, episode } = req.query;
  if (!anilistId || !episode) {
    return res.status(400).json({ error: 'Missing anilistId or episode' });
  }

  const jimakuToken = process.env.JIMAKU_API_TOKEN;
  if (!jimakuToken) {
    console.warn('[subtitles] JIMAKU_API_TOKEN not set — skipping subtitle fetch');
    return res.json({ tracks: [] });
  }

  const jimakuHeaders = {
    'Authorization': jimakuToken,
    'User-Agent': 'nyanime/1.0',
  };

  // Detect language from file name — jimaku files are named with group tags and may
  // include language codes. Defaults to 'English' for common fansub release groups.
  const detectLang = (fileName, fileObj) => {
    const lower = fileName.toLowerCase();
    if (lower.includes('japanese') || lower.includes('_jpn') || lower.includes('[jpn]') || lower.includes('.jpn.')) return 'Japanese';
    if (lower.includes('portuguese') || lower.includes('_por') || lower.includes('_br') || lower.includes('[br]')) return 'Portuguese';
    if (lower.includes('spanish') || lower.includes('_spa') || lower.includes('_lat') || lower.includes('[es]')) return 'Spanish';
    if (lower.includes('french') || lower.includes('_fre') || lower.includes('_fra') || lower.includes('[fr]')) return 'French';
    if (lower.includes('german') || lower.includes('_ger') || lower.includes('_deu') || lower.includes('[de]')) return 'German';
    if (lower.includes('arabic') || lower.includes('_ara') || lower.includes('[ar]')) return 'Arabic';
    if (lower.includes('italian') || lower.includes('_ita') || lower.includes('[it]')) return 'Italian';
    if (lower.includes('russian') || lower.includes('_rus') || lower.includes('[ru]')) return 'Russian';
    if (lower.includes('chinese') || lower.includes('_chi') || lower.includes('[zh]')) return 'Chinese';
    // Use file-level language field if the API returns it
    return fileObj.language || 'English';
  };

  try {
    const searchRes = await fetch(
      `https://jimaku.cc/api/entries/search?anilist_id=${anilistId}`,
      { headers: jimakuHeaders, signal: AbortSignal.timeout(8000) }
    );
    if (!searchRes.ok) {
      console.warn(`[subtitles] jimaku.cc search returned ${searchRes.status} for anilistId=${anilistId}`);
      return res.json({ tracks: [] });
    }
    const entries = await searchRes.json();
    if (!Array.isArray(entries) || entries.length === 0) return res.json({ tracks: [] });

    const entryId = entries[0].id;
    const filesRes = await fetch(
      `https://jimaku.cc/api/entries/${entryId}/files?episode=${episode}`,
      { headers: jimakuHeaders, signal: AbortSignal.timeout(8000) }
    );
    if (!filesRes.ok) return res.json({ tracks: [] });
    const files = await filesRes.json();
    if (!Array.isArray(files)) return res.json({ tracks: [] });

    // Collect all subtitle files (vtt, srt, ass)
    const subtitleFiles = files.filter(f =>
      f.name.endsWith('.vtt') || f.name.endsWith('.srt') || f.name.endsWith('.ass')
    );

    if (subtitleFiles.length === 0) return res.json({ tracks: [] });

    // Build track list — English first, deduplicate by language preferring VTT over SRT
    const englishFiles = subtitleFiles.filter(f => detectLang(f.name, f) === 'English');
    const otherFiles = subtitleFiles.filter(f => detectLang(f.name, f) !== 'English');

    const langSeen = new Set();
    const tracks = [];

    for (const f of [...englishFiles, ...otherFiles]) {
      const lang = detectLang(f.name, f);
      // Skip SRT if we already have a VTT for this language (VTT preferred by browser)
      if (langSeen.has(lang) && f.name.endsWith('.srt')) continue;
      langSeen.add(lang);
      tracks.push({ lang, url: f.url });
    }

    if (tracks.length === 0) return res.json({ tracks: [] });

    res.setHeader('Cache-Control', 'public, max-age=3600');
    console.log(`[subtitles] jimaku.cc found ${tracks.length} track(s) for anilistId=${anilistId} ep=${episode}: ${tracks.map(t => t.lang).join(', ')}`);
    return res.json({ tracks });
  } catch (err) {
    console.error('[subtitles] jimaku.cc error:', err.message);
    return res.json({ tracks: [] });
  }
});


/**
 * /api/torrent-search — Server-side AnimeTosho search with streaming-optimised scorer.
 * Called by the frontend before hitting /torrent-stream.
 * Query params: title (english), romaji, episode, dub (bool), isMovie (bool)
 */
app.get('/api/torrent-search', async (req, res) => {
  const { title, romaji, episode, dub, isMovie } = req.query;
  if (!title && !romaji) return res.status(400).json({ error: 'Missing title or romaji param' });

  const epNum = parseInt(episode || '1', 10);
  const isDub = dub === 'true';
  const isMovieMode = isMovie === 'true';
  const ep2 = epNum.toString().padStart(2, '0');
  const ep3 = epNum.toString().padStart(3, '0');

  const cleanTitle = (t) => t
    .replace(/[.:\-!]/g, ' ')
    .replace(/\s(TV|Season|S\d+)\s?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const getBaseTitle = (t) => {
    if (!t) return '';
    const words = t.split(' ');
    if (words.length > 4) {
      return words.slice(0, 4).join(' ');
    }
    return t;
  };

  const cleanTitle1 = cleanTitle(title || '');
  const cleanTitle2 = cleanTitle(romaji || '');
  const baseTitle1 = getBaseTitle(cleanTitle1);
  const baseTitle2 = getBaseTitle(cleanTitle2);

  const titles = [cleanTitle1, cleanTitle2, baseTitle1, baseTitle2]
    .filter((t, i, a) => t && a.indexOf(t) === i);

  const queries = [];
  for (const t of titles) {
    if (isMovieMode) {
      queries.push(`${t} 1080p`);
      queries.push(`${t}`);
    } else if (isDub) {
      queries.push(`${t} ${ep3} 1080p dub`);
      queries.push(`${t} ${ep2} 1080p dub`);
      queries.push(`${t} ${epNum} dub`);
      queries.push(`${t} dub`);
      queries.push(`${t}`);
    } else {
      queries.push(`[SubsPlease] ${t} - ${ep3} (1080p)`);
      queries.push(`[Erai-raws] ${t} - ${ep3} [1080p]`);
      queries.push(`${t} ${ep3} 1080p`);
      queries.push(`${t} ${ep2} 1080p`);
      queries.push(`${t} ${ep3}`);
      queries.push(`${t} ${ep2}`);
      queries.push(`${t} batch`);
      queries.push(`${t} complete`);
      queries.push(`${t}`);
    }
  }

  const PREFERRED_GROUPS = ['subsplease', 'erai-raws', 'judas', 'ember', 'small-subs', 'horriblesubs'];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    // Run all searches in parallel for maximum speed
    const fetchPromises = queries.map(async (query) => {
      const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(query)}`;
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return [];
        const json = await r.json();
        return Array.isArray(json) ? json : [];
      } catch (e) {
        return [];
      }
    });

    const resultsArray = await Promise.all(fetchPromises);
    const rawResults = resultsArray.flat().filter(Boolean);

    if (rawResults.length === 0) {
      clearTimeout(timeoutId);
      return res.json({ results: [] });
    }

    // Deduplicate raw results by infohash to keep unique releases
    const dedupedRaw = [];
    const seenHashesRaw = new Set();
    for (const d of rawResults) {
      const match = d.magnet_uri ? d.magnet_uri.match(/btih:([a-zA-Z0-9]+)/i) : null;
      const hash = match ? match[1].toLowerCase() : d.title;
      if (!seenHashesRaw.has(hash)) {
        seenHashesRaw.add(hash);
        dedupedRaw.push(d);
      }
    }

    const filtered = dedupedRaw.filter(d => {
      const t = (d.title || '').toLowerCase();
      if (!isMovieMode) {
        const isBatch = t.includes('batch') || t.includes('complete') || t.includes('season') || /\bs\d+\b/.test(t) || t.includes('pack') || /(\d{1,3})\s*[-–~]\s*(\d{1,3})/.test(t);
        if (isBatch) {
          // Verify episode range if present
          const rangeMatch = t.match(/(\d{1,3})\s*[-–~]\s*(\d{1,3})/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            if (epNum < start || epNum > end) return false;
          }
        } else {
          // Single episode matching
          const epPat = new RegExp(`(\\D|^)(0*${epNum})(\\D|$)`);
          if (!epPat.test(t)) return false;
        }

        // Match English or Romaji title prefix
        const stripped = (d.title || '')
          .replace(/^\[.*?\]\s*/g, '')
          .replace(/^\(.*?\)[_\s]*/g, '')
          .replace(/_/g, ' ').trim();
        const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const enN = norm(title || '');
        const roN = norm(romaji || '');
        if (!((enN && norm(stripped).startsWith(enN)) || (roN && norm(stripped).startsWith(roN)))) return false;
      } else {
        if (t.includes('sample') || t.includes('trailer')) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      clearTimeout(timeoutId);
      return res.json({ results: [] });
    }

    const scored = filtered.map(d => {
      const sizeMb = (d.total_size || 0) / (1024 * 1024);
      const seeders = d.seeders || 0;
      const tl = (d.title || '').toLowerCase();
      
      // Hard reject HEVC/x265 (unplayable in web browser native stream without external players)
      if (tl.includes('hevc') || tl.includes('x265') || tl.includes('h265')) return { ...d, _score: -999, _sizeMb: sizeMb };

      const seederScore = seeders > 0 ? Math.min(60, Math.log2(seeders + 1) * 10) : 0;
      
      let sizeScore = 0;
      const isBatch = tl.includes('batch') || tl.includes('complete') || tl.includes('season') || /\bs\d+\b/.test(tl) || tl.includes('pack');
      
      if (isBatch) {
        sizeScore = -15; // Minor penalty for large batches
      } else if (sizeMb > 3072) {
        sizeScore = -30; // Large single ep penalty
      } else if (sizeMb > 0) {
        if (sizeMb <= 500) sizeScore = 40;
        else if (sizeMb <= 800) sizeScore = 40 - ((sizeMb - 500) / 300) * 30;
        else sizeScore = Math.max(0, 10 - ((sizeMb - 800) / 600) * 10);
      }

      const groupBonus = PREFERRED_GROUPS.some(g => tl.includes(g)) ? 15 : 0;
      const penalty = seeders === 0 ? -50 : 0; // Heavy penalty for 0 seeders
      
      return { ...d, _score: seederScore + sizeScore + groupBonus + penalty, _sizeMb: sizeMb };
    }).filter(d => d._score > -999);

    if (scored.length === 0) {
      clearTimeout(timeoutId);
      return res.json({ results: [] });
    }

    scored.sort((a, b) => b._score - a._score);

    const uniqueScored = scored; // Already deduped by infohash above
    const best = uniqueScored[0];
    clearTimeout(timeoutId);
    console.log(`[torrent-search] Best: "${best.title}" | ${best._sizeMb.toFixed(0)} MB | ${best.seeders || 0} seeders | score: ${best._score.toFixed(1)}`);
    
    const results = uniqueScored.slice(0, 3).map(t => ({
      magnetLink: t.magnet_uri,
      torrentUrl: t.torrent_url,
      title: t.title,
      seeders: t.seeders || 0,
      sizeMb: Math.round(t._sizeMb),
      fileName: t.torrent_name || t.title,
    }));

    return res.json({
      ...results[0],
      results
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[torrent-search] API search failed:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const rssMb = getRssMb();
  const cbStatus = {};
  for (const [provider, cb] of circuitBreakers.entries()) {
    cbStatus[provider] = {
      failures: cb.failures,
      open: !!(cb.openUntil && Date.now() < cb.openUntil),
      resumesIn: cb.openUntil ? Math.max(0, Math.round((cb.openUntil - Date.now()) / 1000)) + 's' : null
    };
  }
  res.json({
    status: rssMb > RSS_BLOCK_MB ? 'degraded' : 'ok',
    uptime: process.uptime(),
    torrents: torrentClient.torrents.length,
    memoryMb: Math.round(rssMb),
    circuitBreakers: cbStatus,
  });
});

// Cleanup idle torrents every minute
setInterval(() => {
  const now = Date.now();
  torrentClient.torrents.forEach(torrent => {
    const lastAccessed = torrentLastUsed.get(torrent.infoHash);
    
    // Safety: if lastAccessed is missing (new torrent), initialize it and skip
    if (lastAccessed === undefined) {
      torrentLastUsed.set(torrent.infoHash, now);
      return;
    }

    // Remove if idle for more than 60 minutes
    if (now - lastAccessed > 60 * 60 * 1000) {
      console.log(`[torrent] Reaper: Destroying idle torrent: ${torrent.name || torrent.infoHash}`);
      torrentLastUsed.delete(torrent.infoHash);
      try {
        torrent.destroy();
      } catch (err) {
        console.error(`[torrent] Reaper: Error destroying torrent ${torrent.infoHash}:`, err.message);
      }
    }

  });
}, 60000);



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

// Health check — always at /api/health and /health (for Render + UptimeRobot)
// HEAD support is required by UptimeRobot which sends HEAD requests, not GET
app.head('/health', (req, res) => res.sendStatus(200));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'nyanime-api' }));
app.head('/api/health', (req, res) => res.sendStatus(200));
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nyanime-api',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Serve React frontend from dist/ (production build)
// In dev mode, Vite handles the frontend on its own port via concurrently
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('[server] Serving React frontend from dist/');
  app.use(express.static(distDir, { maxAge: '1d', etag: true }));
  // SPA fallback — send index.html for all non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/aniwatch') ||
        req.path.startsWith('/stream') || req.path.startsWith('/torrent-stream') ||
        req.path.startsWith('/proxy') || req.path.startsWith('/subtitle')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.log('[server] No dist/ found — API-only mode (run npm run build first for frontend)');
  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'nyanime-api', version: '1.0.0', time: new Date().toISOString() });
  });
}


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
