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
    res.setHeader('Access-Control-Max-Age', '86400');
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
      } catch {
        // Ignore parsing errors
      }
    }

    // Determine the correct referer based on the target URL
    let referer = customHeaders.Referer || customHeaders.referer || '';
    
    // Map known CDN domains to their correct referers
    // These CDNs are used by various anime streaming sources and require specific referers
    const hostname = targetURL.hostname.toLowerCase();
    
    // MegaCloud ecosystem domains - all require megacloud.blog referer
    // These domains frequently change, so include common patterns
    const megacloudDomains = [
      'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
      'lightningspark', 'sunshinerays', 'surfparadise',
      'moonjump', 'skydrop', 'wetransfer', 'bicdn',
      'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
      'statics', 'mgstatics', 'lasercloud', 'cloudrax'
    ];
    
    const isMegacloudCDN = megacloudDomains.some(domain => hostname.includes(domain));
    
    if (isMegacloudCDN) {
      referer = referer || 'https://megacloud.blog/';
    } else if (hostname.includes('vidcloud') || hostname.includes('vidstreaming')) {
      referer = referer || 'https://vidcloud.blog/';
    } else if (hostname.includes('hianime') || hostname.includes('aniwatch')) {
      referer = referer || 'https://hianime.to/';
    } else if (hostname.includes('gogoanime') || hostname.includes('gogocdn')) {
      referer = referer || 'https://gogoanime.cl/';
    } else if (hostname.includes('kwik') || hostname.includes('animepahe')) {
      referer = referer || 'https://animepahe.ru/';
    }
    
    // If still no referer, use megacloud.blog as default (most common for anime CDNs)
    if (!referer) {
      referer = 'https://megacloud.blog/';
    }

    // Prepare request headers with browser-like fingerprint
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Referer': referer,
    };

    // Add origin from referer
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      headers['Origin'] = targetURL.origin;
    }

    // Merge custom headers (they take priority)
    Object.entries(customHeaders).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim()) {
        headers[key] = value.trim();
      }
    });

    console.log(`[stream-proxy] Fetching: ${targetUrl.substring(0, 80)}...`);

    // Fetch the resource with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        headers,
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[stream-proxy] Fetch error:`, fetchError);
      return res.status(502).json({ 
        error: 'Failed to fetch upstream resource',
        message: fetchError instanceof Error ? fetchError.message : 'Unknown error'
      });
    }
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[stream-proxy] Upstream error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        status: response.status
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    // Check if this is an M3U8 playlist
    const isM3U8 = contentType.includes('mpegurl') || 
                   contentType.includes('x-mpegURL') ||
                   contentType.includes('vnd.apple') ||
                   targetUrl.endsWith('.m3u8');

    if (isM3U8) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      
      // Read and rewrite playlist URLs
      const body = await response.text();
      
      if (!body || body.trim() === '') {
        console.error('[stream-proxy] Empty M3U8 response');
        return res.status(502).json({ error: 'Empty M3U8 response from upstream' });
      }
      
      const baseUrl = new URL(targetUrl);
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // Get the host for proxied URLs
      const host = req.headers.host || 'nyanime.vercel.app';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const requestOrigin = `${protocol}://${host}`;
      
      // Rewrite playlist URLs to proxy through this function
      const lines = body.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments (except URI in EXT-X-KEY)
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          // Handle EXT-X-KEY with URI
          if (trimmedLine.includes('URI="')) {
            return trimmedLine.replace(/URI="([^"]+)"/, (match, uri) => {
              let absoluteUrl: string;
              try {
                if (uri.startsWith('http://') || uri.startsWith('https://')) {
                  absoluteUrl = uri;
                } else {
                  absoluteUrl = new URL(uri, `${baseUrl.origin}${basePath}`).toString();
                }
              } catch {
                return match;
              }
              const proxiedUrl = `${requestOrigin}/api/stream?url=${encodeURIComponent(absoluteUrl)}${headersParam ? `&h=${headersParam}` : ''}`;
              return `URI="${proxiedUrl}"`;
            });
          }
          return line;
        }
        
        // This is a URL line - resolve and proxy it
        let absoluteUrl: string;
        try {
          if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
            absoluteUrl = trimmedLine;
          } else {
            absoluteUrl = new URL(trimmedLine, `${baseUrl.origin}${basePath}`).toString();
          }
        } catch {
          return line; // Keep original if URL parsing fails
        }
        
        // Proxy through our endpoint
        return `${requestOrigin}/api/stream?url=${encodeURIComponent(absoluteUrl)}${headersParam ? `&h=${headersParam}` : ''}`;
      });
      
      const rewritten = rewrittenLines.join('\n');
      console.log(`[stream-proxy] Rewrote M3U8: ${body.length} -> ${rewritten.length} bytes`);
      return res.status(200).send(rewritten);
    }

    // For media segments (TS, MP4, KEY files, etc.), stream directly
    res.setHeader('Content-Type', contentType);
    
    // Forward content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[stream-proxy] Proxied segment: ${buffer.length} bytes`);
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
    responseLimit: false, // Allow any size response
  },
  // Increase function timeout (requires Pro plan, but doesn't hurt)
  maxDuration: 30,
};
