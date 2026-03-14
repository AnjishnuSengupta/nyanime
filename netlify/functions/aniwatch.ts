import type { Handler, HandlerEvent } from '@netlify/functions';

const CONSUMET_BASE = process.env.VITE_CONSUMET_API_URL || 'https://consumet.nyanime.tech';
const PRIMARY_PROVIDER = process.env.CONSUMET_ANIME_PROVIDER || 'animekai';
const FALLBACK_PROVIDERS = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'hianime,kickassanime,animesaturn,animepahe')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const PROVIDER_PRIORITY = [PRIMARY_PROVIDER, ...FALLBACK_PROVIDERS].filter((p, i, arr) => arr.indexOf(p) === i);
const ID_SEPARATOR = '::';

type ConsumetSearchItem = {
  id?: string;
  title?: string;
  image?: string;
  type?: string;
  episodes?: number | { sub?: number; dub?: number };
  subOrDub?: string;
};

type ConsumetEpisode = {
  id?: string;
  number?: number | string;
  title?: string;
};

type ConsumetWatchSource = {
  url?: string;
  quality?: string;
  isM3U8?: boolean;
};

type ConsumetWatchTrack = {
  url?: string;
  lang?: string;
  language?: string;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function ok(data: unknown, cacheSecs = 60) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${cacheSecs}, stale-while-revalidate=300`,
      ...corsHeaders,
    },
    body: JSON.stringify({ success: true, data }),
  };
}

function fail(status: number, message: string) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify({ success: false, error: message }),
  };
}

async function consumetGet(path: string): Promise<unknown> {
  const response = await fetch(`${CONSUMET_BASE}${path}`, {
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
    .filter((s) => Boolean(s.url))
    .map((s) => ({
      url: s.url as string,
      quality: s.quality || 'auto',
      isM3U8: typeof s.isM3U8 === 'boolean' ? s.isM3U8 : (s.url || '').includes('.m3u8'),
    }));

  const tracks = tracksRaw
    .filter((t) => Boolean(t.url))
    .map((t) => ({
      lang: t.lang || t.language || 'Unknown',
      url: t.url as string,
    }));

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

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
      body: '',
    };
  }

  const params = new URLSearchParams((event.queryStringParameters as Record<string, string>) || {});
  const action = params.get('action');

  if (!action) return fail(400, 'Missing action param');

  try {
    switch (action) {
      case 'home':
        return ok({
          spotlightAnimes: [],
          trendingAnimes: [],
          latestEpisodeAnimes: [],
          top10Animes: { today: [], week: [], month: [] },
          provider: PRIMARY_PROVIDER,
          providerPriority: PROVIDER_PRIORITY,
        }, 30);

      case 'search': {
        const query = params.get('q');
        if (!query) return fail(400, 'Missing q');
        const page = Number(params.get('page') || '1');
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

        if (!payload) return fail(502, `Search failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string }>; [key: string]: unknown };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        mapped.provider = usedProvider;
        return ok(mapped, 120);
      }

      case 'suggestions': {
        const query = params.get('q');
        if (!query) return fail(400, 'Missing q');
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

        if (!payload) return fail(502, `Suggestions failed for providers: ${PROVIDER_PRIORITY.join(', ')}`);
        const mapped = toSearchShape(payload) as { animes: Array<{ id: string; name: string; poster: string }> };
        mapped.animes = mapped.animes.map((item) => ({ ...item, id: encodeProviderId(usedProvider, item.id) }));
        return ok(mapped.animes.slice(0, 10), 60);
      }

      case 'info': {
        const idParam = params.get('id');
        if (!idParam) return fail(400, 'Missing id');
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
        if (!payload) return fail(502, 'Failed to fetch anime info from all providers');
        const mapped = toInfoShape(payload) as { id: string; episodes: { sub: Array<{ episodeId: string }> }; provider?: string };
        mapped.id = encodeProviderId(usedProvider, mapped.id || decoded.rawId);
        mapped.episodes.sub = (mapped.episodes?.sub || []).map((ep) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) }));
        mapped.provider = usedProvider;
        return ok(mapped, 300);
      }

      case 'episodes': {
        const idParam = params.get('id');
        if (!idParam) return fail(400, 'Missing id');
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
        if (!payload) return fail(502, 'Failed to fetch episodes from all providers');
        const mapped = toEpisodesShape(payload) as { episodes: Array<{ episodeId: string }>; provider?: string };
        mapped.episodes = (mapped.episodes || []).map((ep) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) }));
        mapped.provider = usedProvider;
        return ok(mapped, 300);
      }

      case 'servers': {
        const episodeIdParam = params.get('episodeId');
        if (!episodeIdParam) return fail(400, 'Missing episodeId');
        const decodedEpisode = decodeProviderId(episodeIdParam);
        return ok({
          episodeId: episodeIdParam,
          episodeNo: 0,
          sub: [{ serverId: 1, serverName: decodedEpisode.provider }],
          dub: [],
          raw: [],
        }, 60);
      }

      case 'sources': {
        const episodeIdParam = params.get('episodeId');
        if (!episodeIdParam) return fail(400, 'Missing episodeId');
        const decodedEpisode = decodeProviderId(episodeIdParam);

        const category = params.get('category') === 'dub' ? 'dub' : 'sub';
        const server = params.get('server');
        const serverParam = server ? `&server=${encodeURIComponent(server)}` : '';
        let payload: unknown = null;
        let usedProvider = decodedEpisode.provider;
        for (const providerName of providerCandidatesForValue(episodeIdParam)) {
          try {
            payload = await consumetGet(
              `/anime/${providerName}/watch/${encodeURIComponent(decodedEpisode.rawId)}?category=${category}${serverParam}`,
            );
            usedProvider = providerName;
            break;
          } catch {
            // Try next provider.
          }
        }
        if (!payload) return fail(502, 'Failed to fetch streaming sources from all providers');

        const data = toSourcesShape(payload) as { sources: unknown[]; tracks: Array<{ lang: string; url: string }>; subtitles: Array<{ lang: string; url: string }>; provider?: string };
        data.tracks = await enrichTracksFromServers(usedProvider, decodedEpisode.rawId, category, data.tracks || []);
        data.subtitles = data.tracks;
        data.provider = usedProvider;
        if (!data.sources.length) return fail(404, 'No streaming sources found');
        return ok(data, 0);
      }

      default:
        return fail(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return fail(500, message);
  }
};
