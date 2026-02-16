import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Dev-only middleware: handle /aniwatch?action=... using the aniwatch npm package directly
function aniwatchDevPlugin(): Plugin {
  let hianime: any = null;

  return {
    name: 'aniwatch-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url || !req.url.startsWith('/aniwatch')) return next();
          
          const url = new URL(req.url, 'http://localhost');
          const action = url.searchParams.get('action');
          // Also support legacy ?path= for backward compat
          const legacyPath = url.searchParams.get('path');
          
          if (!action && !legacyPath) return next();

          // Lazy-import aniwatch (only when first request hits)
          if (!hianime) {
            try {
              const mod = await import('aniwatch');
              hianime = new mod.HiAnime.Scraper();
              console.log('[aniwatch-dev] Scraper initialized');
            } catch (e) {
              console.error('[aniwatch-dev] Failed to import aniwatch:', e);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Failed to initialize aniwatch scraper' }));
              return;
            }
          }

          const sendJson = (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: true, data }));
          };

          const sendError = (msg: string, status = 500) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: msg }));
          };

          // Handle legacy path-based routing
          if (legacyPath && !action) {
            const p = legacyPath;
            let resolvedAction = '';
            const resolvedParams: Record<string, string> = {};

            if (p.includes('/home')) {
              resolvedAction = 'home';
            } else if (p.includes('/search')) {
              resolvedAction = 'search';
              const match = p.match(/[?&]q=([^&]+)/);
              if (match) resolvedParams.q = decodeURIComponent(match[1]);
              const pageMatch = p.match(/[?&]page=(\d+)/);
              if (pageMatch) resolvedParams.page = pageMatch[1];
            } else if (p.match(/\/anime\/([^/]+)\/episodes/)) {
              resolvedAction = 'episodes';
              const match = p.match(/\/anime\/([^/]+)\/episodes/);
              if (match) resolvedParams.id = match[1];
            } else if (p.includes('/episode/sources')) {
              resolvedAction = 'sources';
              const eid = p.match(/[?&]animeEpisodeId=([^&]+)/);
              if (eid) resolvedParams.episodeId = decodeURIComponent(eid[1]);
              const srv = p.match(/[?&]server=([^&]+)/);
              if (srv) resolvedParams.server = srv[1];
              const cat = p.match(/[?&]category=([^&]+)/);
              if (cat) resolvedParams.category = cat[1];
            } else if (p.includes('/episode/servers')) {
              resolvedAction = 'servers';
              const eid = p.match(/[?&]animeEpisodeId=([^&]+)/);
              if (eid) resolvedParams.episodeId = decodeURIComponent(eid[1]);
            } else if (p.match(/\/anime\/([^/?]+)$/)) {
              resolvedAction = 'info';
              const match = p.match(/\/anime\/([^/?]+)$/);
              if (match) resolvedParams.id = match[1];
            }

            if (!resolvedAction) {
              sendError('Unknown legacy path: ' + p, 400);
              return;
            }

            // Re-set params for handling below
            url.searchParams.set('action', resolvedAction);
            for (const [k, v] of Object.entries(resolvedParams)) {
              url.searchParams.set(k, v);
            }
          }

          const finalAction = url.searchParams.get('action');
          
          try {
            switch (finalAction) {
              case 'home': {
                const data = await hianime.getHomePage();
                sendJson(data);
                break;
              }
              case 'search': {
                const q = url.searchParams.get('q');
                if (!q) { sendError('Missing q parameter', 400); return; }
                const page = parseInt(url.searchParams.get('page') || '1');
                const data = await hianime.search(q, page);
                sendJson(data);
                break;
              }
              case 'suggestions': {
                const q = url.searchParams.get('q');
                if (!q) { sendError('Missing q parameter', 400); return; }
                const data = await hianime.searchSuggestions(q);
                sendJson(data);
                break;
              }
              case 'info': {
                const id = url.searchParams.get('id');
                if (!id) { sendError('Missing id parameter', 400); return; }
                const data = await hianime.getInfo(id);
                sendJson(data);
                break;
              }
              case 'episodes': {
                const id = url.searchParams.get('id');
                if (!id) { sendError('Missing id parameter', 400); return; }
                const data = await hianime.getEpisodes(id);
                sendJson(data);
                break;
              }
              case 'servers': {
                const episodeId = url.searchParams.get('episodeId');
                if (!episodeId) { sendError('Missing episodeId parameter', 400); return; }
                const data = await hianime.getEpisodeServers(episodeId);
                sendJson(data);
                break;
              }
              case 'sources': {
                const episodeId = url.searchParams.get('episodeId');
                if (!episodeId) { sendError('Missing episodeId parameter', 400); return; }
                const category = url.searchParams.get('category') || 'sub';
                // Try ALL servers, non-MegaCloud first (different CDNs that work from datacenter)
                // hd-1/hd-2 both use MegaCloud CDN which blocks datacenter IPs
                const serversToTry = ['streamtape', 'streamsb', 'hd-1', 'hd-2'];
                let resolved = false;
                let lastError: any = null;
                for (const serverName of serversToTry) {
                  try {
                    const data = await hianime.getEpisodeSources(episodeId, serverName, category);
                    if (data && data.sources && data.sources.length > 0) {
                      console.log(`[aniwatch-dev] Sources resolved via server: ${serverName}`);
                      (data as any)._usedServer = serverName;
                      sendJson(data);
                      resolved = true;
                      break;
                    }
                  } catch (scraperErr: any) {
                    console.warn(`[aniwatch-dev] Server "${serverName}" failed:`, scraperErr?.message);
                    lastError = scraperErr;
                  }
                }
                if (!resolved) {
                  // All servers failed — try old API fallback
                  const OLD_API = 'https://nyanime-backend-v2.onrender.com';
                  try {
                    const encoded = encodeURIComponent(episodeId);
                    const fallbackUrl = `${OLD_API}/api/v2/hianime/episode/sources?animeEpisodeId=${encoded}&server=hd-1&category=${category}`;
                    console.log(`[aniwatch-dev] Falling back to old API: ${fallbackUrl}`);
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    const fallbackResp = await fetch(fallbackUrl, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (fallbackResp.ok) {
                      const fallbackJson = await fallbackResp.json() as any;
                      const fallbackData = fallbackJson.data || fallbackJson;
                      if (fallbackData && fallbackData.sources && fallbackData.sources.length > 0) {
                        sendJson(fallbackData);
                        resolved = true;
                      }
                    }
                  } catch (fallbackErr: any) {
                    console.warn('[aniwatch-dev] Old API fallback also failed:', fallbackErr?.message);
                  }
                  if (!resolved) {
                    sendError('All source providers failed', 502);
                  }
                }
                break;
              }
              case 'category': {
                const name = url.searchParams.get('name');
                if (!name) { sendError('Missing name parameter', 400); return; }
                const page = parseInt(url.searchParams.get('page') || '1');
                const data = await hianime.getCategoryAnime(name, page);
                sendJson(data);
                break;
              }
              case 'schedule': {
                const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
                const data = await hianime.getEstimatedSchedule(date);
                sendJson(data);
                break;
              }
              default:
                sendError('Unknown action: ' + finalAction, 400);
            }
          } catch (err: any) {
            console.error(`[aniwatch-dev] Error in action=${finalAction}:`, err?.message || err);
            sendError(err?.message || 'Scraper error');
          }
        } catch (e) {
          console.error('[aniwatch-dev] Middleware error:', e);
          next();
        }
      });
    }
  };
}

// Dev-only middleware to proxy and rewrite HLS playlists/segments at /stream
function streamProxyPlugin(): Plugin {
  return {
    name: 'stream-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url) return next();
          // Only handle /stream?url=...
          if (!req.url.startsWith('/stream')) return next();

          // Handle CORS preflight
          if (req.method && req.method.toUpperCase() === 'OPTIONS') {
            res.statusCode = 204;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
            res.end();
            return;
          }

      const full = new URL(req.url, 'http://localhost');
      const host = req.headers.host || 'localhost';
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const selfOrigin = `${proto}://${host}`;
  const targetParam = full.searchParams.get('url');
  const headersParam = full.searchParams.get('h'); // base64-encoded JSON headers
          if (!targetParam) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Missing url parameter');
            return;
          }

          let upstream: URL;
          try {
            upstream = new URL(targetParam);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Invalid url parameter');
            return;
          }

          // Determine the correct referer based on the CDN domain
          const hostname = upstream.hostname.toLowerCase();
          const megacloudDomains = [
            'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
            'lightningspark', 'sunshinerays', 'surfparadise',
            'moonjump', 'skydrop', 'wetransfer', 'bicdn',
            'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
            'statics', 'mgstatics', 'lasercloud', 'cloudrax',
            'stormshade', 'thunderwave', 'raincloud', 'snowfall',
            'rainveil', 'thunderstrike', 'sunburst', 'clearskyline'  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
          ];
          
          let defaultReferer = 'https://megacloud.blog/';
          if (!megacloudDomains.some(d => hostname.includes(d))) {
            if (hostname.includes('vidcloud') || hostname.includes('vidstreaming')) {
              defaultReferer = 'https://vidcloud.blog/';
            } else if (hostname.includes('gogoanime') || hostname.includes('gogocdn')) {
              defaultReferer = 'https://gogoanime.cl/';
            }
          }

          const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': defaultReferer,
            'Origin': new URL(defaultReferer).origin,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          };

          // Merge in allowed custom headers supplied by client (base64 JSON)
          if (headersParam) {
            try {
              const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
              const custom = JSON.parse(decoded);
              const allowList = new Set(['referer', 'origin', 'user-agent', 'authorization', 'cookie']);
              for (const [k, v] of Object.entries(custom)) {
                const keyLower = k.toLowerCase();
                if (allowList.has(keyLower) && typeof v === 'string' && v.length < 4096) {
                  const canonical = keyLower
                    .split('-')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                    .join('-');
                  upstreamHeaders[canonical] = v;
                }
              }
              // If a Referer was provided, align Origin to Referer origin (override default)
              if ('Referer' in upstreamHeaders) {
                try {
                  const ref = new URL(upstreamHeaders['Referer']);
                  upstreamHeaders['Origin'] = ref.origin;
                } catch { /* ignore */ }
              }
            } catch {
              // Ignore header parsing errors
            }
          }
          // Forward Range header for segments if present
          if (req.headers['range']) {
            upstreamHeaders['Range'] = String(req.headers['range']);
          }

          let activeHeaders = { ...upstreamHeaders } as Record<string,string>;
          let upstreamResp = await fetch(upstream.toString(), { headers: activeHeaders, redirect: 'follow' });
          let contentType = upstreamResp.headers.get('content-type') || '';
          const pathname = upstream.pathname.toLowerCase();
          const isKeyFile = pathname.endsWith('.key');
          const isM3U8ByPath = pathname.endsWith('.m3u8');
          const isVideoSegment = pathname.endsWith('.ts') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.mp4') || pathname.endsWith('.m4s') || pathname.endsWith('.html');

          // Binary content: TS segments, MP4, KEY files, encrypted .jpg segments, etc.
          const isHtmlResponse = contentType.toLowerCase().includes('text/html');
          if (isKeyFile || isVideoSegment || (!isM3U8ByPath && (!contentType.includes('application/vnd.apple') && !contentType.toLowerCase().includes('mpegurl') && !contentType.toLowerCase().includes('text/plain') && !isHtmlResponse))) {
            // If upstream failed OR returned HTML (CDN error page with 200 OK), retry
            if ((!upstreamResp.ok || (isHtmlResponse && isVideoSegment)) && (isVideoSegment || isKeyFile)) {
              const refererCandidates = [
                'https://megacloud.blog/',
                'https://megacloud.tv/',
                'https://hianime.to/',
                `${upstream.protocol}//${upstream.host}/`,
              ];
              
              for (const ref of refererCandidates) {
                const retryHeaders: Record<string, string> = { ...activeHeaders, 'Referer': ref };
                try {
                  const refUrl = new URL(ref);
                  retryHeaders['Origin'] = refUrl.origin;
                } catch { /* ignore */ }
                
                const retryResp = await fetch(upstream.toString(), { headers: retryHeaders, redirect: 'follow' });
                const retryCt = retryResp.headers.get('content-type') || '';
                if (retryResp.ok && !retryCt.toLowerCase().includes('text/html')) {
                  upstreamResp = retryResp;
                  contentType = retryCt;
                  console.log(`[stream-proxy] Segment retry with Referer=${ref} succeeded`);
                  break;
                }
              }
            }
            
            // Final check: if CDN still returned HTML for a video segment, reject it
            const finalCt = (upstreamResp.headers.get('content-type') || '').toLowerCase();
            if (isVideoSegment && finalCt.includes('text/html')) {
              console.warn(`[stream-proxy] CDN returned HTML for segment: ${upstream.pathname}`);
              res.statusCode = 502;
              res.setHeader('Content-Type', 'text/plain');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end('CDN returned HTML instead of video data');
              return;
            }
            
            res.statusCode = upstreamResp.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (contentType) res.setHeader('Content-Type', contentType);
            // Forward essential headers for range requests and caching
            const forwardHeaders = [
              'content-length',
              'content-range',
              'accept-ranges',
              'cache-control',
              'etag',
              'last-modified',
              'expires'
            ];
            for (const h of forwardHeaders) {
              const val = upstreamResp.headers.get(h);
              if (val) res.setHeader(h, val);
            }
            // Stream body
            const reader = upstreamResp.body?.getReader();
            if (!reader) {
              res.end();
              return;
            }
            const pump = async () => {
              const { value, done } = await reader.read();
              if (done) { res.end(); return; }
              res.write(Buffer.from(value));
              pump();
            };
            pump();
            return;
          }

          let chosenHeadersParam = headersParam || '';
          // If manifest fetch failed or came back as HTML, try fallback referers
          if (isM3U8ByPath && (!upstreamResp.ok)) {
            const refererCandidates = new Set<string>();
            // from custom param
            if (activeHeaders['Referer']) {
              try { refererCandidates.add(new URL(activeHeaders['Referer']).origin + '/'); } catch { /* ignore bad referer */ }
              refererCandidates.add(activeHeaders['Referer']);
            }
            // Common candidates - prioritize megacloud.blog for anime CDNs
            refererCandidates.add('https://megacloud.blog/');
            refererCandidates.add('https://megacloud.tv/');
            refererCandidates.add('https://hianime.to/');
            refererCandidates.add('https://aniwatch.to/');
            refererCandidates.add(`${upstream.protocol}//${upstream.host}/`);
            refererCandidates.add(upstream.toString());

            for (const ref of refererCandidates) {
              const attempt = async (omitOrigin = false) => {
                const trialHeaders: Record<string, string> = { ...upstreamHeaders };
                trialHeaders['Referer'] = ref;
                if (!omitOrigin) {
                  try { const refUrl = new URL(ref); trialHeaders['Origin'] = refUrl.origin; } catch { /* ignore origin parse */ }
                } else {
                  delete trialHeaders['Origin'];
                }
                // Prefetch referer page to collect cookies if any
                try {
                  const refResp = await fetch(ref, { headers: { 'User-Agent': trialHeaders['User-Agent'] || upstreamHeaders['User-Agent'] || '' }, redirect: 'follow' });
                  const setCookie = refResp.headers.get('set-cookie');
                  if (setCookie) {
                    trialHeaders['Cookie'] = setCookie
                      .split(/,\s?(?=[^;]+;)/)
                      .map(sc => sc.split(';')[0])
                      .join('; ');
                  }
                } catch { /* ignore cookie prefetch errors */ }
                const resp = await fetch(upstream.toString(), { headers: trialHeaders, redirect: 'follow' });
                const ct = resp.headers.get('content-type') || '';
                console.log(`[stream-proxy] retry${omitOrigin ? '(no-origin)' : ''} Referer=${ref} ← ${resp.status} ${ct}`);
                if (resp.ok) {
                  const preview = await resp.clone().text();
                  if (/^#EXTM3U/m.test(preview)) {
                    upstreamResp = resp;
                    contentType = ct;
                    activeHeaders = trialHeaders;
                    try {
                      const payload: Record<string, string> = { Referer: trialHeaders['Referer'] };
                      if (trialHeaders['Origin']) payload['Origin'] = trialHeaders['Origin'];
                      if (trialHeaders['Cookie']) payload['Cookie'] = trialHeaders['Cookie'];
                      chosenHeadersParam = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
                    } catch { /* ignore header encoding */ }
                    return true;
                  }
                }
                return false;
              };

              if (await attempt(false)) break;
              if (await attempt(true)) break;
            }
          }

          let text = await upstreamResp.text();
          let isM3U8PathOrType = isM3U8ByPath || contentType.toLowerCase().includes('mpegurl') || contentType.toLowerCase().includes('application/x-mpegurl') || contentType.toLowerCase().includes('application/vnd.apple.mpegurl') || contentType.toLowerCase().includes('text/plain');
          let isValidM3U = /^#EXTM3U/m.test(text);
          if (isM3U8ByPath && upstreamResp.ok && (!isValidM3U)) {
            // Retry with referer candidates even on 200 if the body isn't a valid playlist
            const refererCandidates = new Set<string>();
            if (activeHeaders['Referer']) {
              try { refererCandidates.add(new URL(activeHeaders['Referer']).origin + '/'); } catch { /* ignore */ }
              refererCandidates.add(activeHeaders['Referer']);
            }
            refererCandidates.add('https://hianime.to/');
            refererCandidates.add('https://aniwatch.to/');
            refererCandidates.add('https://megaplay.buzz/');
            refererCandidates.add(`${upstream.protocol}//${upstream.host}/`);
            refererCandidates.add(upstream.toString());
            for (const ref of refererCandidates) {
              const trialHeaders = { ...upstreamHeaders };
              trialHeaders['Referer'] = ref;
              try { const refUrl = new URL(ref); trialHeaders['Origin'] = refUrl.origin; } catch { /* ignore */ }
              const trialResp = await fetch(upstream.toString(), { headers: trialHeaders, redirect: 'follow' });
              const trialCT = trialResp.headers.get('content-type') || '';
              const body = await trialResp.clone().text();
              console.log(`[stream-proxy] alt-retry Referer=${ref} ← ${trialResp.status} ${trialCT}, validM3U=${/^#EXTM3U/m.test(body)}`);
              if (trialResp.ok && /^#EXTM3U/m.test(body)) {
                upstreamResp = trialResp;
                contentType = trialCT;
                text = body;
                activeHeaders = trialHeaders;
                try {
                  const payload = { Referer: trialHeaders['Referer'], Origin: trialHeaders['Origin'] };
                  chosenHeadersParam = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
                } catch { /* ignore */ }
                isM3U8PathOrType = true;
                isValidM3U = true;
                break;
              }
            }
          }
          let outText = text;
          if (isM3U8PathOrType && isValidM3U) {
            const base = upstream;
            // First rewrite URI="..." occurrences inside tag lines (e.g., #EXT-X-MAP, #EXT-X-KEY)
            const firstPass = text.replace(/URI="([^"]+)"/g, (_m, p1) => {
              try {
                const abs = new URL(p1, base);
                const hq = chosenHeadersParam ? `&h=${encodeURIComponent(chosenHeadersParam)}` : '';
                return `URI="${selfOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hq}"`;
              } catch {
                return `URI="${p1}"`;
              }
            });
            const lines = firstPass.split(/\r?\n/);
            const rewritten = lines.map((line) => {
              const trimmed = line.trim();
              if (trimmed === '' || trimmed.startsWith('#')) return line; // keep tags/comments
              try {
                const abs = new URL(line, base);
                const hq = chosenHeadersParam ? `&h=${encodeURIComponent(chosenHeadersParam)}` : '';
                return `${selfOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hq}`;
              } catch {
                return line;
              }
            });
            outText = rewritten.join('\n');
          }

          res.statusCode = upstreamResp.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache');
          const ct = (isM3U8PathOrType && isValidM3U)
            ? 'application/vnd.apple.mpegurl'
            : (contentType || 'text/plain; charset=utf-8');
          res.setHeader('Content-Type', ct);
          res.end(outText);
          return;
        } catch (e) {
          console.error('[stream-proxy] error', e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Proxy error');
        }
      });
    }
  }
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.onrender.com',
      '.nyanime.tech',
      'nyanime.tech',
      '.pages.dev',
      '.workers.dev'
    ],
    proxy: {
      '/api': {
        target: 'https://nyanime-backend.vercel.app',
        changeOrigin: true,
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Consumet API proxy (for anime metadata)
      '/consumet': {
        target: 'https://api.consumet.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/consumet/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Consumet API proxy error', err);
          });
        },
      },
    },
  },
  build: {
    outDir: "dist", // Explicitly set build output directory
    chunkSizeWarningLimit: 600, // Increase warning limit slightly
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-select',
            '@radix-ui/react-scroll-area',
          ],
          'vendor-forms': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
          ],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-utils': [
            'axios',
            'date-fns',
            'lucide-react',
            'clsx',
            'tailwind-merge',
          ],
          'vendor-hls': ['hls.js'],
        },
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    // Dev: handle /aniwatch?action=... using npm package directly
    aniwatchDevPlugin(),
    // Dev HLS proxy for /stream
    streamProxyPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
