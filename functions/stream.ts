// Cloudflare Pages Function: /stream?url=<encoded_upstream_url>
// Proxies HLS playlists and segments, injecting required headers and rewriting playlist URLs
// Minimal type alias to avoid dependency on @cloudflare/workers-types at build time
type CFContext = { request: Request };
export const onRequest = async (context: CFContext) => {
  const { request } = context;
  const url = new URL(request.url);
  const targetParam = url.searchParams.get('url');
  if (!targetParam) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return new Response('Invalid url parameter', { status: 400 });
  }

  // Build upstream request with necessary headers
  const upstreamHeaders: HeadersInit = {
    'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
    // Many hosts check Referer; use hianime as per API docs
    'Referer': 'https://hianime.to/',
    'Origin': 'https://hianime.to',
    // Accept defaults
    'Accept': 'application/x-mpegURL, application/vnd.apple.mpegurl, video/*, */*',
    'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  const upstreamReq = new Request(target.toString(), {
    method: 'GET',
    headers: upstreamHeaders,
    redirect: 'follow'
  });

  const upstreamResp = await fetch(upstreamReq);
  const contentType = upstreamResp.headers.get('content-type') || '';

  // Simple pass-through for non-text responses (segments)
  if (!contentType.includes('application') && !contentType.includes('text')) {
    const body = upstreamResp.body;
    const headers = new Headers(upstreamResp.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(body, { status: upstreamResp.status, headers });
  }

  const text = await upstreamResp.text();

  // If it's an M3U8 playlist, rewrite all absolute and relative URLs to go through this proxy
  const isM3U8 = contentType.toLowerCase().includes('mpegurl') || target.pathname.endsWith('.m3u8');
  let outText = text;

  if (isM3U8) {
    const base = target;
    const lines = text.split(/\r?\n/);
    const rewritten = lines.map((line) => {
      // Keep comments/tags
      if (line.trim().startsWith('#') || line.trim() === '') return line;
      try {
        // Resolve relative/absolute URLs
        const abs = new URL(line, base);
        const proxied = `${url.origin}/stream?url=${encodeURIComponent(abs.toString())}`;
        return proxied;
      } catch {
        return line;
      }
    });
    outText = rewritten.join('\n');
  }

  const headers = new Headers({
    'Content-Type': isM3U8 ? 'application/vnd.apple.mpegurl' : (contentType || 'text/plain; charset=utf-8'),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });

  return new Response(outText, { status: upstreamResp.status, headers });
};
