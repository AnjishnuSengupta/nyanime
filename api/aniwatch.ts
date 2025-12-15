import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function: Aniwatch API Proxy
 * Proxies requests to the Aniwatch API to avoid CORS issues
 * Endpoint: /api/aniwatch?path=<api_path>
 * 
 * Example: /api/aniwatch?path=/api/v2/hianime/home
 */

const ANIWATCH_API_BASE = process.env.VITE_ANIWATCH_API_URL || 'https://aniwatch-latest.onrender.com';

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
    const { path } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Missing path parameter' });
    }

    // Ensure path starts with /
    const apiPath = path.startsWith('/') ? path : '/' + path;
    
    // Build the full API URL
    const apiUrl = `${ANIWATCH_API_BASE}${apiPath}`;
    
    console.log(`[aniwatch-proxy] Fetching: ${apiUrl.substring(0, 100)}...`);

    // Fetch from Aniwatch API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    if (!response.ok) {
      console.error(`[aniwatch-proxy] Upstream error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({
        error: `Aniwatch API error: ${response.statusText}`,
        status: response.status
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('[aniwatch-proxy] Error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Request timeout',
        message: 'The upstream API took too long to respond'
      });
    }
    
    return res.status(500).json({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
