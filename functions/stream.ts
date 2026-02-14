/**
 * Cloudflare Pages Function: HLS/M3U8 Stream Proxy
 * Handles CORS, header forwarding, and playlist URL rewriting
 * Endpoint: /stream?url=<encoded_video_url>&h=<base64_headers>
 */

type CFContext = { 
  request: Request;
  env?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

// MegaCloud ecosystem domains - all require megacloud.blog referer
// These domains frequently change, so include common patterns
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike', 'sunburst', 'clearskyline'  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
];

function getRefererForHost(hostname: string, customReferer?: string): string {
  if (customReferer) return customReferer;
  
  const host = hostname.toLowerCase();
  
  // Check if it's a MegaCloud CDN
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
  
  // Default to megacloud.blog for unknown anime CDNs
  return 'https://megacloud.blog/';
}

export const onRequest = async (context: CFContext) => {
  const { request } = context;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  const targetParam = url.searchParams.get('url');
  const headersParam = url.searchParams.get('h');
  
  if (!targetParam) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), { 
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url parameter' }), { 
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // Parse custom headers if provided (base64 encoded JSON)
  let customHeaders: Record<string, string> = {};
  if (headersParam) {
    try {
      const decoded = atob(headersParam);
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
  // IMPORTANT: Do NOT include Sec-Fetch-* headers. These are auto-set by
  // real browsers and flag the request as a bot when sent from a Worker.
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
    'Origin': new URL(referer).origin,
  };

  // Merge custom headers (they take priority)
  Object.entries(customHeaders).forEach(([key, value]) => {
    if (value && typeof value === 'string' && key.toLowerCase() !== 'referer') {
      upstreamHeaders[key] = value;
    }
  });

  // Forward Range header for partial content requests
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    upstreamHeaders['Range'] = rangeHeader;
  }

  console.log(`[stream-proxy] Fetching: ${targetParam.substring(0, 80)}... with Referer: ${referer}`);

  try {
    let upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    const pathLower = target.pathname.toLowerCase();
    const isM3U8File = pathLower.endsWith('.m3u8');
    const looksLikeSegment = pathLower.endsWith('.ts') || pathLower.endsWith('.m4s') || 
                             pathLower.endsWith('.mp4') || pathLower.endsWith('.html') ||
                             pathLower.endsWith('.key') || pathLower.endsWith('.jpg');

    // Referer candidates for retries
    const refererCandidates = [
      'https://megacloud.blog/',
      'https://megacloud.tv/',
      'https://hianime.to/',
      'https://aniwatch.to/',
      `${target.protocol}//${target.host}/`,
    ];

    // Track which headers ultimately worked (for M3U8 URL rewriting)
    let workingHeadersParam = headersParam || '';

    // ── Retry logic for ALL request types when upstream fails ──
    if (!upstreamResp.ok) {
      console.warn(`[stream-proxy] Upstream returned ${upstreamResp.status} for ${pathLower.substring(0, 60)}`);

      for (const ref of refererCandidates) {
        const retryHeaders: Record<string, string> = { ...upstreamHeaders, 'Referer': ref };
        try { retryHeaders['Origin'] = new URL(ref).origin; } catch { /* ignore */ }

        try {
          const retryResp = await fetch(target.toString(), {
            method: 'GET',
            headers: retryHeaders,
            redirect: 'follow',
          });

          if (retryResp.ok) {
            const retryCt = (retryResp.headers.get('content-type') || '').toLowerCase();
            // For M3U8, verify it's a valid playlist
            if (isM3U8File) {
              const preview = await retryResp.clone().text();
              if (/^#EXTM3U/m.test(preview)) {
                upstreamResp = retryResp;
                // Update headers param so rewritten URLs carry the working referer
                try {
                  workingHeadersParam = btoa(JSON.stringify({ Referer: ref, Origin: new URL(ref).origin }));
                } catch { /* ignore */ }
                console.log(`[stream-proxy] M3U8 retry with Referer=${ref} succeeded`);
                break;
              }
            } else if (!retryCt.includes('text/html')) {
              upstreamResp = retryResp;
              console.log(`[stream-proxy] Segment retry with Referer=${ref} succeeded`);
              break;
            }
          }
        } catch { /* ignore individual retry errors */ }
      }

      // Also try without Origin header for M3U8 (some CDNs reject cross-origin)
      if (!upstreamResp.ok && isM3U8File) {
        for (const ref of refererCandidates) {
          const retryHeaders: Record<string, string> = { ...upstreamHeaders, 'Referer': ref };
          delete retryHeaders['Origin'];
          try {
            const retryResp = await fetch(target.toString(), {
              method: 'GET',
              headers: retryHeaders,
              redirect: 'follow',
            });
            if (retryResp.ok) {
              const preview = await retryResp.clone().text();
              if (/^#EXTM3U/m.test(preview)) {
                upstreamResp = retryResp;
                try {
                  workingHeadersParam = btoa(JSON.stringify({ Referer: ref }));
                } catch { /* ignore */ }
                console.log(`[stream-proxy] M3U8 retry (no-origin) with Referer=${ref} succeeded`);
                break;
              }
            }
          } catch { /* ignore */ }
        }
      }

      if (!upstreamResp.ok) {
        console.error(`[stream-proxy] All retries failed. Final: ${upstreamResp.status} ${upstreamResp.statusText}`);
        return new Response(JSON.stringify({ 
          error: `Upstream error: ${upstreamResp.statusText}`,
          status: upstreamResp.status
        }), {
          status: upstreamResp.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    const contentType = upstreamResp.headers.get('content-type') || '';
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || 
                   contentType.toLowerCase().includes('x-mpegurl') ||
                   isM3U8File;

    // ── Handle HTML responses for segments (CDN error page with 200 OK) ──
    if (looksLikeSegment && contentType.toLowerCase().includes('text/html')) {
      // Retry with different referers before giving up
      let htmlRetried = false;
      for (const ref of refererCandidates) {
        const retryHeaders: Record<string, string> = { ...upstreamHeaders, 'Referer': ref };
        try { retryHeaders['Origin'] = new URL(ref).origin; } catch { /* ignore */ }
        try {
          const retryResp = await fetch(target.toString(), {
            method: 'GET',
            headers: retryHeaders,
            redirect: 'follow',
          });
          const retryCt = (retryResp.headers.get('content-type') || '').toLowerCase();
          if (retryResp.ok && !retryCt.includes('text/html')) {
            upstreamResp = retryResp;
            htmlRetried = true;
            console.log(`[stream-proxy] HTML segment retry with Referer=${ref} succeeded`);
            break;
          }
        } catch { /* ignore */ }
      }

      if (!htmlRetried) {
        console.warn(`[stream-proxy] CDN returned HTML for segment: ${pathLower}`);
        return new Response(JSON.stringify({ error: 'CDN returned HTML instead of video data' }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }
    
    if (!isM3U8 && (!contentType.includes('text') || looksLikeSegment)) {
      const headers = new Headers();
      
      // Copy relevant headers
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
        const val = upstreamResp.headers.get(h);
        if (val) headers.set(h, val);
      });
      
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      headers.set('Cache-Control', 'public, max-age=3600');
      
      return new Response(upstreamResp.body, { 
        status: upstreamResp.status, 
        headers 
      });
    }

    // For M3U8 playlists, read and rewrite URLs
    const text = await upstreamResp.text();
    
    // Validate M3U8 content
    if (!text.includes('#EXTM3U') && !text.includes('#EXT')) {
      // Not a valid playlist, return as-is
      return new Response(text, {
        status: upstreamResp.status,
        headers: {
          'Content-Type': contentType || 'text/plain',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Rewrite M3U8 playlist URLs
    const lines = text.split(/\r?\n/);
    const hQuery = workingHeadersParam ? `&h=${encodeURIComponent(workingHeadersParam)}` : '';
    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      
      // Handle URI="..." in any tag line (#EXT-X-KEY, #EXT-X-MAP, etc.)
      if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          try {
            const absoluteUrl = new URL(uri, target);
            const proxiedUrl = `${url.origin}/stream?url=${encodeURIComponent(absoluteUrl.toString())}${hQuery}`;
            return `URI="${proxiedUrl}"`;
          } catch {
            return match;
          }
        });
      }
      
      // Keep comments/tags
      if (trimmed.startsWith('#') || trimmed === '') {
        return line;
      }
      
      try {
        // Resolve relative/absolute URLs
        const absoluteUrl = new URL(trimmed, target);
        
        // Proxy through this function
        const proxied = `${url.origin}/stream?url=${encodeURIComponent(absoluteUrl.toString())}${hQuery}`;
        return proxied;
      } catch {
        // Keep original if URL parsing fails
        return line;
      }
    });
    
    const outText = rewritten.join('\n');

    console.log(`[stream-proxy] Rewrote M3U8: ${text.length} -> ${outText.length} bytes`);

    return new Response(outText, { 
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      }
    });

  } catch (error) {
    console.error('[stream-proxy] Error:', error);
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
