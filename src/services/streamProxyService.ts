/**
 * Stream Proxy Service
 * Handles HLS/M3U8 stream proxying with multiple fallback strategies
 * 
 * This service solves the CORS issue for video streaming on static hosting platforms
 * (like Render static sites, Vercel, Cloudflare Pages) where the Express server
 * with proxy endpoints isn't running.
 */

// Reliable CORS proxies that work for HLS streams
// These are ordered by reliability and speed
const CORS_PROXIES = [
  // corsproxy.io - Fast and reliable
  'https://corsproxy.io/?',
  // api.allorigins.win - Good fallback
  'https://api.allorigins.win/raw?url=',
  // cors-anywhere alternatives
  'https://api.codetabs.com/v1/proxy?quest=',
];

// Check if we're running on a static host (no server-side proxy available)
let isStaticHost: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

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
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      // Make a simple request to the stream endpoint
      // We expect either a 400 (missing url param) or 404 (not found)
      const response = await fetch('/stream?probe=1', {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If we get a 400, the endpoint exists (it's complaining about missing url)
      // If we get a 404, we're on a static host
      const hasProxy = response.status === 400 || response.status === 200;
      isStaticHost = !hasProxy;
      
      console.log(`[StreamProxy] Probe result: ${hasProxy ? 'Server proxy available' : 'Static host detected'}`);
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
  // Check if server proxy is available
  const hasServerProxy = await probeStreamEndpoint();
  
  if (hasServerProxy) {
    // Use our own server proxy (server.js or vite dev server)
    const headersB64 = headers ? btoa(JSON.stringify(headers)) : '';
    const proxyPath = '/stream';
    return `${proxyPath}?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
  }
  
  // Fallback to external CORS proxy for static hosting
  // For HLS streams, we use corsproxy.io which handles M3U8 rewriting
  return `${CORS_PROXIES[0]}${encodeURIComponent(streamUrl)}`;
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
    probeStreamEndpoint();
  }
  
  // In development or if probe hasn't completed, use server proxy
  if (import.meta.env.DEV || isStaticHost === false) {
    const headersB64 = headers ? btoa(JSON.stringify(headers)) : '';
    const proxyPath = '/stream';
    return `${proxyPath}?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
  }
  
  // If we know it's a static host, use external proxy
  if (isStaticHost === true) {
    return `${CORS_PROXIES[0]}${encodeURIComponent(streamUrl)}`;
  }
  
  // Default to server proxy while probe is pending
  const headersB64 = headers ? btoa(JSON.stringify(headers)) : '';
  return `/stream?url=${encodeURIComponent(streamUrl)}${headersB64 ? `&h=${headersB64}` : ''}`;
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
  resetProxyProbe,
  isOnStaticHost,
  createHlsConfig,
};
