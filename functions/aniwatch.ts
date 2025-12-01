/**
 * Cloudflare Pages Function: Aniwatch API Proxy
 * Proxies requests to the Aniwatch API to avoid CORS issues
 * Endpoint: /aniwatch?path=<api_path>
 * 
 * Example: /aniwatch?path=/api/v2/hianime/home
 */

type CFContext = { 
  request: Request;
  env?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const ANIWATCH_API_BASE = 'https://aniwatch-latest.onrender.com';

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

  try {
    const url = new URL(request.url);
    const pathParam = url.searchParams.get('path');

    if (!pathParam) {
      return new Response(JSON.stringify({ error: 'Missing path parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Ensure path starts with /
    const apiPath = pathParam.startsWith('/') ? pathParam : '/' + pathParam;
    
    // Build the full API URL
    const apiUrl = `${ANIWATCH_API_BASE}${apiPath}`;
    
    console.log(`[aniwatch-proxy] Fetching: ${apiUrl.substring(0, 100)}...`);

    // Fetch from Aniwatch API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`[aniwatch-proxy] Upstream error: ${response.status} ${response.statusText}`);
      return new Response(JSON.stringify({
        error: `Aniwatch API error: ${response.statusText}`,
        status: response.status
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });

  } catch (error) {
    console.error('[aniwatch-proxy] Error:', error);
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
