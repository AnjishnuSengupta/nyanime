import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function: HLS/M3U8 Stream Proxy
 * Handles CORS, header forwarding, and playlist URL rewriting
 * Endpoint: /api/stream?url=<encoded_video_url>&h=<base64_headers>
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  try {
    const { url: targetUrl, h: headersParam } = req.query;

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    // Validate URL
    let targetURL: URL;
    try {
      targetURL = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Parse custom headers if provided (base64 encoded JSON)
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
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Referer': customHeaders.Referer || customHeaders.referer || 'https://hianime.to/',
      'Origin': customHeaders.Origin || customHeaders.origin || targetURL.origin,
      ...customHeaders, // Override with custom headers
    };

    // Clean headers (remove empty values)
    const cleanHeaders: Record<string, string> = {};
    Object.keys(headers).forEach(key => {
      const value = headers[key];
      if (value && typeof value === 'string' && value.trim()) {
        cleanHeaders[key] = value.trim();
      }
    });

    console.log(`[stream-proxy] → ${targetUrl}`);

    // Fetch the resource
    const response = await fetch(targetUrl, {
      headers: cleanHeaders,
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`[stream-proxy] ✗ ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        url: targetUrl,
        status: response.status
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Check if this is an M3U8 playlist
    const isM3U8 = contentType.includes('mpegurl') || 
                   contentType.includes('x-mpegURL') ||
                   targetUrl.endsWith('.m3u8');

    if (isM3U8) {
      // Read and rewrite playlist URLs
      const body = await response.text();
      const baseUrl = new URL(targetUrl);
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // Get the request origin for proxied URLs
      const requestOrigin = req.headers.origin || 
                           `https://${req.headers.host}` ||
                           'https://nyanime.vercel.app';
      
      // Rewrite playlist URLs to proxy through this function
      const rewritten = body.replace(
        /^((?:#EXT[^\n]*\n)?)((?!#)[^\n]+)/gm,
        (match, header, uri) => {
          if (!uri || uri.trim() === '' || uri.startsWith('#')) {
            return match;
          }
          
          // Resolve relative URLs to absolute
          let absoluteUrl: string;
          try {
            if (uri.startsWith('http://') || uri.startsWith('https://')) {
              absoluteUrl = uri;
            } else {
              absoluteUrl = new URL(uri, `${baseUrl.origin}${basePath}`).toString();
            }
          } catch {
            return match; // Keep original if URL parsing fails
          }
          
          // Proxy through our endpoint
          const proxiedUrl = `${requestOrigin}/api/stream?url=${encodeURIComponent(absoluteUrl)}${headersParam ? `&h=${headersParam}` : ''}`;
          
          return (header || '') + proxiedUrl;
        }
      );
      
      console.log(`[stream-proxy] ✓ Rewrote M3U8 playlist (${body.length} → ${rewritten.length} bytes)`);
      return res.status(200).send(rewritten);
    }

    // For media segments (TS, MP4, etc.), stream directly
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[stream-proxy] ✓ Proxied ${buffer.length} bytes`);
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('[stream-proxy] Error:', error);
    return res.status(500).json({ 
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Configure Vercel function
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '8mb', // Allow larger video segments
  },
};
