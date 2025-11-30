/**
 * Cloudflare Pages Function: HLS/M3U8 Stream Proxy
 * Handles CORS, header forwarding, and playlist URL rewriting
 * Endpoint: /stream?url=<encoded_video_url>
 */

type CFContext = { 
  request: Request;
  env?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

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
      },
    });
  }

  const url = new URL(request.url);
  const targetParam = url.searchParams.get('url');
  
  if (!targetParam) {
    return new Response('Missing url parameter', { 
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return new Response('Invalid url parameter', { 
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Build upstream request with necessary headers
  const upstreamHeaders: HeadersInit = {
    'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://hianime.to/',
    'Origin': 'https://hianime.to',
    'Accept': 'application/x-mpegURL, application/vnd.apple.mpegurl, video/*, */*',
    'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  // Forward Range header for partial content requests
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    (upstreamHeaders as Record<string, string>)['Range'] = rangeHeader;
  }

  const upstreamReq = new Request(target.toString(), {
    method: 'GET',
    headers: upstreamHeaders,
    redirect: 'follow'
  });

  try {
    const upstreamResp = await fetch(upstreamReq);
    
    if (!upstreamResp.ok) {
      console.error(`[stream-proxy] Upstream error: ${upstreamResp.status} ${upstreamResp.statusText}`);
      return new Response(`Upstream error: ${upstreamResp.statusText}`, {
        status: upstreamResp.status,
        headers: {
          'Content-Type': 'text/plain',
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
      const headers = new Headers(upstreamResp.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      headers.set('Cache-Control', 'public, max-age=3600');
      
      return new Response(upstreamResp.body, { 
        status: upstreamResp.status, 
        headers 
      });
    }

    // For M3U8 playlists, read and rewrite URLs
    const text = await upstreamResp.text();
    
    if (!isM3U8) {
      // Not a playlist, return as-is
      const headers = new Headers({
        'Content-Type': contentType || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      return new Response(text, { status: upstreamResp.status, headers });
    }

    // Validate M3U8 content
    if (!text.includes('#EXTM3U')) {
      console.warn('[stream-proxy] Warning: Response claimed to be M3U8 but missing #EXTM3U marker');
      return new Response(text, {
        status: upstreamResp.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Rewrite M3U8 playlist URLs
    const base = target;
    const lines = text.split(/\r?\n/);
    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      
      // Keep comments/tags
      if (trimmed.startsWith('#') || trimmed === '') {
        return line;
      }
      
      try {
        // Resolve relative/absolute URLs
        const absoluteUrl = new URL(trimmed, base);
        
        // Proxy through this function
        const proxied = `${url.origin}/stream?url=${encodeURIComponent(absoluteUrl.toString())}`;
        return proxied;
      } catch {
        // Keep original if URL parsing fails
        return line;
      }
    });
    
    const outText = rewritten.join('\n');

    const headers = new Headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    console.log(`[stream-proxy] Rewrote M3U8 playlist: ${text.length} → ${outText.length} bytes`);
    return new Response(outText, { status: upstreamResp.status, headers });

  } catch (error) {
    console.error('[stream-proxy] Error:', error);
    return new Response('Proxy error: ' + (error instanceof Error ? error.message : 'Unknown'), {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
