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

    // Prepare request headers with browser-like fingerprint
    const targetURL = new URL(targetUrl);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // Don't request compression to avoid issues
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Referer': targetURL.origin + '/',
      'Origin': targetURL.origin,
      ...customHeaders, // Apply custom headers last to override defaults
    };

    // Clean up header keys (some servers are case-sensitive)
    const cleanHeaders: Record<string, string> = {};
    Object.keys(headers).forEach(key => {
      const value = headers[key];
      if (value && typeof value === 'string' && value.trim()) {
        cleanHeaders[key] = value.trim();
      }
    });

    console.log(`[stream-proxy] Fetching: ${targetUrl}`);
    console.log(`[stream-proxy] Headers:`, JSON.stringify(cleanHeaders, null, 2));

    // Fetch the resource with cleaned headers
    const response = await fetch(targetUrl, {
      headers: cleanHeaders,
      method: 'GET',
      redirect: 'follow', // Follow redirects
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unable to read error body');
      console.error(`[stream-proxy] Error ${response.status}: ${response.statusText}`);
      console.error(`[stream-proxy] Error body:`, errorBody);
      console.error(`[stream-proxy] Request headers:`, JSON.stringify(cleanHeaders, null, 2));
      
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        details: errorBody,
        url: targetUrl
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
