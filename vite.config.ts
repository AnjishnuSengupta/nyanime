import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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

          const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://hianime.to/',
            'Origin': 'https://hianime.to',
            'Accept': 'application/x-mpegURL, application/vnd.apple.mpegurl, video/*, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          };

          // Merge in allowed custom headers supplied by client (base64 JSON)
          if (headersParam) {
            try {
              const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
              console.log('[stream-proxy] 📦 Decoded headers JSON:', decoded);
              const custom = JSON.parse(decoded);
              console.log('[stream-proxy] 📋 Parsed custom headers:', custom);
              const allowList = new Set(['referer', 'origin', 'user-agent', 'authorization', 'cookie']);
              for (const [k, v] of Object.entries(custom)) {
                const keyLower = k.toLowerCase();
                if (allowList.has(keyLower) && typeof v === 'string' && v.length < 4096) {
                  const canonical = keyLower
                    .split('-')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                    .join('-');
                  upstreamHeaders[canonical] = v;
                  console.log(`[stream-proxy] ✅ Added header: ${canonical} = ${v}`);
                }
              }
              // If a Referer was provided, align Origin to Referer origin (override default)
              if ('Referer' in upstreamHeaders) {
                try {
                  const ref = new URL(upstreamHeaders['Referer']);
                  upstreamHeaders['Origin'] = ref.origin;
                  console.log(`[stream-proxy] 🔗 Set Origin to: ${ref.origin}`);
                } catch { /* ignore */ }
              }
            } catch (err) {
              console.warn('[stream-proxy] Failed to parse header param', err);
            }
          }
          // Forward Range header for segments if present
          if (req.headers['range']) {
            upstreamHeaders['Range'] = String(req.headers['range']);
          }

          console.log(`[stream-proxy] → ${upstream.toString()}`);
          console.log('[stream-proxy] 📤 Final headers being sent:', upstreamHeaders);
          let activeHeaders = { ...upstreamHeaders } as Record<string,string>;
          let upstreamResp = await fetch(upstream.toString(), { headers: activeHeaders, redirect: 'follow' });
          let contentType = upstreamResp.headers.get('content-type') || '';
          const pathname = upstream.pathname.toLowerCase();
          const isKeyFile = pathname.endsWith('.key');
          const isM3U8ByPath = pathname.endsWith('.m3u8');
          console.log(`[stream-proxy] ← ${upstreamResp.status} ${contentType}`);

          // Binary content: TS segments, MP4, KEY files, etc.
          if (isKeyFile || (!isM3U8ByPath && (!contentType.includes('application/vnd.apple') && !contentType.toLowerCase().includes('mpegurl') && !contentType.toLowerCase().includes('text/plain')))) {
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
            // Common candidates
            refererCandidates.add('https://hianime.to/');
            refererCandidates.add('https://aniwatch.to/');
            refererCandidates.add('https://megaplay.buzz/');
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
      '/aniwatch-api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aniwatch-api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Aniwatch API proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to Aniwatch API:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from Aniwatch API:', proxyRes.statusCode, req.url);
          });
        },
      }
    },
  },
  build: {
    outDir: "dist", // Explicitly set build output directory
    chunkSizeWarningLimit: 1000, // Optional: Adjust chunk size warning
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    // Dev HLS proxy for /stream
    streamProxyPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
