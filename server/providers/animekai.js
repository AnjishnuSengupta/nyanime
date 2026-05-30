/**
 * AnimeKAI provider helpers — extracted from server.js route handler.
 *
 * The Python animekai-api service remains the PRIMARY source (it uses
 * curl_cffi TLS impersonation which works better on datacenter IPs).
 * These helpers are used as the FALLBACK when the Python service is unavailable.
 *
 * Exports:
 *   encodeAnimeKaiToken(text)         → string | null
 *   decodeAnimeKaiResponse(encrypted) → object | null
 *   decodeMegaResponse(encrypted)     → object | null
 *   parseAnimeKaiInfoSpans(html)       → { sub, dub, type }
 *   findBestAnimeKaiMatch(title, results) → result | null
 *   ANIMEKAI_HEADERS
 *   ANIMEKAI_AJAX_HEADERS
 *   ANIMEKAI_URL_MAP
 */

import { fetchWithRetry } from '../utils/fetchWithRetry.js';

// ─── URL constants ────────────────────────────────────────────────────────────

export const ANIMEKAI_URL_MAP = {
  base    : 'https://anikai.to',
  search  : 'https://anikai.to/ajax/anime/search',
  episodes: 'https://anikai.to/ajax/episodes/list',
  servers : 'https://anikai.to/ajax/links/list',
  links   : 'https://anikai.to/ajax/links/view',
  encKai  : 'https://enc-dec.app/api/enc-kai',
  decKai  : 'https://enc-dec.app/api/dec-kai',
  decMega : 'https://enc-dec.app/api/dec-mega',
};

// ─── Headers ─────────────────────────────────────────────────────────────────

export const ANIMEKAI_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer'        : 'https://anikai.to/',
};

export const ANIMEKAI_AJAX_HEADERS = {
  ...ANIMEKAI_HEADERS,
  'X-Requested-With': 'XMLHttpRequest',
  'Accept'          : 'application/json, text/javascript, */*; q=0.01',
};

// ─── Token encoding ───────────────────────────────────────────────────────────

/**
 * Encode a token string via enc-dec.app (required for episode/server/source requests).
 * @param {string} text
 * @returns {Promise<string|null>}
 */
export async function encodeAnimeKaiToken(text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithRetry(
        `${ANIMEKAI_URL_MAP.encKai}?text=${encodeURIComponent(text)}`,
        { headers: ANIMEKAI_HEADERS },
        { retries: 1, timeoutMs: 10000 },
      );
      const data = await res.json();
      if (data.status === 200 && data.result) return data.result;
    } catch (err) {
      console.error(`[AnimeKAI] Token encoding failed (attempt ${attempt}/3):`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

// ─── Response decryption ──────────────────────────────────────────────────────

/**
 * Decrypt an AnimeKAI embedded URL response.
 * @param {string} encrypted
 * @returns {Promise<object|null>}
 */
export async function decodeAnimeKaiResponse(encrypted) {
  try {
    const res = await fetchWithRetry(ANIMEKAI_URL_MAP.decKai, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', ...ANIMEKAI_HEADERS },
      body   : JSON.stringify({ text: encrypted }),
    }, { retries: 2, timeoutMs: 10000 });
    const data = await res.json();
    if (data.status !== 200) return null;
    return typeof data.result === 'object' ? data.result : JSON.parse(data.result);
  } catch (err) {
    console.error('[AnimeKAI] Decryption failed:', err.message);
    return null;
  }
}

/**
 * Decrypt a MegaCloud media response.
 * @param {string} encrypted
 * @returns {Promise<object|null>}
 */
export async function decodeMegaResponse(encrypted) {
  try {
    const res = await fetchWithRetry(ANIMEKAI_URL_MAP.decMega, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', ...ANIMEKAI_HEADERS },
      body   : JSON.stringify({ text: encrypted, agent: ANIMEKAI_HEADERS['User-Agent'] }),
    }, { retries: 2, timeoutMs: 10000 });
    const data = await res.json();
    if (data.status !== 200) return null;
    return typeof data.result === 'object' ? data.result : JSON.parse(data.result);
  } catch (err) {
    console.error('[AnimeKAI] Mega decryption failed:', err.message);
    return null;
  }
}

// ─── HTML parsing helpers ─────────────────────────────────────────────────────

/**
 * Parse the AnimeKAI info bar HTML to extract sub/dub counts and type.
 * @param {string} html
 * @returns {{ sub: string, dub: string, type: string }}
 */
export function parseAnimeKaiInfoSpans(html) {
  if (!html) return { sub: '', dub: '', type: '' };
  const subMatch  = html.match(/<span class="sub">.*?<\/svg>(\d+)<\/span>/);
  const dubMatch  = html.match(/<span class="dub">.*?<\/svg>(\d+)<\/span>/);
  const typeMatch = html.match(/<b>(TV|MOVIE|OVA|ONA|SPECIAL|MUSIC)<\/b>/i);
  return {
    sub : subMatch  ? subMatch[1]            : '',
    dub : dubMatch  ? dubMatch[1]            : '',
    type: typeMatch ? typeMatch[1].toUpperCase() : 'TV',
  };
}

// ─── Fuzzy title matching ─────────────────────────────────────────────────────

/**
 * Find the best matching anime from AnimeKAI search results.
 * @param {string} targetTitle
 * @param {Array<{name: string, id: string, slug: string}>} results
 * @returns {object|null}
 */
export function findBestAnimeKaiMatch(targetTitle, results) {
  if (!results || results.length === 0) return null;
  const normalize  = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const tokenize   = (s) => normalize(s).split(/\s+/).filter(t => t.length >= 2);
  const target     = normalize(targetTitle);
  const tTokens    = tokenize(targetTitle);

  let best = null, maxScore = 0;
  for (const res of results) {
    const name   = normalize(res.name || '');
    const nTokens = tokenize(res.name || '');
    const overlap = tTokens.filter(t => nTokens.includes(t)).length;

    // Prefer exact match
    if (name === target) return res;

    let score = overlap / Math.max(tTokens.length, 1);
    // Penalise results with significantly more tokens (avoids matching sequels)
    if (nTokens.length > tTokens.length + 2) score *= 0.7;
    if (score > maxScore) { maxScore = score; best = res; }
  }
  return best || results[0];
}
