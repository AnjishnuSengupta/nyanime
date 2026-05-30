/**
 * AniPy provider — native Node implementation of the AllAnime (AllManga) API.
 *
 * Replaces the Python anipy-api microservice. Calls api.allanime.day directly
 * using the same GraphQL queries the Python anipy-api library uses internally.
 *
 * Exports:
 *   getEpisodes(title, titleRo, audioType, jikanEpisodeCount) → { episodes, source }
 *   getSources(title, titleRo, episode, audioType)            → { sources, matched_title }
 */

import crypto from 'crypto';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLANIME_API  = 'https://api.allanime.day/api';
const ALLANIME_SITE = 'https://allanime.to';

const HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer'         : 'https://allanime.to/',
  'Origin'          : 'https://allanime.to',
};

// Hardcoded bypasses for anime that AllAnime obfuscates under different names
const TITLE_OVERRIDES = {
  'one piece': { id: 'ReooPAxPMsHM4KPMY', name: 'One Piece' },
};

// ─── AllAnime decode map (hex pairs → characters) ────────────────────────────

const DECODE_MAP = {
  '79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J','73':'K','74':'L','75':'M','76':'N','77':'O',
  '68':'P','69':'Q','6a':'R','6b':'S','6c':'T','6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z',
  '59':'a','5a':'b','5b':'c','5c':'d','5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n','57':'o',
  '48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x','41':'y','42':'z',
  '08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7','00':'8','01':'9',
  '15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#','63':'[','65':']','78':'@',
  '19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+','14':',','03':';','05':'=','1d':'%',
};

// ─── GraphQL query fragments ──────────────────────────────────────────────────

const SEARCH_GQL = `
query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType) {
    edges {
      _id
      name
      englishName
      nativeName
      availableEpisodes { sub dub raw }
    }
  }
}`;

const EPISODES_GQL = `
query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeNumStart: Float!, $episodeNumEnd: Float!) {
  show(_id: $showId) {
    availableEpisodesDetail(translationType: $translationType, episodeNumStart: $episodeNumStart, episodeNumEnd: $episodeNumEnd)
  }
}`;

const STREAMS_GQL = `
query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
  episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
    sourceUrls
  }
}`;

// ─── Title matching helpers ───────────────────────────────────────────────────

const _stopwords = new Set(['no','wo','wa','ga','to','de','ni','na','the','a','an','of']);

function _tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t && !_stopwords.has(t));
}

function _cleanTitle(title) {
  return title.toLowerCase().trim()
    .replace(/\(tv\)/g, '').replace(/\(sub\)/g, '').replace(/\(dub\)/g, '').trim();
}

function _extractSeason(text) {
  const t = text.toLowerCase();
  let m;
  if ((m = t.match(/season\s*(\d+)/))) return parseInt(m[1]);
  if ((m = t.match(/(\d+)(?:st|nd|rd|th)\s*season/))) return parseInt(m[1]);
  if ((m = t.match(/\bs(\d+)\b/))) return parseInt(m[1]);
  if ((m = t.match(/part\s*(\d+)/))) return parseInt(m[1]);
  return null;
}

function _seasonPenalty(query, resultName) {
  const sq = _extractSeason(query);
  const sr = _extractSeason(resultName);
  if (sq !== null && sr !== null) { if (sq !== sr) return 2.0; }
  if (sq !== null && sr === null) { if (sq !== 1) return 2.0; return 0.0; }
  if (sq === null && sr !== null) { if (sr !== 1) return 2.0; }
  return 0.0;
}

function _scoreMatch(resultName, query) {
  const qTokens = new Set(_tokenize(query));
  const rTokens = new Set(_tokenize(resultName));
  if (!qTokens.size || !rTokens.size) return 0.0;
  const matches = [...qTokens].filter(t => rTokens.has(t)).length;
  const recall    = matches / qTokens.size;
  const precision = matches / rTokens.size;
  const f1 = (recall + precision) > 0 ? 2 * recall * precision / (recall + precision) : 0;
  const penalty = _seasonPenalty(query, resultName);
  return Math.max(0, f1 - penalty);
}

function findBestMatch(results, queryTitle, queryTitleRo = '') {
  if (!results || results.length === 0) return null;
  const qLower   = _cleanTitle(queryTitle);
  const qRoLower = queryTitleRo ? _cleanTitle(queryTitleRo) : '';

  for (const r of results) {
    const rClean = _cleanTitle(r.name || '');
    if (rClean === qLower || (qRoLower && rClean === qRoLower)) return r;
  }

  let best = null, bestScore = -1;
  for (const r of results) {
    const s1 = _scoreMatch(r.name || '', queryTitle);
    const s2 = queryTitleRo ? _scoreMatch(r.name || '', queryTitleRo) : -1;
    const score = Math.max(s1, s2);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best || results[0];
}

// ─── AllAnime GraphQL helper ─────────────────────────────────────────────────

async function gqlQuery(query, variables) {
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    query,
  });
  const res = await fetchWithRetry(
    `${ALLANIME_API}?${params}`,
    { headers: HEADERS },
    { retries: 3, timeoutMs: 12000, backoffMs: 800 },
  );
  if (!res.ok) throw new Error(`AllAnime API ${res.status}`);
  return res.json();
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function searchShows(title, translationType = 'sub') {
  const data = await gqlQuery(SEARCH_GQL, {
    search: { query: title },
    limit: 26, page: 1,
    translationType,
  });
  return (data?.data?.shows?.edges || []).map(e => ({
    id  : e._id,
    name: e.englishName || e.name || e.nativeName || '',
    availableEpisodes: e.availableEpisodes,
  }));
}

// ─── Resolve show ID from title ───────────────────────────────────────────────

async function resolveShowId(title, titleRo, translationType) {
  const override = TITLE_OVERRIDES[title.toLowerCase().trim()];
  if (override) return override;

  const results = await searchShows(title, translationType);
  const match = findBestMatch(results, title, titleRo);
  if (!match) throw new Error(`No AllAnime results for "${title}"`);
  return match;
}

// ─── URL decode ──────────────────────────────────────────────────────────────

function decodeAllAnimeUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('--')) {
    const encoded = trimmed.slice(2).replace(/\s+/g, '');
    if (/^[0-9a-f]+$/.test(encoded) && encoded.length % 2 === 0) {
      let decoded = '';
      for (let i = 0; i < encoded.length; i += 2) {
        decoded += DECODE_MAP[encoded.slice(i, i + 2).toLowerCase()] || '';
      }
      if (decoded.includes('/clock')) decoded = decoded.replace('/clock', '/clock.json');
      if (decoded.startsWith('//')) decoded = `https:${decoded}`;
      if (decoded.startsWith('/')) decoded = `https://allanime.day${decoded}`;
      return decoded;
    }
  }
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://allanime.day${trimmed}`;
  return trimmed;
}

function decryptAllAnimeAES(hexStr) {
  try {
    const key  = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest();
    const buf  = Buffer.from(hexStr, 'hex');
    const iv   = buf.slice(1, 13);
    const ctr  = Buffer.concat([iv, Buffer.from([0, 0, 0, 2])]);
    const data = buf.slice(13, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, ctr);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

async function resolveClockUrl(clockUrl) {
  try {
    const res = await fetchWithRetry(clockUrl, { headers: HEADERS }, { retries: 2, timeoutMs: 8000 });
    if (!res.ok) return [];
    const data = await res.json();
    const links = data?.links || [];
    return links
      .map(l => l.link || l.src || l.url || '')
      .filter(Boolean)
      .filter(u => u.includes('.m3u8') || u.includes('.mp4'));
  } catch { return []; }
}

async function resolveSourceUrl(rawUrl) {
  const decoded = decodeAllAnimeUrl(rawUrl);
  if (!decoded) return [];

  // AES encrypted blob
  if (decoded.length > 64 && /^[0-9a-f]+$/.test(decoded)) {
    const decrypted = decryptAllAnimeAES(decoded);
    if (decrypted.startsWith('http')) return [decrypted];
    return [];
  }

  // Clock / redirect proxy
  if (decoded.includes('/clock')) {
    const urls = await resolveClockUrl(decoded);
    return urls;
  }

  if (decoded.startsWith('http') && (decoded.includes('.m3u8') || decoded.includes('.mp4'))) {
    return [decoded];
  }

  return [];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get episode list for an anime.
 * If jikanEpisodeCount > 0, returns a synthetic sequential list (1..N).
 * Otherwise queries AllAnime for real episode data.
 *
 * @returns {{ episodes: Array<{number:number}>, source: string }}
 */
export async function getEpisodes(title, titleRo = '', audioType = 'sub', jikanEpisodeCount = 0) {
  // If Jikan gave us a reliable count, just generate the list — no scraping needed
  if (jikanEpisodeCount > 0) {
    const episodes = Array.from({ length: jikanEpisodeCount }, (_, i) => ({ number: i + 1 }));
    return { episodes, source: 'jikan_count' };
  }

  const translationType = audioType === 'dub' ? 'dub' : 'sub';
  const show = await resolveShowId(title, titleRo, translationType);

  // Fetch up to 2500 episodes (AllAnime's max page)
  const data = await gqlQuery(EPISODES_GQL, {
    showId: show.id,
    translationType,
    episodeNumStart: 0,
    episodeNumEnd: 2500,
  });

  const raw = data?.data?.show?.availableEpisodesDetail || [];
  const numbers = raw
    .map(n => parseFloat(n))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  const episodes = numbers.map(n => ({ number: n }));
  return { episodes, source: 'provider' };
}

/**
 * Get streaming sources for a specific episode.
 *
 * @returns {{ sources: Array, matched_title: string }}
 */
export async function getSources(title, titleRo = '', episode, audioType = 'sub') {
  const translationType = audioType === 'dub' ? 'dub' : 'sub';
  const show = await resolveShowId(title, titleRo, translationType);

  const data = await gqlQuery(STREAMS_GQL, {
    showId: show.id,
    translationType,
    episodeString: String(episode),
  });

  const rawUrls = data?.data?.episode?.sourceUrls || [];
  const sources = [];

  for (const item of rawUrls) {
    const rawUrl = item?.sourceUrl || item?.url || item || '';
    try {
      const resolvedUrls = await resolveSourceUrl(rawUrl);
      for (const url of resolvedUrls) {
        const isM3U8 = url.includes('.m3u8');
        sources.push({
          url,
          quality : 'AllAnime',
          type    : isM3U8 ? 'hls' : 'mp4',
          isM3U8,
          score   : 75,
        });
      }
    } catch { /* skip unresolvable sources */ }
  }

  return { sources, matched_title: show.name };
}
