import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const { url: targetUrl, h: headersParam } = req.query;

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Parse custom headers if provided
    let customHeaders: Record<string, string> = {};
    if (headersParam && typeof headersParam === 'string') {
      try {
        const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
        customHeaders = JSON.parse(decoded);
      } catch (err) {
        console.warn('Failed to parse headers:', err);
      }
    }

    // Prepare request headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      ...customHeaders,
    };

    // Extract origin/referer for proper CORS handling
    const targetURL = new URL(targetUrl);
    if (!headers['Referer'] && !headers['referer']) {
      headers['Referer'] = targetURL.origin + '/';
    }
    if (!headers['Origin'] && !headers['origin']) {
      headers['Origin'] = targetURL.origin;
    }

    console.log(`[stream-proxy] Fetching: ${targetUrl}`);

    // Fetch the resource
    const response = await fetch(targetUrl, {
      headers,
      method: 'GET',
    });

    if (!response.ok) {
      console.error(`[stream-proxy] Error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}` 
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.text();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);

    // If it's an m3u8 playlist, rewrite URLs to proxy through Vercel
    if (contentType.includes('application/vnd.apple.mpegurl') || 
        contentType.includes('application/x-mpegURL') ||
        targetUrl.endsWith('.m3u8')) {
      
      const baseUrl = new URL(targetUrl);
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // Rewrite relative URLs in playlist
      const rewritten = body.replace(
        /^(#EXT[^\n]*\n)?([^#\n][^\n]+)/gm,
        (match, header, uri) => {
          if (!uri || uri.startsWith('#') || uri.startsWith('http')) {
            return match;
          }
          
          // Construct absolute URL
          const absoluteUrl = new URL(uri, `${baseUrl.origin}${basePath}`).toString();
          
          // Proxy through our endpoint
          const proxiedUrl = `/api/stream?url=${encodeURIComponent(absoluteUrl)}${headersParam ? `&h=${headersParam}` : ''}`;
          
          return (header || '') + proxiedUrl;
        }
      );
      
      return res.status(200).send(rewritten);
    }

    // For media segments, just pass through
    return res.status(200).send(body);

  } catch (error) {
    console.error('[stream-proxy] Error:', error);
    return res.status(500).json({ 
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Handle OPTIONS preflight
export const config = {
  api: {
    bodyParser: false,
  },
};
