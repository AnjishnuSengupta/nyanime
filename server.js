/**
 * Express server for Render deployment
 * Uses the `aniwatch` npm package for direct scraping (no external API needed)
 * Serves static files and proxies stream requests to bypass CORS
 */

import express from 'express';
import admin from 'firebase-admin';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { HiAnime } from 'aniwatch';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const hianime = new HiAnime.Scraper();

// Old API fallback URL
const OLD_API_URL = process.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com';

// Trust proxy headers (required for Render/Heroku/etc where SSL terminates at load balancer)
app.set('trust proxy', 1);

// MegaCloud ecosystem domains
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike', 'sunburst', 'clearskyline'  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
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
    req.setTimeout(30000, () => { req.destroy(new Error('Request timeout')); });
    req.end();
  });
}

/** Read Node.js Readable stream to UTF-8 string */
async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) { chunks.push(chunk); }
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
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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
      
      const knownExtractors = ['streamtape', 'streamsb', 'hd-1', 'hd-2'];
      const serversToTry = knownExtractors.filter(s => availableServers.includes(s));
      if (serversToTry.length === 0) serversToTry.push('hd-1');
      
      let lastError = null;
      const PER_SERVER_TIMEOUT = 15000;
      
      for (const server of serversToTry) {
        // Stop processing if the client disconnected (e.g., rapid episode change)
        if (req.socket.destroyed) {
          console.log('[aniwatch] Client disconnected (legacy), stopping extractor loop');
          return;
        }
        try {
          const srcData = await Promise.race([
            hianime.getEpisodeSources(eid, server, _cat),
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
    // Legacy path-based routing
    if (req.query.path) return handleLegacyPath(req.query.path, res);

    const action = req.query.action;
    if (!action) return res.status(400).json({ error: 'Missing action param' });

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
        
        // Build ordered server list: non-MegaCloud first, then MegaCloud.
        // aniwatch only handles: hd-1 (serverId=4), hd-2 (serverId=1), 
        // streamsb (serverId=5), streamtape (serverId=3).
        // hd-3 (serverId=6) is NOT in the aniwatch switch — skip it.
        const knownExtractors = ['streamtape', 'streamsb', 'hd-1', 'hd-2'];
        const serversToTry = knownExtractors.filter(s => availableServers.includes(s));
        // If none match (shouldn't happen), fall back to hd-1
        if (serversToTry.length === 0) serversToTry.push('hd-1');
        
        console.log(`[aniwatch] Will try extractors: ${serversToTry.join(' → ')}`);
        
        let lastError = null;
        const PER_SERVER_TIMEOUT = 15000; // 15s max per extractor
        
        for (const server of serversToTry) {
          // Stop processing if the client disconnected (e.g., rapid episode change)
          if (req.socket.destroyed) {
            console.log('[aniwatch] Client disconnected, stopping extractor loop');
            return;
          }
          try {
            const srcData = await Promise.race([
              hianime.getEpisodeSources(_eid, server, _cat),
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
    console.error('[aniwatch] Scraper error:', err.message);
    const legacy = toLegacyPath(req.query);
    if (legacy) {
      console.log('[aniwatch] Falling back to old API...');
      return proxyOldApi(legacy, res);
    }
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Consumet API proxy (for anime metadata: search, info, episodes)
const CONSUMET_API_URL = process.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';

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
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
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
    
    // ── Retry logic for ALL request types when upstream fails ──
    if (!response.ok) {
      console.warn(`[stream-proxy] Upstream returned ${response.status} for ${pathname.substring(0, 60)}`);
      response.stream.resume(); // drain failed response

      for (const ref of refererCandidates) {
        const retryHeaders = { ...upstreamHeaders, 'Referer': ref };

        try {
          const retryResp = await proxyRequest(target.toString(), retryHeaders);

          if (retryResp.ok) {
            // For M3U8, verify it's a valid playlist
            if (isM3U8File) {
              const text = await readStream(retryResp.stream);
              if (/^#EXTM3U/m.test(text)) {
                response = retryResp;
                cachedM3U8Text = text;
                workingReferer = ref;
                console.log(`[stream-proxy] M3U8 retry with Referer=${ref} succeeded`);
                break;
              }
            } else if (!retryResp.contentType.toLowerCase().includes('text/html')) {
              response = retryResp;
              console.log(`[stream-proxy] Segment retry with Referer=${ref} succeeded`);
              break;
            } else {
              retryResp.stream.resume(); // drain
            }
          } else {
            retryResp.stream.resume(); // drain
          }
        } catch { /* ignore individual retry errors */ }
      }

      // Also try without Origin header for M3U8 (some CDNs reject cross-origin)
      if (!response.ok && isM3U8File) {
        for (const ref of refererCandidates) {
          const retryHeaders = { ...upstreamHeaders, 'Referer': ref };
          delete retryHeaders['Origin'];
          try {
            const retryResp = await proxyRequest(target.toString(), retryHeaders);
            if (retryResp.ok) {
              const text = await readStream(retryResp.stream);
              if (/^#EXTM3U/m.test(text)) {
                response = retryResp;
                cachedM3U8Text = text;
                workingReferer = ref;
                console.log(`[stream-proxy] M3U8 retry (no-origin) with Referer=${ref} succeeded`);
                break;
              }
            } else {
              retryResp.stream.resume(); // drain
            }
          } catch { /* ignore */ }
        }
      }
    }

    // Handle HTML responses (CDN error page with 200 OK) for segments
    const isHtmlResp = response.contentType.toLowerCase().includes('text/html');
    if (isHtmlResp && isVideoSegment && response.ok) {
      response.stream.resume(); // drain HTML response
      for (const ref of refererCandidates) {
        const retryHeaders = { ...upstreamHeaders, 'Referer': ref };
        try {
          const retryResp = await proxyRequest(target.toString(), retryHeaders);
          if (retryResp.ok && !retryResp.contentType.toLowerCase().includes('text/html')) {
            response = retryResp;
            console.log(`[stream-proxy] HTML segment retry with Referer=${ref} succeeded`);
            break;
          } else {
            retryResp.stream.resume(); // drain
          }
        } catch { /* ignore */ }
      }
    }
    
    if (!response.ok) {
      response.stream.resume(); // drain
      
      // ── Delayed retry for CDN rate-limiting (400/403) ──
      // MegaCloud CDN blocks datacenter IPs temporarily after burst traffic.
      // Wait a few seconds and retry — the rate limit may have cleared.
      // Only for M3U8 manifests (the critical first request); segments are
      // too numerous to delay-retry and usually work once the manifest loads.
      if ((response.status === 400 || response.status === 403) && isM3U8File) {
        const altUserAgents = [
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        ];
        const delayMs = [3000, 5000]; // 3s, then 5s backoff
        for (let i = 0; i < delayMs.length; i++) {
          console.log(`[stream-proxy] CDN blocked (${response.status}), waiting ${delayMs[i]/1000}s before delayed retry ${i+1}/${delayMs.length}...`);
          await new Promise(r => setTimeout(r, delayMs[i]));
          try {
            const delayedResp = await proxyRequest(target.toString(), {
              ...upstreamHeaders,
              'User-Agent': altUserAgents[i % altUserAgents.length],
              'Referer': referer,
            });
            if (delayedResp.ok) {
              const text = await readStream(delayedResp.stream);
              if (/^#EXTM3U/m.test(text)) {
                response = delayedResp;
                cachedM3U8Text = text;
                console.log(`[stream-proxy] Delayed retry ${i+1} succeeded after ${delayMs[i]/1000}s!`);
                break;
              }
            } else {
              delayedResp.stream.resume();
            }
          } catch { /* ignore */ }
        }
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
      // Copy relevant headers
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
        const val = response.getHeader(h);
        if (val) res.set(h, val);
      });
      
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
    
    // Validate M3U8 content
    if (!text.includes('#EXTM3U') && !text.includes('#EXT')) {
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
});
