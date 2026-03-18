import type { VercelRequest, VercelResponse } from '@vercel/node';

const CONSUMET_BASE = process.env.VITE_CONSUMET_API_URL || 'https://consumet.nyanime.tech';
const ANIPY_API_URL = (process.env.ANIPY_API_URL || '').replace(/\/+$/, '');
const ANIPY_TIMEOUT_MS = Number(process.env.ANIPY_TIMEOUT_MS || '4000');
const ANIPY_PREFIX = 'anipy';
const PRIMARY_PROVIDER = process.env.CONSUMET_ANIME_PROVIDER || 'animesaturn';
const ALLANIME_PROVIDER = 'allanime';
const ALLANIME_API = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
const ALLANIME_REFERER = process.env.ALLANIME_REFERER || 'https://allmanga.to';
const FALLBACK_PROVIDERS = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'animepahe,animekai,kickassanime,animeunity')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const PROVIDER_PRIORITY = [PRIMARY_PROVIDER, ...FALLBACK_PROVIDERS].filter((p, i, arr) => arr.indexOf(p) === i);
const ID_SEPARATOR = '::';

interface ConsumetSearchItem {
  id?: string;
  title?: string;
  image?: string;
  type?: string;
  episodes?: number | { sub?: number; dub?: number };
  subOrDub?: string;
}

interface ConsumetEpisode {
  id?: string;
  number?: number | string;
  title?: string;
}

interface ConsumetWatchSource {
  url?: string;
  quality?: string;
  isM3U8?: boolean;
}

interface ConsumetWatchTrack {
  url?: string;
  lang?: string;
  language?: string;
}

interface AllAnimeSearchEdge {
  _id?: string;
  name?: string;
  englishName?: string;
  thumbnail?: string;
  availableEpisodesDetail?: { sub?: Array<string | number>; dub?: Array<string | number> };
}

interface AllAnimeSource {
  sourceUrl?: string;
  sourceName?: string;
}

const ALLANIME_DECODE_MAP: Record<string, string> = {
  '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
  '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
  '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
  '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
};

const ALLANIME_SEARCH_QUERY =
  'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name englishName thumbnail availableEpisodesDetail } } }';
const ALLANIME_SHOW_QUERY =
  'query ($showId: String!) { show(_id: $showId) { _id name englishName description thumbnail availableEpisodesDetail genres status type } }';
const ALLANIME_EPISODE_QUERY =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }';

function sanitizeMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  let url = value.trim().replace(/^['"]|['"]$/g, '');
  if (!url) return '';

  // Some providers return JS-like strings such as
  // ".../playlist.m3u8.replace(playlist.m3u8 thumbnails.vtt)".
  const replaceIdx = url.indexOf('.replace(');
  if (replaceIdx > 0) {
    url = url.slice(0, replaceIdx);
  }

  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

function corsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function ok(res: VercelResponse, data: unknown, cacheSecs = 60) {
  corsHeaders(res);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSecs}, stale-while-revalidate=300`);
  return res.status(200).json({ success: true, data });
}

function fail(res: VercelResponse, status: number, message: string) {
  corsHeaders(res);
  return res.status(status).json({ success: false, error: message });
}

async function consumetGet(path: string): Promise<unknown> {
  const url = `${CONSUMET_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nyanime/consumet-adapter',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Consumet ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Consumet returned non-JSON response');
  }
}

async function anipyGet(path: string): Promise<unknown> {
  if (!ANIPY_API_URL) {
    throw new Error('ANIPY_API_URL not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, ANIPY_TIMEOUT_MS);

  const response = await fetch(`${ANIPY_API_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nyanime/anipy-bridge-client',
    },
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ANIPY ${response.status}: ${text.slice(0, 240)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('ANIPY returned non-JSON response');
  }
}

function decodeAnipyAnimeId(value: string) {
  const parts = value.split(ID_SEPARATOR);
  if (parts.length !== 3 || parts[0] !== ANIPY_PREFIX) return null;
  return { provider: parts[1], rawId: parts[2] };
}

function decodeAnipyEpisodeId(value: string) {
  const parts = value.split(ID_SEPARATOR);
  if (parts.length !== 4 || parts[0] !== ANIPY_PREFIX) return null;
  return { provider: parts[1], rawId: parts[2], episode: parts[3] };
}

function toInternalAnimeId(value: string) {
  const decoded = decodeAnipyAnimeId(value);
  if (!decoded) return value;
  if (decoded.provider === ALLANIME_PROVIDER) {
    return `${ALLANIME_PROVIDER}${ID_SEPARATOR}${decoded.rawId}`;
  }
  return value;
}

function toInternalEpisodeId(value: string) {
  const decoded = decodeAnipyEpisodeId(value);
  if (!decoded) return value;
  if (decoded.provider === ALLANIME_PROVIDER) {
    return `${ALLANIME_PROVIDER}${ID_SEPARATOR}${decoded.rawId}${ID_SEPARATOR}${decoded.episode}`;
  }
  return value;
}

async function allAnimeGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const url = `${ALLANIME_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: ALLANIME_REFERER,
      'User-Agent': 'nyanime/allanime-adapter',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AllAnime ${response.status}: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(text) as { data?: T; errors?: Array<{ message?: string }> };
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'AllAnime GraphQL error');
  }
  if (!parsed.data) {
    throw new Error('AllAnime empty data payload');
  }
  return parsed.data;
}

function isKnownProvider(value: string) {
  return value === ALLANIME_PROVIDER || PROVIDER_PRIORITY.includes(value);
}

function encodeProviderId(providerName: string, value: string) {
  if (!value) return '';
  const separatorIdx = value.indexOf(ID_SEPARATOR);
  if (separatorIdx > 0) {
    const prefix = value.slice(0, separatorIdx);
    if (isKnownProvider(prefix)) return value;
  }
  return `${providerName}${ID_SEPARATOR}${value}`;
}

function decodeProviderId(value: string) {
  if (value.includes(ID_SEPARATOR)) {
    const [provider, ...rest] = value.split(ID_SEPARATOR);
    const rawId = rest.join(ID_SEPARATOR);
    if (provider && rawId && isKnownProvider(provider)) {
      return { provider, rawId };
    }
  }
  return { provider: PRIMARY_PROVIDER, rawId: value };
}

function decodeAllAnimeEpisodeId(value: string) {
  if (!value.startsWith(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`)) return null;
  const rest = value.slice(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`.length);
  const splitAt = rest.indexOf(ID_SEPARATOR);
  if (splitAt <= 0) return null;
  const showId = rest.slice(0, splitAt);
  const episodeString = rest.slice(splitAt + ID_SEPARATOR.length);
  if (!showId || !episodeString) return null;
  return { showId, episodeString };
}

function toEpisodeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v).trim())
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
}

function decodeAllAnimeSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return sanitizeMediaUrl(trimmed);
  if (!trimmed.startsWith('--')) {
    if (trimmed.startsWith('//')) return sanitizeMediaUrl(`https:${trimmed}`);
    if (trimmed.startsWith('/')) return sanitizeMediaUrl(`https://allanime.day${trimmed}`);
    return sanitizeMediaUrl(trimmed);
  }

  const encoded = trimmed.slice(2).replace(/\s+/g, '');
  let decoded = '';
  for (let i = 0; i < encoded.length; i += 2) {
    const pair = encoded.slice(i, i + 2).toLowerCase();
    decoded += ALLANIME_DECODE_MAP[pair] || '';
  }

  if (decoded.includes('/clock')) {
    decoded = decoded.replace('/clock', '/clock.json');
  }
  if (decoded.startsWith('//')) {
    decoded = `https:${decoded}`;
  }
  if (decoded.startsWith('/')) {
    decoded = `https://allanime.day${decoded}`;
  }
  return sanitizeMediaUrl(decoded);
}

function looksPlayableMediaUrl(value: string) {
  const lower = value.toLowerCase();
  return (
    lower.includes('.m3u8') ||
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('/media') ||
    lower.includes('tools.fast4speed')
  );
}

function mapAllAnimeSearch(edges: AllAnimeSearchEdge[]) {
  return {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    provider: ALLANIME_PROVIDER,
    animes: edges.map((item) => {
      const sub = toEpisodeList(item.availableEpisodesDetail?.sub).length;
      const dub = toEpisodeList(item.availableEpisodesDetail?.dub).length;
      return {
        id: encodeProviderId(ALLANIME_PROVIDER, item._id || ''),
        name: item.englishName || item.name || '',
        poster: item.thumbnail || '',
        type: 'TV',
        episodes: { sub, dub },
      };
    }),
  };
}

function mapAllAnimeInfo(show: {
  _id?: string;
  name?: string;
  englishName?: string;
  thumbnail?: string;
  description?: string;
  genres?: string[];
  type?: string;
  status?: string;
  availableEpisodesDetail?: { sub?: Array<string | number>; dub?: Array<string | number> };
}) {
  const subEpisodes = toEpisodeList(show.availableEpisodesDetail?.sub);
  const dubEpisodes = toEpisodeList(show.availableEpisodesDetail?.dub);

  return {
    id: encodeProviderId(ALLANIME_PROVIDER, show._id || ''),
    name: show.englishName || show.name || '',
    poster: show.thumbnail || '',
    description: show.description || '',
    stats: {
      type: show.type || 'TV',
      status: show.status || 'Unknown',
      episodes: { sub: subEpisodes.length, dub: dubEpisodes.length },
    },
    genres: Array.isArray(show.genres) ? show.genres : [],
    episodes: {
      sub: subEpisodes.map((episodeString) => ({
        number: Number(episodeString),
        title: `Episode ${episodeString}`,
        episodeId: encodeProviderId(ALLANIME_PROVIDER, `${show._id || ''}${ID_SEPARATOR}${episodeString}`),
        isFiller: false,
      })),
      dub: dubEpisodes.map((episodeString) => ({
        number: Number(episodeString),
        title: `Episode ${episodeString}`,
        episodeId: encodeProviderId(ALLANIME_PROVIDER, `${show._id || ''}${ID_SEPARATOR}${episodeString}`),
        isFiller: false,
      })),
    },
    provider: ALLANIME_PROVIDER,
  };
}

function mapAllAnimeSources(payload: { sourceUrls?: AllAnimeSource[] }) {
  const rawSources = Array.isArray(payload.sourceUrls) ? payload.sourceUrls : [];
  const seen = new Set<string>();
  const sources = rawSources
    .map((source) => {
      const decodedUrl = decodeAllAnimeSourceUrl(source.sourceUrl || '');
      if (!decodedUrl || !looksPlayableMediaUrl(decodedUrl) || seen.has(decodedUrl)) return null;
      seen.add(decodedUrl);

      const qualityMatch = String(source.sourceName || '').match(/(360|480|720|1080|1440|2160)/);
      return {
        url: decodedUrl,
        quality: qualityMatch ? `${qualityMatch[1]}p` : 'auto',
        isM3U8: decodedUrl.includes('.m3u8'),
      };
    })
    .filter((value): value is { url: string; quality: string; isM3U8: boolean } => Boolean(value));

  return {
    headers: {
      Referer: ALLANIME_REFERER,
      Origin: 'https://allanime.day',
      'User-Agent': 'Mozilla/5.0',
    },
    sources,
    tracks: [] as Array<{ lang: string; url: string }>,
    subtitles: [] as Array<{ lang: string; url: string }>,
    provider: ALLANIME_PROVIDER,
  };
}

function providerCandidatesForValue(value: string) {
  if (value.includes(ID_SEPARATOR)) {
    return [decodeProviderId(value).provider];
  }
  return PROVIDER_PRIORITY;
}

function toSearchShape(payload: unknown) {
  const data = payload as { currentPage?: number; totalPages?: number; hasNextPage?: boolean; results?: ConsumetSearchItem[] };
  const results = Array.isArray(data.results) ? data.results : [];

  return {
    currentPage: data.currentPage ?? 1,
    totalPages: data.totalPages ?? 1,
    hasNextPage: Boolean(data.hasNextPage),
    animes: results.map((item) => {
      const eps = item.episodes;
      let sub = 0;
      let dub = 0;

      if (typeof eps === 'number') {
        sub = eps;
      } else if (eps && typeof eps === 'object') {
        sub = Number(eps.sub || 0);
        dub = Number(eps.dub || 0);
      }

      if (item.subOrDub === 'dub' && dub === 0) dub = sub || 1;
      if (item.subOrDub === 'sub' && sub === 0) sub = dub || 1;

      return {
        id: item.id || '',
        name: item.title || '',
        poster: item.image || '',
        type: item.type || 'TV',
        episodes: { sub, dub },
      };
    }),
  };
}

function toInfoShape(payload: unknown) {
  const data = payload as {
    id?: string;
    title?: string;
    image?: string;
    description?: string;
    genres?: string[];
    type?: string;
    status?: string;
    totalEpisodes?: number;
    episodes?: ConsumetEpisode[];
  };

  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  return {
    id: data.id || '',
    name: data.title || '',
    poster: data.image || '',
    description: data.description || '',
    stats: {
      type: data.type || 'TV',
      status: data.status || 'Unknown',
      episodes: {
        sub: data.totalEpisodes || episodes.length,
        dub: 0,
      },
    },
    genres: Array.isArray(data.genres) ? data.genres : [],
    episodes: {
      sub: episodes.map((ep, index) => {
        const number = Number(ep.number || index + 1);
        return {
          number,
          title: ep.title || `Episode ${number}`,
          episodeId: ep.id || '',
          isFiller: false,
        };
      }),
      dub: [],
    },
  };
}

function toEpisodesShape(payload: unknown) {
  const data = payload as { episodes?: ConsumetEpisode[]; totalEpisodes?: number };
  const episodes = Array.isArray(data.episodes) ? data.episodes : [];

  return {
    totalEpisodes: data.totalEpisodes || episodes.length,
    episodes: episodes.map((ep, index) => {
      const number = Number(ep.number || index + 1);
      return {
        number,
        title: ep.title || `Episode ${number}`,
        episodeId: ep.id || '',
        isFiller: false,
      };
    }),
  };
}

function toSourcesShape(payload: unknown) {
  const data = payload as {
    headers?: Record<string, string>;
    sources?: ConsumetWatchSource[];
    subtitles?: ConsumetWatchTrack[];
    tracks?: ConsumetWatchTrack[];
    download?: string;
  };

  const rawSources = Array.isArray(data.sources) ? data.sources : [];
  const tracksRaw = Array.isArray(data.tracks)
    ? data.tracks
    : Array.isArray(data.subtitles)
      ? data.subtitles
      : [];

  const sources = rawSources
    .map((s) => {
      const cleanedUrl = sanitizeMediaUrl(s.url);
      return {
      url: cleanedUrl,
      quality: s.quality || 'auto',
      isM3U8: typeof s.isM3U8 === 'boolean' ? s.isM3U8 : cleanedUrl.includes('.m3u8'),
    };
    })
    .filter((s) => Boolean(s.url));

  const tracks = tracksRaw
    .map((t) => ({
      lang: t.lang || t.language || 'Unknown',
      url: sanitizeMediaUrl(t.url),
    }))
    .filter((t) => Boolean(t.url));

  return {
    headers: data.headers || { Referer: 'https://www.animesaturn.cx/' },
    sources,
    tracks,
    subtitles: tracks,
    download: data.download,
  };
}

function hasEnglishTrack(tracks: Array<{ lang: string; url: string }>) {
  return tracks.some((track) => {
    const lang = String(track.lang || '').toLowerCase();
    return lang === 'en' || lang === 'eng' || lang.includes('english');
  });
}

async function enrichTracksFromServers(
  providerName: string,
  episodeId: string,
  category: 'sub' | 'dub',
  currentTracks: Array<{ lang: string; url: string }>,
) {
  let bestTracks = currentTracks;
  if (category !== 'sub' || hasEnglishTrack(bestTracks) || bestTracks.length > 1) {
    return bestTracks;
  }

  try {
    const servers = await consumetGet(`/anime/${providerName}/servers/${encodeURIComponent(episodeId)}`) as Array<{ name?: string }>;
    if (!Array.isArray(servers) || servers.length === 0) {
      return bestTracks;
    }

    for (const server of servers) {
      if (!server?.name) continue;
      try {
        const candidatePayload = await consumetGet(
          `/anime/${providerName}/watch/${encodeURIComponent(episodeId)}?category=${category}&server=${encodeURIComponent(server.name)}`,
        );
        const candidateTracks = (toSourcesShape(candidatePayload) as { tracks: Array<{ lang: string; url: string }> }).tracks;
        if (!candidateTracks.length) continue;

        const bestHasEnglish = hasEnglishTrack(bestTracks);
        const candidateHasEnglish = hasEnglishTrack(candidateTracks);
        const shouldReplace =
          (!bestHasEnglish && candidateHasEnglish) ||
          (bestHasEnglish === candidateHasEnglish && candidateTracks.length > bestTracks.length);

        if (shouldReplace) {
          bestTracks = candidateTracks;
        }

        if (hasEnglishTrack(bestTracks) && bestTracks.length > 1) {
          break;
        }
      } catch {
        // Ignore per-server failure and continue probing.
      }
    }
  } catch {
    // Server endpoint may be unavailable for some providers.
  }

  return bestTracks;
}

async function fetchProviderInfoByName(providerName: string, id: string): Promise<unknown> {
  try {
    return await consumetGet(`/anime/${providerName}/info?id=${encodeURIComponent(id)}`);
  } catch {
    return consumetGet(`/anime/${providerName}/info/${encodeURIComponent(id)}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    corsHeaders(res);
    return res.status(204).end();
  }

  const q = req.query as Record<string, string | undefined>;
  const action = q.action;

  if (!action) return fail(res, 400, 'Missing action param');

  try {
    switch (action) {
      case 'home':
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet('/aniwatch/home') as { success?: boolean; data?: unknown };
            if (payload?.success && payload.data) return ok(res, payload.data, 30);
          } catch {
            // Fall back to internal resolver chain.
          }
        }
        return ok(res, {
          spotlightAnimes: [],
          trendingAnimes: [],
          latestEpisodeAnimes: [],
          top10Animes: { today: [], week: [], month: [] },
           provider: ALLANIME_PROVIDER,
           providerPriority: [ALLANIME_PROVIDER, ...PROVIDER_PRIORITY],
        }, 30);

      case 'search': {
        const query = q.q;
        if (!query) return fail(res, 400, 'Missing q');
        const page = Number(q.page || '1');
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet(`/aniwatch/search?q=${encodeURIComponent(query)}&page=${page}`) as { success?: boolean; data?: { animes?: unknown[] } };
            if (payload?.success && Array.isArray(payload?.data?.animes) && payload.data.animes.length > 0) {
              return ok(res, payload.data, 120);
            }
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        try {
          const allanimeData = await allAnimeGraphQL<{ shows?: { edges?: AllAnimeSearchEdge[] } }>(ALLANIME_SEARCH_QUERY, {
            search: { allowAdult: false, allowUnknown: false, query },
            limit: 40,
            page,
            translationType: 'sub',
            countryOrigin: 'ALL',
          });
          const edges = Array.isArray(allanimeData.shows?.edges) ? allanimeData.shows?.edges || [] : [];
          const mapped = mapAllAnimeSearch(edges);
          if (mapped.animes.length > 0) return ok(res, mapped, 120);
        } catch {
          // Fall through to Consumet providers.
        }

        let payload: unknown = null;
        let usedProvider = PRIMARY_PROVIDER;
        for (const providerName of PROVIDER_PRIORITY) {
          try {
            const candidate = await consumetGet(`/anime/${providerName}/${encodeURIComponent(query)}?page=${page}`);
            const results = (candidate as { results?: unknown[] })?.results;
            if (Array.isArray(results) && results.length > 0) {
              payload = candidate;
              usedProvider = providerName;
              break;
            }
          } catch {
            // Try next provider.
          }
        }

        if (!payload) {
          return fail(res, 502, `Search failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        }
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string }>; [key: string]: unknown };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        mapped.provider = usedProvider;
        return ok(res, mapped, 120);
      }

      case 'suggestions': {
        const query = q.q;
        if (!query) return fail(res, 400, 'Missing q');
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet(`/aniwatch/suggestions?q=${encodeURIComponent(query)}`) as { success?: boolean; data?: unknown[] };
            if (payload?.success && Array.isArray(payload?.data) && payload.data.length > 0) {
              return ok(res, payload.data, 60);
            }
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        try {
          const allanimeData = await allAnimeGraphQL<{ shows?: { edges?: AllAnimeSearchEdge[] } }>(ALLANIME_SEARCH_QUERY, {
            search: { allowAdult: false, allowUnknown: false, query },
            limit: 10,
            page: 1,
            translationType: 'sub',
            countryOrigin: 'ALL',
          });
          const edges = Array.isArray(allanimeData.shows?.edges) ? allanimeData.shows?.edges || [] : [];
          const mapped = mapAllAnimeSearch(edges);
          if (mapped.animes.length > 0) return ok(res, mapped.animes.slice(0, 10), 60);
        } catch {
          // Fall through to Consumet providers.
        }

        let payload: unknown = null;
        let usedProvider = PRIMARY_PROVIDER;
        for (const providerName of PROVIDER_PRIORITY) {
          try {
            const candidate = await consumetGet(`/anime/${providerName}/${encodeURIComponent(query)}?page=1`);
            const results = (candidate as { results?: unknown[] })?.results;
            if (Array.isArray(results) && results.length > 0) {
              payload = candidate;
              usedProvider = providerName;
              break;
            }
          } catch {
            // Try next provider.
          }
        }

        if (!payload) {
          return fail(res, 502, `Suggestions failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        }
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string; name: string; poster: string }> };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        return ok(res, mapped.animes.slice(0, 10), 60);
      }

      case 'info': {
        const idParamRaw = q.id;
        const idParam = idParamRaw ? toInternalAnimeId(idParamRaw) : idParamRaw;
        if (!idParam) return fail(res, 400, 'Missing id');
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet(`/aniwatch/info?id=${encodeURIComponent(idParam)}`) as { success?: boolean; data?: unknown };
            if (payload?.success && payload?.data) return ok(res, payload.data, 300);
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        if (idParam.startsWith(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`)) {
          const showId = idParam.slice(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`.length);
          try {
            const allanimeData = await allAnimeGraphQL<{ show?: {
              _id?: string;
              name?: string;
              englishName?: string;
              thumbnail?: string;
              description?: string;
              genres?: string[];
              type?: string;
              status?: string;
              availableEpisodesDetail?: { sub?: Array<string | number>; dub?: Array<string | number> };
            } }>(ALLANIME_SHOW_QUERY, { showId });
            if (!allanimeData.show?._id) return fail(res, 404, 'Anime not found');
            return ok(res, mapAllAnimeInfo(allanimeData.show), 300);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch Allanime info';
            return fail(res, 502, message);
          }
        }
        const decoded = decodeProviderId(idParam);
        let payload: unknown = null;
        let usedProvider = decoded.provider;
        for (const providerName of providerCandidatesForValue(idParam)) {
          try {
            payload = await fetchProviderInfoByName(providerName, decoded.rawId);
            usedProvider = providerName;
            break;
          } catch {
            // Try next provider.
          }
        }
        if (!payload) return fail(res, 502, 'Failed to fetch anime info from all providers');
        const mapped = toInfoShape(payload) as { id: string; episodes: { sub: Array<{ episodeId: string }> }; provider?: string };
        mapped.id = encodeProviderId(usedProvider, mapped.id || decoded.rawId);
        mapped.episodes.sub = (mapped.episodes?.sub || []).map((ep) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) }));
        mapped.provider = usedProvider;
        return ok(res, mapped, 300);
      }

      case 'episodes': {
        const idParamRaw = q.id;
        const idParam = idParamRaw ? toInternalAnimeId(idParamRaw) : idParamRaw;
        if (!idParam) return fail(res, 400, 'Missing id');
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet(`/aniwatch/episodes?id=${encodeURIComponent(idParam)}`) as { success?: boolean; data?: unknown };
            if (payload?.success && payload?.data) return ok(res, payload.data, 300);
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        if (idParam.startsWith(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`)) {
          const showId = idParam.slice(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`.length);
          try {
            const allanimeData = await allAnimeGraphQL<{ show?: { _id?: string; availableEpisodesDetail?: { sub?: Array<string | number> } } }>(
              ALLANIME_SHOW_QUERY,
              { showId },
            );
            const subEpisodes = toEpisodeList(allanimeData.show?.availableEpisodesDetail?.sub);
            const episodes = subEpisodes.map((episodeString) => ({
              number: Number(episodeString),
              title: `Episode ${episodeString}`,
              episodeId: encodeProviderId(ALLANIME_PROVIDER, `${showId}${ID_SEPARATOR}${episodeString}`),
              isFiller: false,
            }));
            return ok(res, { totalEpisodes: episodes.length, episodes, provider: ALLANIME_PROVIDER }, 300);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch Allanime episodes';
            return fail(res, 502, message);
          }
        }
        const decoded = decodeProviderId(idParam);
        let payload: unknown = null;
        let usedProvider = decoded.provider;
        for (const providerName of providerCandidatesForValue(idParam)) {
          try {
            payload = await fetchProviderInfoByName(providerName, decoded.rawId);
            usedProvider = providerName;
            break;
          } catch {
            // Try next provider.
          }
        }
        if (!payload) return fail(res, 502, 'Failed to fetch episodes from all providers');
        const mapped = toEpisodesShape(payload) as { episodes: Array<{ episodeId: string }>; provider?: string };
        mapped.episodes = (mapped.episodes || []).map((ep) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) }));
        mapped.provider = usedProvider;
        return ok(res, mapped, 300);
      }

      case 'servers': {
        const episodeIdRaw = q.episodeId;
        const episodeIdParam = episodeIdRaw ? toInternalEpisodeId(episodeIdRaw) : episodeIdRaw;
        if (!episodeIdParam) return fail(res, 400, 'Missing episodeId');
        if (ANIPY_API_URL) {
          try {
            const payload = await anipyGet(`/aniwatch/servers?episodeId=${encodeURIComponent(episodeIdParam)}`) as { success?: boolean; data?: unknown };
            if (payload?.success && payload?.data) return ok(res, payload.data, 60);
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        if (episodeIdParam.startsWith(`${ALLANIME_PROVIDER}${ID_SEPARATOR}`)) {
          return ok(res, {
            episodeId: episodeIdParam,
            episodeNo: 0,
            sub: [{ serverId: 1, serverName: ALLANIME_PROVIDER }],
            dub: [],
            raw: [],
          }, 60);
        }
        const decodedEpisode = decodeProviderId(episodeIdParam);
        return ok(res, {
          episodeId: episodeIdParam,
          episodeNo: 0,
          sub: [{ serverId: 1, serverName: decodedEpisode.provider }],
          dub: [],
          raw: [],
        }, 60);
      }

      case 'sources': {
        const episodeIdRaw = q.episodeId;
        const episodeIdParam = episodeIdRaw ? toInternalEpisodeId(episodeIdRaw) : episodeIdRaw;
        if (!episodeIdParam) return fail(res, 400, 'Missing episodeId');
        if (ANIPY_API_URL) {
          try {
            const category = q.category === 'dub' ? 'dub' : 'sub';
            const payload = await anipyGet(`/aniwatch/sources?episodeId=${encodeURIComponent(episodeIdParam)}&category=${category}`) as { success?: boolean; data?: { sources?: unknown[] } };
            if (payload?.success && Array.isArray(payload?.data?.sources) && payload.data.sources.length > 0) {
              return ok(res, payload.data, 0);
            }
          } catch {
            // Fall through to existing resolver chain.
          }
        }
        const allanimeEpisode = decodeAllAnimeEpisodeId(episodeIdParam);
        if (allanimeEpisode) {
          try {
            const category = q.category === 'dub' ? 'dub' : 'sub';
            const allanimeData = await allAnimeGraphQL<{ episode?: { sourceUrls?: AllAnimeSource[] } }>(ALLANIME_EPISODE_QUERY, {
              showId: allanimeEpisode.showId,
              translationType: category,
              episodeString: allanimeEpisode.episodeString,
            });
            const mapped = mapAllAnimeSources({ sourceUrls: allanimeData.episode?.sourceUrls });
            if (!mapped.sources.length) return fail(res, 404, 'No streaming sources found');
            return ok(res, mapped, 0);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch Allanime sources';
            return fail(res, 502, message);
          }
        }
        const decodedEpisode = decodeProviderId(episodeIdParam);

        const category = q.category === 'dub' ? 'dub' : 'sub';
        const server = q.server ? `&server=${encodeURIComponent(q.server)}` : '';
        let payload: unknown = null;
        let usedProvider = decodedEpisode.provider;
        for (const providerName of providerCandidatesForValue(episodeIdParam)) {
          try {
            payload = await consumetGet(
              `/anime/${providerName}/watch/${encodeURIComponent(decodedEpisode.rawId)}?category=${category}${server}`,
            );
            usedProvider = providerName;
            break;
          } catch {
            // Try next provider.
          }
        }
        if (!payload) return fail(res, 502, 'Failed to fetch streaming sources from all providers');

        const data = toSourcesShape(payload) as { sources: unknown[]; tracks: Array<{ lang: string; url: string }>; subtitles: Array<{ lang: string; url: string }>; provider?: string };
        data.tracks = await enrichTracksFromServers(usedProvider, decodedEpisode.rawId, category, data.tracks || []);
        data.subtitles = data.tracks;
        data.provider = usedProvider;
        if (!data.sources.length) {
          return fail(res, 404, 'No streaming sources found');
        }

        return ok(res, data, 0);
      }

      default:
        return fail(res, 400, `Unknown action: ${action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return fail(res, 500, message);
  }
}

export const config = { api: { bodyParser: false }, maxDuration: 30 };
