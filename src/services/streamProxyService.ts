/**
 * Stream Proxy Service
 * Handles HLS/M3U8 stream proxying with multiple fallback strategies
 * 
 * This service solves the CORS issue for video streaming on static hosting platforms
 * (like Render static sites, Vercel, Cloudflare Pages) where the Express server
 * with proxy endpoints isn't running.
 * 
 * When VITE_STREAM_PROXY_URL is set, it points to an external stream proxy
 * running on non-Cloudflare infrastructure (e.g., Render). This is required
 * because MegaCloud CDN servers block all Cloudflare IPs.
 */

// External stream proxy URL (non-Cloudflare infrastructure)
// Set this to a deployed instance of server.js on Render, Railway, etc.
const EXTERNAL_STREAM_PROXY = import.meta.env.VITE_STREAM_PROXY_URL || '';
const STREAM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36';

// Check if we're running on a static host (no server-side proxy available)
let isStaticHost: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

function withDefaultProxyHeaders(headers?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'user-agent') {
        return;
      }
      merged[key] = value;
    });
  }

  // Enforce a stable desktop browser UA for upstream stream requests.
  merged['User-Agent'] = STREAM_USER_AGENT;
  return merged;
}

function toHeadersParam(headers?: Record<string, string>): string {
  const proxyHeaders = withDefaultProxyHeaders(headers);
  return btoa(JSON.stringify(proxyHeaders));
}

function toSameOriginProxyUrl(streamUrl: string, headers?: Record<string, string>): string {
  const headersB64 = toHeadersParam(headers);
  return `/stream?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
}

/**
 * Probe whether the /stream endpoint is available
 * This only needs to run once per session
 */
async function probeStreamEndpoint(): Promise<boolean> {
  // In development mode, always assume proxy is available
  if (import.meta.env.DEV) {
    return true;
  }
  
  // If we've already probed, return cached result
  if (isStaticHost !== null) {
    return !isStaticHost;
  }
  
  // If probe is in progress, wait for it
  if (probePromise) {
    return probePromise;
  }
  
  // Probe the /stream endpoint
  const doProbe = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, 3000);
      
      // Use GET (not HEAD) so we can check content-type — the probe param is ignored
      // A real stream proxy returns 400 JSON (missing url), 
      // while an SPA catch-all returns 200 with text/html (wrong!)
      const response = await fetch('/stream?probe=1', {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // The stream proxy endpoint returns 400 JSON when no url param is given.
      // If we get 200 with text/html, it's the SPA catch-all (Vercel/Netlify) — NOT a real proxy.
      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.includes('application/json');
      const isHtmlResponse = contentType.includes('text/html');
      
      // Real proxy: 204 probe response, 400 + JSON, or 200 + non-HTML
      // SPA catch-all: 200 + HTML
      const hasProxy = response.status === 204 ||
               (response.status === 400 && isJsonResponse) || 
                       (response.status === 200 && !isHtmlResponse);
      isStaticHost = !hasProxy;
      
      console.log(`[StreamProxy] Probe result: status=${response.status}, type=${contentType}, proxy=${hasProxy ? 'available' : 'not found'}`);
      return hasProxy;
    } catch {
      // Network error or abort - assume static host
      console.log('[StreamProxy] Probe failed, assuming static host');
      isStaticHost = true;
      return false;
    }
  };
  
  probePromise = doProbe();
  return probePromise;
}

/**
 * Get the best proxy URL for a given stream URL
 * @param streamUrl - The original HLS stream URL
 * @param headers - Optional headers to include (e.g., Referer)
 * @returns Proxied URL that bypasses CORS
 */
export async function getProxiedStreamUrl(
  streamUrl: string,
  headers?: Record<string, string>
): Promise<string> {
  const hasServerProxy = await probeStreamEndpoint();
  if (hasServerProxy) {
    return toSameOriginProxyUrl(streamUrl, headers);
  }

  // If same-origin proxy is unavailable, try external relay when configured.
  if (EXTERNAL_STREAM_PROXY) {
    const headersB64 = toHeadersParam(headers);
    const base = EXTERNAL_STREAM_PROXY.replace(/\/+$/, '');
    return `${base}/stream?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
  }
  
  // No proxy available — return raw URL (will likely fail with CORS)
  console.warn('[StreamProxy] No stream proxy available — streaming may not work');
  return streamUrl;
}

/**
 * Synchronous version that uses cached probe result
 * Use this when you can't await (e.g., in React render)
 */
export function getProxiedStreamUrlSync(
  streamUrl: string,
  headers?: Record<string, string>
): string {
  // Start probe if not already done
  if (isStaticHost === null && !probePromise) {
    void probeStreamEndpoint();
  }
  
  if (import.meta.env.DEV || isStaticHost === null || isStaticHost === false) {
    return toSameOriginProxyUrl(streamUrl, headers);
  }

  // Static host without same-origin proxy: use external relay if configured.
  if (EXTERNAL_STREAM_PROXY) {
    const headersB64 = toHeadersParam(headers);
    const base = EXTERNAL_STREAM_PROXY.replace(/\/+$/, '');
    return `${base}/stream?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
  }

  // Last resort: raw URL (likely CORS-limited)
  if (isStaticHost === true) {
    console.warn('[StreamProxy] No stream proxy available — returning raw URL');
    return streamUrl;
  }

  return toSameOriginProxyUrl(streamUrl, headers);
}

/**
 * Force same-origin proxy URL.
 * Useful for subtitle tracks to avoid cross-origin frame restrictions.
 */
export function getSameOriginProxiedStreamUrl(
  streamUrl: string,
  headers?: Record<string, string>
): string {
  return toSameOriginProxyUrl(streamUrl, headers);
}

/**
 * Force recheck of proxy availability
 * Useful after deployment changes
 */
export function resetProxyProbe(): void {
  isStaticHost = null;
  probePromise = null;
}

/**
 * Get whether we're on a static host (for debugging)
 */
export function isOnStaticHost(): boolean | null {
  return isStaticHost;
}

/**
 * Get the configured external stream proxy URL (for debugging)
 */
export function getExternalStreamProxy(): string {
  return EXTERNAL_STREAM_PROXY;
}

/**
 * Create an HLS.js configuration with proper CORS handling
 */
export function createHlsConfig(headers?: Record<string, string>): {
  xhrSetup: (xhr: XMLHttpRequest, url: string) => void;
} {
  return {
    xhrSetup: (xhr: XMLHttpRequest, _url: string) => {
      // For static hosts, we can't set custom headers on CORS requests
      // The external proxy handles this
      if (isStaticHost === false && headers) {
        // Only set headers when using our own proxy
        Object.entries(headers).forEach(([key, value]) => {
          try {
            xhr.setRequestHeader(key, value);
          } catch {
            // Some headers can't be set, ignore
          }
        });
      }
    },
  };
}

export default {
  getProxiedStreamUrl,
  getProxiedStreamUrlSync,
  getSameOriginProxiedStreamUrl,
  resetProxyProbe,
  isOnStaticHost,
  getExternalStreamProxy,
  createHlsConfig,
};
