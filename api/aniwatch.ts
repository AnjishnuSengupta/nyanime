import type { VercelRequest, VercelResponse } from '@vercel/node';

const CONSUMET_BASE = process.env.VITE_CONSUMET_API_URL || 'https://consumet.nyanime.tech';
const PRIMARY_PROVIDER = process.env.CONSUMET_ANIME_PROVIDER || 'animesaturn';
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

function encodeProviderId(providerName: string, value: string) {
  if (!value) return '';
  if (value.includes(ID_SEPARATOR)) return value;
  return `${providerName}${ID_SEPARATOR}${value}`;
}

function decodeProviderId(value: string) {
  if (value.includes(ID_SEPARATOR)) {
    const [provider, ...rest] = value.split(ID_SEPARATOR);
    const rawId = rest.join(ID_SEPARATOR);
    if (provider && rawId) {
      return { provider, rawId };
    }
  }
  return { provider: PRIMARY_PROVIDER, rawId: value };
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
        return ok(res, {
          spotlightAnimes: [],
          trendingAnimes: [],
          latestEpisodeAnimes: [],
          top10Animes: { today: [], week: [], month: [] },
          provider: PRIMARY_PROVIDER,
          providerPriority: PROVIDER_PRIORITY,
        }, 30);

      case 'search': {
        const query = q.q;
        if (!query) return fail(res, 400, 'Missing q');
        const page = Number(q.page || '1');
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

        if (!payload) return fail(res, 502, `Search failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string }>; [key: string]: unknown };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        mapped.provider = usedProvider;
        return ok(res, mapped, 120);
      }

      case 'suggestions': {
        const query = q.q;
        if (!query) return fail(res, 400, 'Missing q');
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

        if (!payload) return fail(res, 502, `Suggestions failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string; name: string; poster: string }> };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        return ok(res, mapped.animes.slice(0, 10), 60);
      }

      case 'info': {
        const idParam = q.id;
        if (!idParam) return fail(res, 400, 'Missing id');
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
        const idParam = q.id;
        if (!idParam) return fail(res, 400, 'Missing id');
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
        const episodeIdParam = q.episodeId;
        if (!episodeIdParam) return fail(res, 400, 'Missing episodeId');
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
        const episodeIdParam = q.episodeId;
        if (!episodeIdParam) return fail(res, 400, 'Missing episodeId');
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
