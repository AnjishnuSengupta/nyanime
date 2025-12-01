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
  'rainveil'  // New CDN domain found
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

  // Build upstream request with browser-like headers
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
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
    const upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow'
    });
    
    if (!upstreamResp.ok) {
      console.error(`[stream-proxy] Upstream error: ${upstreamResp.status} ${upstreamResp.statusText}`);
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

    const contentType = upstreamResp.headers.get('content-type') || '';
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || 
                   contentType.toLowerCase().includes('x-mpegurl') ||
                   target.pathname.endsWith('.m3u8');

    // For non-text content (video segments), stream directly
    if (!isM3U8 && !contentType.includes('text')) {
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
    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      
      // Handle EXT-X-KEY with URI
      if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/, (match, uri) => {
          try {
            const absoluteUrl = new URL(uri, target);
            const proxiedUrl = `${url.origin}/stream?url=${encodeURIComponent(absoluteUrl.toString())}`;
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
        const proxied = `${url.origin}/stream?url=${encodeURIComponent(absoluteUrl.toString())}`;
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
