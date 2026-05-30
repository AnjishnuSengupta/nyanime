/**
 * Shared fetch utility for server-side providers.
 * Provides timeout support and simple retry with exponential back-off.
 */

/**
 * Fetch with a hard timeout.
 * @param {string} url
 * @param {RequestInit} opts
 * @param {number} timeoutMs
 */
export async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch with automatic retries on network/server failure.
 * @param {string} url
 * @param {RequestInit} opts
 * @param {{ retries?: number, timeoutMs?: number, backoffMs?: number }} retryOpts
 */
export async function fetchWithRetry(url, opts = {}, {
  retries = 3,
  timeoutMs = 10000,
  backoffMs = 1000,
} = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts, timeoutMs);
      if (res.ok || res.status < 500) return res; // don't retry 4xx
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, backoffMs * attempt));
    }
  }
  throw lastErr;
}
