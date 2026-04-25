/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Dev-only middleware: emulate /aniwatch?action=... using Consumet provider data.
function aniwatchDevPlugin(): Plugin {
  const base = process.env.VITE_CONSUMET_API_URL || 'https://consumet.nyanime.qzz.io';
  const primaryProvider = process.env.CONSUMET_ANIME_PROVIDER || 'animesaturn';
  const allanimeProvider = 'allanime';
  const allanimeApi = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
  const allanimeReferer = process.env.ALLANIME_REFERER || 'https://allmanga.to';
  const fallbackProviders = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'animepahe,animekai,kickassanime,animeunity')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const providerPriority = [primaryProvider, ...fallbackProviders].filter((p, i, arr) => arr.indexOf(p) === i);
  const ID_SEPARATOR = '::';
  const decodeMap: Record<string, string> = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
    '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
    '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
    '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
  };
  const allanimeSearchQuery = 'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name englishName thumbnail availableEpisodesDetail } } }';
  const allanimeShowQuery = 'query ($showId: String!) { show(_id: $showId) { _id name englishName description thumbnail availableEpisodesDetail genres status type } }';
  const allanimeEpisodeQuery = 'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }';

  // ═══════════════════════════════════════════════════════════════════════════
  // AnimeKAI Provider (primary provider since AllAnime API shutdown)
  // ═══════════════════════════════════════════════════════════════════════════
  const ANIMEKAI_PROVIDER = 'animekai';
  const ANIMEKAI_URL = process.env.ANIMEKAI_BASE_URL || 'https://anikai.to';
  const ANIMEKAI_SEARCH_URL = `${ANIMEKAI_URL}/ajax/anime/search`;
  const ANIMEKAI_EPISODES_URL = `${ANIMEKAI_URL}/ajax/episodes/list`;
  const ANIMEKAI_SERVERS_URL = `${ANIMEKAI_URL}/ajax/links/list`;
  const ANIMEKAI_LINKS_VIEW_URL = `${ANIMEKAI_URL}/ajax/links/view`;
  const ENCDEC_URL = 'https://enc-dec.app/api/enc-kai';
  const ENCDEC_DEC_KAI = 'https://enc-dec.app/api/dec-kai';
  const ENCDEC_DEC_MEGA = 'https://enc-dec.app/api/dec-mega';

  const ANIMEKAI_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };
  const ANIMEKAI_AJAX_HEADERS: Record<string, string> = {
    ...ANIMEKAI_HEADERS,
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
  };

  // AnimeKAI token encoding via enc-dec.app
  const encodeAnimeKaiToken = async (text: string): Promise<string | null> => {
    try {
      const r = await fetch(`${ENCDEC_URL}?text=${encodeURIComponent(text)}`, { headers: ANIMEKAI_HEADERS });
      const d = await r.json() as { status: number; result?: string };
      return d.status === 200 ? (d.result || null) : null;
    } catch { /* silent fallback */ return null; }
  };

  // Decrypt AnimeKAI response (dec-kai)
  const decodeAnimeKaiResponse = async (encrypted: string): Promise<any> => {
    try {
      const r = await fetch(ENCDEC_DEC_KAI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ANIMEKAI_HEADERS },
        body: JSON.stringify({ text: encrypted }),
      });
      const d = await r.json() as { status: number; result?: any };
      if (d.status !== 200) return null;
      return typeof d.result === 'object' ? d.result : JSON.parse(d.result as string);
    } catch { /* silent fallback */ return null; }
  };

  // Decrypt mega/megacloud media (dec-mega)
  const decodeMegaResponse = async (encrypted: string): Promise<any> => {
    try {
      const r = await fetch(ENCDEC_DEC_MEGA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ANIMEKAI_HEADERS },
        body: JSON.stringify({ text: encrypted, agent: ANIMEKAI_HEADERS['User-Agent'] }),
      });
      const d = await r.json() as { status: number; result?: any };
      if (d.status !== 200) return null;
      return typeof d.result === 'object' ? d.result : JSON.parse(d.result as string);
    } catch { /* silent fallback */ return null; }
  };

  // AnimeKAI search
  const animeKaiSearch = async (query: string) => {
    try {
      const r = await fetch(`${ANIMEKAI_SEARCH_URL}?keyword=${encodeURIComponent(query)}`, { headers: ANIMEKAI_AJAX_HEADERS });
      const d = await r.json() as { status: string; result?: { html: string } };
      const html = d.result?.html || '';
      if (!html) return [];

      const results: any[] = [];
      const itemRegex = /<a class="aitem" href="([^"]+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h6 class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h6>[\s\S]*?<div class="info">([\s\S]*?)<\/div>/g;
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const [, href, poster, jpTitle, title, infoHtml] = match;
        const slug = href.replace('/watch/', '');
        const subMatch = infoHtml.match(/<span class="sub">.*?<\/svg>(\d+)<\/span>/);
        const dubMatch = infoHtml.match(/<span class="dub">.*?<\/svg>(\d+)<\/span>/);
        results.push({
          id: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}`,
          name: title.trim(),
          jname: jpTitle,
          poster,
          type: 'TV',
          episodes: {
            sub: subMatch ? parseInt(subMatch[1]) : 0,
            dub: dubMatch ? parseInt(dubMatch[1]) : 0,
          },
        });
      }
      return results;
    } catch { /* silent fallback */ return []; }
  };

  // AnimeKAI get anime info from watch page
  const animeKaiInfo = async (slug: string) => {
    const r = await fetch(`${ANIMEKAI_URL}/watch/${slug}`, { headers: ANIMEKAI_HEADERS });
    const html = await r.text();
    const syncMatch = html.match(/<script id="syncData"[^>]*>([^<]+)<\/script>/);
    let aniId = '';
    if (syncMatch) { try { aniId = JSON.parse(syncMatch[1]).anime_id || ''; } catch { /* ignore parse error */ } }
    const titleMatch = html.match(/<h1[^>]*class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h1>/);
    return { aniId, title: titleMatch?.[2]?.trim() || '', jname: titleMatch?.[1] || '' };
  };

  // AnimeKAI get episodes
  const animeKaiEpisodes = async (aniId: string) => {
    const encoded = await encodeAnimeKaiToken(aniId);
    if (!encoded) return [];
    const r = await fetch(`${ANIMEKAI_EPISODES_URL}?ani_id=${aniId}&_=${encoded}`, { headers: ANIMEKAI_AJAX_HEADERS });
    const d = await r.json() as { result?: string };
    const html = d.result || '';
    const episodes: { number: number; token: string; hasSub: boolean; hasDub: boolean }[] = [];
    
    // Find all <a> tags with episode attributes (flexible attribute order)
    const aTagRegex = /<a\s+[^>]*num="[^"]*"[^>]*>/g;
    let tagMatch;
    while ((tagMatch = aTagRegex.exec(html)) !== null) {
      const tag = tagMatch[0];
      
      // Extract attributes from the tag
      const numMatch = tag.match(/num="(\d+)"/);
      const langsMatch = tag.match(/langs="(\d+)"/);
      const tokenMatch = tag.match(/token="([^"]*)"/);
      
      if (numMatch && tokenMatch) {
        const langsNum = langsMatch ? parseInt(langsMatch[1]) : 3; // Default to both sub and dub
        episodes.push({
          number: parseInt(numMatch[1]),
          token: tokenMatch[1],
          hasSub: Boolean(langsNum & 1),
          hasDub: Boolean(langsNum & 2),
        });
      }
    }
    return episodes;
  };

  // AnimeKAI get servers for an episode
  const animeKaiServers = async (epToken: string) => {
    const encoded = await encodeAnimeKaiToken(epToken);
    if (!encoded) return { sub: [] as any[], dub: [] as any[], softsub: [] as any[] };
    const r = await fetch(`${ANIMEKAI_SERVERS_URL}?token=${epToken}&_=${encoded}`, { headers: ANIMEKAI_AJAX_HEADERS });
    const d = await r.json() as { result?: string };
    const html = d.result || '';
    const parseSection = (dataId: string) => {
      const list: { linkId: string; name: string }[] = [];
      const sectionRegex = new RegExp(
        'class="server-items[^"]*"[^>]*data-id="' + dataId + '"[^>]*>([\\s\\S]*?)(?=<div[^>]*class="server-items|$)'
      );
      const match = html.match(sectionRegex);
      if (match) {
        const serverRegex = /data-lid="([^"]*)"[^>]*>([^<]+)/g;
        let sm;
        while ((sm = serverRegex.exec(match[1])) !== null) {
          list.push({ linkId: sm[1], name: sm[2].trim() });
        }
      }
      return list;
    };
    return { sub: parseSection('sub'), softsub: parseSection('softsub'), dub: parseSection('dub') };
  };

  // AnimeKAI resolve streaming source
  const animeKaiSource = async (linkId: string) => {
    const encoded = await encodeAnimeKaiToken(linkId);
    if (!encoded) return null;
    const srcResp = await fetch(`${ANIMEKAI_LINKS_VIEW_URL}?id=${linkId}&_=${encoded}`, { headers: ANIMEKAI_AJAX_HEADERS });
    const srcData = await srcResp.json() as { result?: string };
    if (!srcData.result) return null;

    const embedData = await decodeAnimeKaiResponse(srcData.result);
    if (!embedData?.url) return null;

    const embedUrl = embedData.url as string;
    const videoId = embedUrl.split('/').filter(Boolean).pop()?.split('?')[0];
    const embedBase = embedUrl.includes('/e/') ? embedUrl.split('/e/')[0] : embedUrl.substring(0, embedUrl.lastIndexOf('/'));

    let mediaData: any;
    try {
      const mediaResp = await fetch(`${embedBase}/media/${videoId}`, {
        headers: { ...ANIMEKAI_HEADERS, 'Referer': embedUrl },
      });
      if (mediaResp.ok) mediaData = await mediaResp.json();
    } catch { /* media fetch failed */ }
    if (!mediaData) return null;

    // Decrypt the encrypted result - handle both .result and .sources formats
    let finalData: any;
    if (mediaData.result) {
      finalData = await decodeMegaResponse(mediaData.result);
    } else if (mediaData.sources) {
      if (typeof mediaData.sources === 'string') {
        finalData = await decodeMegaResponse(mediaData.sources);
      } else {
        finalData = mediaData;
      }
    }
    if (!finalData) return null;

    return {
      embedUrl,
      skip: embedData.skip || {},
      sources: finalData.sources || [],
      tracks: finalData.tracks || [],
    };
  };

  // Helper: decode AnimeKAI episode ID (format: animekai::slug::token[::dub])
  const decodeAnimeKaiEpisodeId = (value: string) => {
    if (!value.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) return null;
    const parts = value.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length).split(ID_SEPARATOR);
    if (parts.length < 2) return null;
    return { slug: parts[0], epToken: parts[1], isDub: parts[2] === 'dub' };
  };

  return {
    name: 'aniwatch-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url || !req.url.startsWith('/aniwatch')) { next(); return; }

          const url = new URL(req.url, 'http://localhost');
          const action = url.searchParams.get('action');
          if (!action) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Missing action param' }));
            return;
          }

          const send = (status: number, payload: any) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify(payload));
          };

          const getJson = async (path: string) => {
            const response = await fetch(`${base}${path}`, {
              headers: {
                Accept: 'application/json',
                'User-Agent': 'nyanime/consumet-adapter',
              },
            });
            const text = await response.text();
            if (!response.ok) {
              throw new Error(`Consumet ${response.status}: ${text.slice(0, 200)}`);
            }
            return JSON.parse(text);
          };

          const allAnimeGraphQL = async (query: string, variables: Record<string, unknown>) => {
            const graphqlUrl = `${allanimeApi}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
            const response = await fetch(graphqlUrl, {
              headers: {
                Accept: 'application/json',
                Referer: allanimeReferer,
                'User-Agent': 'nyanime/allanime-adapter',
              },
            });
            const text = await response.text();
            if (!response.ok) {
              throw new Error(`AllAnime ${response.status}: ${text.slice(0, 200)}`);
            }
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
              throw new Error(parsed.errors[0]?.message || 'AllAnime GraphQL error');
            }
            return parsed.data;
          };

          const toEpisodeList = (value: unknown): string[] => {
            if (!Array.isArray(value)) return [];
            return value
              .map((item) => String(item).trim())
              .filter(Boolean)
              .sort((a, b) => Number(a) - Number(b));
          };

          const sanitizeMediaUrl = (value: unknown): string => {
            if (typeof value !== 'string') return '';
            let clean = value.trim().replace(/^['"]|['"]$/g, '');
            if (!clean) return '';
            const replaceIdx = clean.indexOf('.replace(');
            if (replaceIdx > 0) clean = clean.slice(0, replaceIdx);
            try {
              return new URL(clean).toString();
            } catch {
              return '';
            }
          };

          const decodeAllAnimeSource = (raw: string) => {
            const trimmed = String(raw || '').trim();
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
              decoded += decodeMap[encoded.slice(i, i + 2).toLowerCase()] || '';
            }
            if (decoded.includes('/clock')) decoded = decoded.replace('/clock', '/clock.json');
            if (decoded.startsWith('//')) decoded = `https:${decoded}`;
            if (decoded.startsWith('/')) decoded = `https://allanime.day${decoded}`;
            return sanitizeMediaUrl(decoded);
          };

          const looksPlayableMediaUrl = (value: string) => {
            const lower = value.toLowerCase();
            return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.webm') || lower.includes('/media') || lower.includes('tools.fast4speed');
          };

          const encodeProviderId = (providerName: string, value: string) => {
            if (!value) return '';
            const separatorIdx = value.indexOf(ID_SEPARATOR);
            if (separatorIdx > 0) {
              const prefix = value.slice(0, separatorIdx);
              if (prefix === allanimeProvider || providerPriority.includes(prefix)) return value;
            }
            return `${providerName}${ID_SEPARATOR}${value}`;
          };

          const decodeProviderId = (value: string) => {
            if (value.includes(ID_SEPARATOR)) {
              const [provider, ...rest] = value.split(ID_SEPARATOR);
              const rawId = rest.join(ID_SEPARATOR);
              if (provider && rawId && (provider === allanimeProvider || providerPriority.includes(provider))) {
                return { provider, rawId };
              }
            }
            return { provider: primaryProvider, rawId: value };
          };

          const decodeAllAnimeEpisodeId = (value: string) => {
            if (!value.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) return null;
            const rest = value.slice(`${allanimeProvider}${ID_SEPARATOR}`.length);
            const splitAt = rest.indexOf(ID_SEPARATOR);
            if (splitAt <= 0) return null;
            return {
              showId: rest.slice(0, splitAt),
              episodeString: rest.slice(splitAt + ID_SEPARATOR.length),
            };
          };

          const providerCandidatesForValue = (value: string) => {
            if (value.includes(ID_SEPARATOR)) {
              return [decodeProviderId(value).provider];
            }
            return providerPriority;
          };

          const toEpisodes = (info: any) => {
            const eps = Array.isArray(info?.episodes) ? info.episodes : [];
            return {
              totalEpisodes: info?.totalEpisodes || eps.length,
              episodes: eps.map((ep: any, index: number) => {
                const number = Number(ep?.number || index + 1);
                return {
                  number,
                  title: ep?.title || `Episode ${number}`,
                  episodeId: ep?.id || '',
                  isFiller: false,
                };
              }),
            };
          };

          const normalizeTracks = (payload: any) => {
            const trackRaw = Array.isArray(payload?.tracks)
              ? payload.tracks
              : Array.isArray(payload?.subtitles)
                ? payload.subtitles
                : [];

            const seen = new Set<string>();
            return trackRaw
              .filter((t: any) => Boolean(t?.url) && !seen.has(String(t.url)) && seen.add(String(t.url)))
              .map((t: any) => ({ lang: t?.lang || t?.language || 'Unknown', url: t.url }));
          };

          const hasEnglishTrack = (tracks: Array<{ lang: string; url: string }>) => {
            return tracks.some((track) => {
              const lang = String(track.lang || '').toLowerCase();
              return lang === 'en' || lang === 'eng' || lang.includes('english');
            });
          };

          const enrichTracksFromServers = async (
            providerName: string,
            episodeId: string,
            category: 'sub' | 'dub',
            initialTracks: Array<{ lang: string; url: string }>,
          ) => {
            let bestTracks = initialTracks;
            if (category !== 'sub' || hasEnglishTrack(bestTracks) || bestTracks.length > 1) {
              return bestTracks;
            }

            try {
              const servers: any = await getJson(`/anime/${providerName}/servers/${encodeURIComponent(episodeId)}`);
              if (!Array.isArray(servers) || servers.length === 0) {
                return bestTracks;
              }

              for (const srv of servers) {
                const name = srv?.name;
                if (!name || typeof name !== 'string') continue;
                try {
                  const candidate: any = await getJson(
                    `/anime/${providerName}/watch/${encodeURIComponent(episodeId)}?category=${category}&server=${encodeURIComponent(name)}`,
                  );
                  const candidateTracks = normalizeTracks(candidate);
                  if (candidateTracks.length === 0) continue;

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
                  // Ignore per-server failures and keep probing.
                }
              }
            } catch {
              // Provider may not expose server listing endpoint.
            }

            return bestTracks;
          };

          switch (action) {
            case 'home': {
              // Try AnimeKAI for home data
              try {
                const popularTerms = ['demon slayer', 'attack on titan', 'naruto', 'one piece', 'jujutsu kaisen'];
                const randomTerm = popularTerms[Math.floor(Math.random() * popularTerms.length)];
                const results = await animeKaiSearch(randomTerm);
                if (results.length > 0) {
                  send(200, {
                    success: true,
                    data: {
                      spotlightAnimes: results.slice(0, 5),
                      trendingAnimes: results.slice(0, 10),
                      latestEpisodeAnimes: [],
                      top10Animes: { today: results.slice(0, 10), week: [], month: [] },
                      provider: ANIMEKAI_PROVIDER,
                      providerPriority: [ANIMEKAI_PROVIDER, allanimeProvider, ...providerPriority],
                    },
                  });
                  return;
                }
              } catch { /* AnimeKAI home unavailable, use fallback */ }
              send(200, {
                success: true,
                data: {
                  spotlightAnimes: [],
                  trendingAnimes: [],
                  latestEpisodeAnimes: [],
                  top10Animes: { today: [], week: [], month: [] },
                  provider: ANIMEKAI_PROVIDER,
                  providerPriority: [ANIMEKAI_PROVIDER, allanimeProvider, ...providerPriority],
                },
              });
              return;
            }

            case 'search': {
              const query = url.searchParams.get('q');
              if (!query) { send(400, { success: false, error: 'Missing q' }); return; }
              const page = Number(url.searchParams.get('page') || '1');
              // Try AnimeKAI first (primary provider)
              try {
                const kaiResults = await animeKaiSearch(query);
                if (kaiResults.length > 0) {
                  send(200, { success: true, data: { currentPage: 1, totalPages: 1, hasNextPage: false, provider: ANIMEKAI_PROVIDER, animes: kaiResults } });
                  return;
                }
              } catch {
                // Fall through to AllAnime/Consumet
              }
              try {
                const data = await allAnimeGraphQL(allanimeSearchQuery, {
                  search: { allowAdult: false, allowUnknown: false, query },
                  limit: 40,
                  page,
                  translationType: 'sub',
                  countryOrigin: 'ALL',
                });
                const edges = Array.isArray(data?.shows?.edges) ? data.shows.edges : [];
                const animes = edges.map((item: any) => ({
                  id: encodeProviderId(allanimeProvider, item?._id || ''),
                  name: item?.englishName || item?.name || '',
                  poster: item?.thumbnail || '',
                  type: 'TV',
                  episodes: {
                    sub: toEpisodeList(item?.availableEpisodesDetail?.sub).length,
                    dub: toEpisodeList(item?.availableEpisodesDetail?.dub).length,
                  },
                }));
                if (animes.length > 0) {
                  send(200, { success: true, data: { currentPage: 1, totalPages: 1, hasNextPage: false, provider: allanimeProvider, animes } });
                  return;
                }
              } catch {
                // Fall through to Consumet providers.
              }

              let payload: any = null;
              let usedProvider = primaryProvider;
              let results: any[] = [];
              for (const providerName of providerPriority) {
                try {
                  const candidate: any = await getJson(`/anime/${providerName}/${encodeURIComponent(query)}?page=${page}`);
                  const candidateResults = Array.isArray(candidate?.results) ? candidate.results : [];
                  if (candidateResults.length > 0) {
                    payload = candidate;
                    usedProvider = providerName;
                    results = candidateResults;
                    break;
                  }
                } catch {
                  // Try next provider.
                }
              }

              if (!payload) { send(502, { success: false, error: `Search failed for providers: ${providerPriority.join(', ')}` }); return; }

              const data = {
                currentPage: payload?.currentPage ?? page,
                totalPages: payload?.totalPages ?? 1,
                hasNextPage: Boolean(payload?.hasNextPage),
                provider: usedProvider,
                animes: results.map((item: any) => ({
                  id: encodeProviderId(usedProvider, item?.id || ''),
                  name: item?.title || '',
                  poster: item?.image || '',
                  type: item?.type || 'TV',
                  episodes: {
                    sub: typeof item?.episodes === 'number' ? item.episodes : Number(item?.episodes?.sub || 0),
                    dub: typeof item?.episodes === 'object' ? Number(item?.episodes?.dub || 0) : 0,
                  },
                })),
              };
              send(200, { success: true, data });
              return;
            }

            case 'suggestions': {
              const query = url.searchParams.get('q');
              if (!query) return send(400, { success: false, error: 'Missing q' });
              // Try AnimeKAI first
              try {
                const kaiResults = await animeKaiSearch(query);
                if (kaiResults.length > 0) {
                  send(200, {
                    success: true,
                    data: kaiResults.slice(0, 10).map((item: any) => ({ id: item.id, name: item.name, poster: item.poster })),
                  });
                  return;
                }
              } catch {
                // Fall through
              }
              try {
                const data = await allAnimeGraphQL(allanimeSearchQuery, {
                  search: { allowAdult: false, allowUnknown: false, query },
                  limit: 10,
                  page: 1,
                  translationType: 'sub',
                  countryOrigin: 'ALL',
                });
                const edges = Array.isArray(data?.shows?.edges) ? data.shows.edges : [];
                if (edges.length > 0) {
                  send(200, {
                    success: true,
                    data: edges.slice(0, 10).map((item: any) => ({
                      id: encodeProviderId(allanimeProvider, item?._id || ''),
                      name: item?.englishName || item?.name || '',
                      poster: item?.thumbnail || '',
                    })),
                  });
                  return;
                }
              } catch {
                // Fall through to Consumet providers.
              }

              let payload: any = null;
              let usedProvider = primaryProvider;
              let results: any[] = [];
              for (const providerName of providerPriority) {
                try {
                  const candidate: any = await getJson(`/anime/${providerName}/${encodeURIComponent(query)}?page=1`);
                  const candidateResults = Array.isArray(candidate?.results) ? candidate.results : [];
                  if (candidateResults.length > 0) {
                    payload = candidate;
                    usedProvider = providerName;
                    results = candidateResults;
                    break;
                  }
                } catch {
                  // Try next provider.
                }
              }

              if (!payload) { send(502, { success: false, error: `Suggestions failed for providers: ${providerPriority.join(', ')}` }); return; }

              results = results.slice(0, 10);
              send(200, {
                success: true,
                data: results.map((item: any) => ({
                  id: encodeProviderId(usedProvider, item?.id || ''),
                  name: item?.title || '',
                  poster: item?.image || '',
                })),
              });
              return;
            }

            case 'info': {
              const id = url.searchParams.get('id');
              if (!id) { send(400, { success: false, error: 'Missing id' }); return; }
              // Handle AnimeKAI provider
              if (id.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
                try {
                  const slug = id.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length);
                  const info = await animeKaiInfo(slug);
                  if (!info.aniId) { send(404, { success: false, error: 'Anime not found' }); return; }
                  const episodes = await animeKaiEpisodes(info.aniId);
                  const mappedSub = episodes.filter(ep => ep.hasSub).map(ep => ({
                    number: ep.number,
                    title: `Episode ${ep.number}`,
                    episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}`,
                    isFiller: false,
                  }));
                  const mappedDub = episodes.filter(ep => ep.hasDub).map(ep => ({
                    number: ep.number,
                    title: `Episode ${ep.number}`,
                    episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}${ID_SEPARATOR}dub`,
                    isFiller: false,
                  }));
                  send(200, {
                    success: true,
                    data: {
                      id,
                      name: info.title,
                      jname: info.jname,
                      poster: '',
                      description: '',
                      stats: { type: 'TV', status: 'Unknown', episodes: { sub: mappedSub.length, dub: mappedDub.length } },
                      genres: [],
                      episodes: { sub: mappedSub, dub: mappedDub },
                      provider: ANIMEKAI_PROVIDER,
                    },
                  });
                  return;
                } catch (err: any) {
                  console.error('[DEV AnimeKAI info error]', err?.message);
                  send(502, { success: false, error: 'Failed to fetch anime info' });
                  return;
                }
              }
              if (id.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
                const showId = id.slice(`${allanimeProvider}${ID_SEPARATOR}`.length);
                try {
                  const data = await allAnimeGraphQL(allanimeShowQuery, { showId });
                  const show = data?.show;
                  if (!show?._id) {
                    send(404, { success: false, error: 'Anime not found' });
                    return;
                  }
                  const sub = toEpisodeList(show?.availableEpisodesDetail?.sub);
                  const dub = toEpisodeList(show?.availableEpisodesDetail?.dub);
                  send(200, {
                    success: true,
                    data: {
                      id: encodeProviderId(allanimeProvider, show._id),
                      name: show?.englishName || show?.name || '',
                      poster: show?.thumbnail || '',
                      description: show?.description || '',
                      genres: Array.isArray(show?.genres) ? show.genres : [],
                      provider: allanimeProvider,
                      episodes: {
                        sub: sub.map((ep: string) => ({ number: Number(ep), title: `Episode ${ep}`, episodeId: encodeProviderId(allanimeProvider, `${show._id}${ID_SEPARATOR}${ep}`), isFiller: false })),
                        dub: dub.map((ep: string) => ({ number: Number(ep), title: `Episode ${ep}`, episodeId: encodeProviderId(allanimeProvider, `${show._id}${ID_SEPARATOR}${ep}`), isFiller: false })),
                      },
                    },
                  });
                  return;
                } catch (error: any) {
                  send(502, { success: false, error: error?.message || 'Failed to fetch Allanime info' });
                  return;
                }
              }
              const decoded = decodeProviderId(id);
              let payload: any = null;
              let usedProvider = decoded.provider;
              for (const providerName of providerCandidatesForValue(id)) {
                try {
                  payload = await getJson(`/anime/${providerName}/info?id=${encodeURIComponent(decoded.rawId)}`);
                  usedProvider = providerName;
                  break;
                } catch {
                  // Try next provider.
                }
              }

              if (!payload) { send(502, { success: false, error: 'Failed to fetch anime info from all providers' }); return; }

              send(200, {
                success: true,
                data: {
                  id: encodeProviderId(usedProvider, payload?.id || decoded.rawId),
                  name: payload?.title || '',
                  poster: payload?.image || '',
                  description: payload?.description || '',
                  genres: Array.isArray(payload?.genres) ? payload.genres : [],
                  provider: usedProvider,
                  episodes: {
                    sub: toEpisodes(payload).episodes.map((ep: any) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) })),
                    dub: [],
                  },
                },
              });
              return;
            }

            case 'episodes': {
              const id = url.searchParams.get('id');
              if (!id) return send(400, { success: false, error: 'Missing id' });
              // Handle AnimeKAI provider
              if (id.startsWith(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`)) {
                try {
                  const slug = id.slice(`${ANIMEKAI_PROVIDER}${ID_SEPARATOR}`.length);
                  const info = await animeKaiInfo(slug);
                  if (!info.aniId) { send(404, { success: false, error: 'Anime not found' }); return; }
                  const episodes = await animeKaiEpisodes(info.aniId);
                  const mapped = episodes.filter(ep => ep.hasSub).map(ep => ({
                    number: ep.number,
                    title: `Episode ${ep.number}`,
                    episodeId: `${ANIMEKAI_PROVIDER}${ID_SEPARATOR}${slug}${ID_SEPARATOR}${ep.token}`,
                    isFiller: false,
                  }));
                  send(200, { success: true, data: { totalEpisodes: mapped.length, episodes: mapped, provider: ANIMEKAI_PROVIDER } });
                  return;
                } catch (err: any) {
                  console.error('[DEV AnimeKAI episodes error]', err?.message);
                  send(502, { success: false, error: 'Failed to fetch episodes' });
                  return;
                }
              }
              if (id.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
                const showId = id.slice(`${allanimeProvider}${ID_SEPARATOR}`.length);
                try {
                  const data = await allAnimeGraphQL(allanimeShowQuery, { showId });
                  const sub = toEpisodeList(data?.show?.availableEpisodesDetail?.sub);
                  const episodes = sub.map((ep: string) => ({ number: Number(ep), title: `Episode ${ep}`, episodeId: encodeProviderId(allanimeProvider, `${showId}${ID_SEPARATOR}${ep}`), isFiller: false }));
                  send(200, { success: true, data: { totalEpisodes: episodes.length, episodes, provider: allanimeProvider } });
                  return;
                } catch (error: any) {
                  send(502, { success: false, error: error?.message || 'Failed to fetch Allanime episodes' });
                  return;
                }
              }
              const decoded = decodeProviderId(id);
              let payload: any = null;
              let usedProvider = decoded.provider;
              for (const providerName of providerCandidatesForValue(id)) {
                try {
                  payload = await getJson(`/anime/${providerName}/info?id=${encodeURIComponent(decoded.rawId)}`);
                  usedProvider = providerName;
                  break;
                } catch {
                  // Try next provider.
                }
              }
              if (!payload) { send(502, { success: false, error: 'Failed to fetch episodes from all providers' }); return; }
              const episodeData = toEpisodes(payload);
              episodeData.episodes = episodeData.episodes.map((ep: any) => ({ ...ep, episodeId: encodeProviderId(usedProvider, ep.episodeId) }));
              send(200, { success: true, data: { ...episodeData, provider: usedProvider } });
              return;
            }

            case 'servers': {
              const episodeId = url.searchParams.get('episodeId');
              if (!episodeId) { send(400, { success: false, error: 'Missing episodeId' }); return; }
              // Handle AnimeKAI provider
              const kaiEp = decodeAnimeKaiEpisodeId(episodeId);
              if (kaiEp) {
                try {
                  const servers = await animeKaiServers(kaiEp.epToken);
                  const serverList = kaiEp.isDub ? servers.dub : servers.sub;
                  send(200, {
                    success: true,
                    data: {
                      episodeId,
                      episodeNo: 0,
                      sub: kaiEp.isDub ? [] : serverList.map((s: any, i: number) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })),
                      dub: kaiEp.isDub ? serverList.map((s: any, i: number) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })) : [],
                      raw: [],
                    },
                  });
                  return;
                } catch (err: any) {
                  console.error('[DEV AnimeKAI servers error]', err?.message);
                  send(502, { success: false, error: 'Failed to fetch servers' });
                  return;
                }
              }
              if (episodeId.startsWith(`${allanimeProvider}${ID_SEPARATOR}`)) {
                send(200, {
                  success: true,
                  data: {
                    episodeId,
                    episodeNo: 0,
                    sub: [{ serverId: 1, serverName: allanimeProvider }],
                    dub: [],
                    raw: [],
                  },
                });
                return;
              }
              const decodedEpisode = decodeProviderId(episodeId);
              send(200, {
                success: true,
                data: {
                  episodeId,
                  episodeNo: 0,
                  sub: [{ serverId: 1, serverName: decodedEpisode.provider }],
                  dub: [],
                  raw: [],
                },
              });
              return;
            }

            case 'sources': {
              const episodeId = url.searchParams.get('episodeId');
              if (!episodeId) return send(400, { success: false, error: 'Missing episodeId' });
              // Handle AnimeKAI provider
              const kaiSource = decodeAnimeKaiEpisodeId(episodeId);
              if (kaiSource) {
                try {
                  const category = url.searchParams.get('category') === 'dub' ? 'dub' : 'sub';
                  const serverId = url.searchParams.get('server') || '';
                  const servers = await animeKaiServers(kaiSource.epToken);
                  const serverList = category === 'dub' ? servers.dub : servers.sub;
                  if (serverList.length === 0) {
                    send(404, { success: false, error: 'No servers available' });
                    return;
                  }
                  // Find linkId
                  let linkId: string;
                  if (serverId && !/^\d+$/.test(serverId)) {
                    linkId = serverId; // serverId is actually a linkId
                  } else {
                    const serverNum = parseInt(serverId, 10);
                    const matched = serverList.find((_s: any, i: number) => i + 1 === serverNum) || serverList[0];
                    linkId = matched.linkId;
                  }
                  const source = await animeKaiSource(linkId);
                  if (!source || !source.sources?.length) {
                    send(404, { success: false, error: 'No streaming sources found' });
                    return;
                  }
                  let embedHost = 'https://megaup.nl';
                  if (source.embedUrl) { try { embedHost = new URL(source.embedUrl).origin; } catch { /* ignore URL parse error */ } }
                  send(200, {
                    success: true,
                    data: {
                      headers: { Referer: embedHost + '/', Origin: embedHost, 'User-Agent': 'Mozilla/5.0' },
                      sources: source.sources.map((s: any) => ({
                        url: s.file || s.url,
                        quality: s.label || 'auto',
                        isM3U8: (s.file || s.url || '').includes('.m3u8'),
                      })),
                      tracks: source.tracks || [],
                      subtitles: (source.tracks || []).filter((t: any) => t.kind === 'captions'),
                      intro: source.skip?.intro ? { start: source.skip.intro[0], end: source.skip.intro[1] } : null,
                      outro: source.skip?.outro ? { start: source.skip.outro[0], end: source.skip.outro[1] } : null,
                      provider: ANIMEKAI_PROVIDER,
                    },
                  });
                  return;
                } catch (err: any) {
                  console.error('[DEV AnimeKAI sources error]', err?.message);
                  send(502, { success: false, error: 'Failed to fetch sources' });
                  return;
                }
              }
              const allanimeEpisode = decodeAllAnimeEpisodeId(episodeId);
              if (allanimeEpisode) {
                try {
                  const category = url.searchParams.get('category') === 'dub' ? 'dub' : 'sub';
                  const data = await allAnimeGraphQL(allanimeEpisodeQuery, {
                    showId: allanimeEpisode.showId,
                    translationType: category,
                    episodeString: allanimeEpisode.episodeString,
                  });
                  const rawSources = Array.isArray(data?.episode?.sourceUrls) ? data.episode.sourceUrls : [];
                  const seen = new Set<string>();
                  const sources = rawSources
                    .map((item: any) => {
                      const mediaUrl = decodeAllAnimeSource(item?.sourceUrl || '');
                      if (!mediaUrl || !looksPlayableMediaUrl(mediaUrl) || seen.has(mediaUrl)) return null;
                      seen.add(mediaUrl);
                      const qMatch = String(item?.sourceName || '').match(/(360|480|720|1080|1440|2160)/);
                      return { url: mediaUrl, quality: qMatch ? `${qMatch[1]}p` : 'auto', isM3U8: mediaUrl.includes('.m3u8') };
                    })
                    .filter(Boolean);
                  if (!sources.length) {
                    send(404, { success: false, error: 'No streaming sources found' });
                    return;
                  }
                  send(200, {
                    success: true,
                    data: {
                      headers: { Referer: allanimeReferer, Origin: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' },
                      provider: allanimeProvider,
                      providerPriority,
                      sources,
                      tracks: [],
                      subtitles: [],
                    },
                  });
                  return;
                } catch (error: any) {
                  send(502, { success: false, error: error?.message || 'Failed to fetch Allanime sources' });
                  return;
                }
              }
              const decodedEpisode = decodeProviderId(episodeId);
              const category = url.searchParams.get('category') === 'dub' ? 'dub' : 'sub';
              const serverParam = url.searchParams.get('server')
                ? `&server=${encodeURIComponent(url.searchParams.get('server') as string)}`
                : '';
              let payload: any = null;
              let usedProvider = decodedEpisode.provider;
              for (const providerName of providerCandidatesForValue(episodeId)) {
                try {
                  payload = await getJson(
                    `/anime/${providerName}/watch/${encodeURIComponent(decodedEpisode.rawId)}?category=${category}${serverParam}`,
                  );
                  usedProvider = providerName;
                  break;
                } catch {
                  // Try next provider.
                }
              }

              if (!payload) { send(502, { success: false, error: 'Failed to fetch sources from all providers' }); return; }

              const tracksRaw = Array.isArray(payload?.tracks)
                ? payload.tracks
                : Array.isArray(payload?.subtitles)
                  ? payload.subtitles
                  : [];

              const baseTracks = normalizeTracks({ tracks: tracksRaw });
              const bestTracks = await enrichTracksFromServers(usedProvider, decodedEpisode.rawId, category, baseTracks);

              const data = {
                headers: payload?.headers || { Referer: 'https://www.animesaturn.cx/' },
                provider: usedProvider,
                providerPriority,
                sources: (Array.isArray(payload?.sources) ? payload.sources : [])
                  .filter((s: any) => Boolean(s?.url))
                  .map((s: any) => ({
                    url: s.url,
                    quality: s.quality || 'auto',
                    isM3U8: typeof s.isM3U8 === 'boolean' ? s.isM3U8 : String(s.url || '').includes('.m3u8'),
                  })),
                tracks: bestTracks,
                subtitles: bestTracks,
                download: payload?.download,
              };

              if (!data.sources.length) {
                send(404, { success: false, error: 'No streaming sources found' }); return;
              }

              send(200, { success: true, data });
              return;
            }

            default:
              send(400, { success: false, error: `Unknown action: ${action}` });
              return;
          }
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err?.message || 'Consumet adapter error' }));
        }
      });
    },
  };
}

// Dev-only middleware to proxy and rewrite HLS playlists/segments at /stream
function streamProxyPlugin(): Plugin {
  return {
    name: 'stream-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url) { next(); return; }
          // Only handle /stream?url=...
          if (!req.url.startsWith('/stream')) { next(); return; }

          // Handle CORS preflight
          if (req.method && req.method.toUpperCase() === 'OPTIONS') {
            res.statusCode = 204;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
            res.end();
            return;
          }

      const full = new URL(req.url, 'http://localhost');
      const host = req.headers.host || 'localhost';
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const selfOrigin = `${proto}://${host}`;
  const targetParam = full.searchParams.get('url');
  const headersParam = full.searchParams.get('h'); // base64-encoded JSON headers
          if (!targetParam) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Missing url parameter');
            return;
          }

          let upstream: URL;
          try {
            upstream = new URL(targetParam);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Invalid url parameter');
            return;
          }

          // Determine the correct referer based on the CDN domain
          const hostname = upstream.hostname.toLowerCase();
          const megacloudDomains = [
            'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
            'lightningspark', 'sunshinerays', 'surfparadise',
            'moonjump', 'skydrop', 'wetransfer', 'bicdn',
            'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
            'statics', 'mgstatics', 'lasercloud', 'cloudrax',
            'stormshade', 'thunderwave', 'raincloud', 'snowfall',
            'rainveil', 'thunderstrike', 'sunburst', 'clearskyline'  // CDN domains including thunderstrike77.online, sunburst93.live, clearskyline88.online
          ];
          
          let defaultReferer = 'https://megacloud.blog/';
          if (!megacloudDomains.some(d => hostname.includes(d))) {
            if (hostname.includes('vidcloud') || hostname.includes('vidstreaming')) {
              defaultReferer = 'https://vidcloud.blog/';
            } else if (hostname.includes('gogoanime') || hostname.includes('gogocdn')) {
              defaultReferer = 'https://gogoanime.cl/';
            }
          }

          const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': defaultReferer,
            'Origin': new URL(defaultReferer).origin,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          };

          // Merge in allowed custom headers supplied by client (base64 JSON)
          if (headersParam) {
            try {
              const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
              const custom = JSON.parse(decoded);
              const allowList = new Set(['referer', 'origin', 'user-agent', 'authorization', 'cookie']);
              for (const [k, v] of Object.entries(custom)) {
                const keyLower = k.toLowerCase();
                if (allowList.has(keyLower) && typeof v === 'string' && v.length < 4096) {
                  const canonical = keyLower
                    .split('-')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                    .join('-');
                  upstreamHeaders[canonical] = v;
                }
              }
              // If a Referer was provided, align Origin to Referer origin (override default)
              if ('Referer' in upstreamHeaders) {
                try {
                  const ref = new URL(upstreamHeaders['Referer']);
                  upstreamHeaders['Origin'] = ref.origin;
                } catch { /* ignore */ }
              }
            } catch {
              // Ignore header parsing errors
            }
          }
          // Forward Range header for segments if present
          if (req.headers['range']) {
            upstreamHeaders['Range'] = String(req.headers['range']);
          }

          let activeHeaders = { ...upstreamHeaders } as Record<string,string>;
          let upstreamResp = await fetch(upstream.toString(), { headers: activeHeaders, redirect: 'follow' });
          let contentType = upstreamResp.headers.get('content-type') || '';
          const pathname = upstream.pathname.toLowerCase();
          const isKeyFile = pathname.endsWith('.key');
          const isM3U8ByPath = pathname.endsWith('.m3u8');
          const isVideoSegment = pathname.endsWith('.ts') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.mp4') || pathname.endsWith('.m4s') || pathname.endsWith('.html');

          // Binary content: TS segments, MP4, KEY files, encrypted .jpg segments, etc.
          const isHtmlResponse = contentType.toLowerCase().includes('text/html');
          if (isKeyFile || isVideoSegment || (!isM3U8ByPath && (!contentType.includes('application/vnd.apple') && !contentType.toLowerCase().includes('mpegurl') && !contentType.toLowerCase().includes('text/plain') && !isHtmlResponse))) {
            // If upstream failed OR returned HTML (CDN error page with 200 OK), retry
            if ((!upstreamResp.ok || (isHtmlResponse && isVideoSegment)) && (isVideoSegment || isKeyFile)) {
              const refererCandidates = [
                'https://megacloud.blog/',
                'https://megacloud.tv/',
                'https://hianime.to/',
                `${upstream.protocol}//${upstream.host}/`,
              ];
              
              for (const ref of refererCandidates) {
                const retryHeaders: Record<string, string> = { ...activeHeaders, 'Referer': ref };
                try {
                  const refUrl = new URL(ref);
                  retryHeaders['Origin'] = refUrl.origin;
                } catch { /* ignore */ }
                
                const retryResp = await fetch(upstream.toString(), { headers: retryHeaders, redirect: 'follow' });
                const retryCt = retryResp.headers.get('content-type') || '';
                if (retryResp.ok && !retryCt.toLowerCase().includes('text/html')) {
                  upstreamResp = retryResp;
                  contentType = retryCt;
                  console.log(`[stream-proxy] Segment retry with Referer=${ref} succeeded`);
                  break;
                }
              }
            }
            
            // Final check: if CDN still returned HTML for a video segment, reject it
            const finalCt = (upstreamResp.headers.get('content-type') || '').toLowerCase();
            if (isVideoSegment && finalCt.includes('text/html')) {
              console.warn(`[stream-proxy] CDN returned HTML for segment: ${upstream.pathname}`);
              res.statusCode = 502;
              res.setHeader('Content-Type', 'text/plain');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end('CDN returned HTML instead of video data');
              return;
            }
            
            res.statusCode = upstreamResp.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (contentType) res.setHeader('Content-Type', contentType);
            // Forward essential headers for range requests and caching
            const forwardHeaders = [
              'content-length',
              'content-range',
              'accept-ranges',
              'cache-control',
              'etag',
              'last-modified',
              'expires'
            ];
            for (const h of forwardHeaders) {
              const val = upstreamResp.headers.get(h);
              if (val) res.setHeader(h, val);
            }
            // Stream body
            const reader = upstreamResp.body?.getReader();
            if (!reader) {
              res.end();
              return;
            }
            const pump = async () => {
              const { value, done } = await reader.read();
              if (done) { res.end(); return; }
              res.write(Buffer.from(value));
              void pump();
            };
            pump();
            return;
          }

          let chosenHeadersParam = headersParam || '';
          // If manifest fetch failed or came back as HTML, try fallback referers
          if (isM3U8ByPath && (!upstreamResp.ok)) {
            const refererCandidates = new Set<string>();
            // from custom param
            if (activeHeaders['Referer']) {
              try { refererCandidates.add(new URL(activeHeaders['Referer']).origin + '/'); } catch { /* ignore bad referer */ }
              refererCandidates.add(activeHeaders['Referer']);
            }
            // Common candidates - prioritize megacloud.blog for anime CDNs
            refererCandidates.add('https://megacloud.blog/');
            refererCandidates.add('https://megacloud.tv/');
            refererCandidates.add('https://hianime.to/');
            refererCandidates.add('https://aniwatch.to/');
            refererCandidates.add(`${upstream.protocol}//${upstream.host}/`);
            refererCandidates.add(upstream.toString());

            for (const ref of refererCandidates) {
              const attempt = async (omitOrigin = false) => {
                const trialHeaders: Record<string, string> = { ...upstreamHeaders };
                trialHeaders['Referer'] = ref;
                if (!omitOrigin) {
                  try { const refUrl = new URL(ref); trialHeaders['Origin'] = refUrl.origin; } catch { /* ignore origin parse */ }
                } else {
                  delete trialHeaders['Origin'];
                }
                // Prefetch referer page to collect cookies if any
                try {
                  const refResp = await fetch(ref, { headers: { 'User-Agent': trialHeaders['User-Agent'] || upstreamHeaders['User-Agent'] || '' }, redirect: 'follow' });
                  const setCookie = refResp.headers.get('set-cookie');
                  if (setCookie) {
                    trialHeaders['Cookie'] = setCookie
                      .split(/,\s?(?=[^;]+;)/)
                      .map(sc => sc.split(';')[0])
                      .join('; ');
                  }
                } catch { /* ignore cookie prefetch errors */ }
                const resp = await fetch(upstream.toString(), { headers: trialHeaders, redirect: 'follow' });
                const ct = resp.headers.get('content-type') || '';
                console.log(`[stream-proxy] retry${omitOrigin ? '(no-origin)' : ''} Referer=${ref} ← ${resp.status} ${ct}`);
                if (resp.ok) {
                  const preview = await resp.clone().text();
                  if (/^#EXTM3U/m.test(preview)) {
                    upstreamResp = resp;
                    contentType = ct;
                    activeHeaders = trialHeaders;
                    try {
                      const payload: Record<string, string> = { Referer: trialHeaders['Referer'] };
                      if (trialHeaders['Origin']) payload['Origin'] = trialHeaders['Origin'];
                      if (trialHeaders['Cookie']) payload['Cookie'] = trialHeaders['Cookie'];
                      chosenHeadersParam = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
                    } catch { /* ignore header encoding */ }
                    return true;
                  }
                }
                return false;
              };

              if (await attempt(false)) break;
              if (await attempt(true)) break;
            }
          }

          let text = await upstreamResp.text();
          let isM3U8PathOrType = isM3U8ByPath || contentType.toLowerCase().includes('mpegurl') || contentType.toLowerCase().includes('application/x-mpegurl') || contentType.toLowerCase().includes('application/vnd.apple.mpegurl') || contentType.toLowerCase().includes('text/plain');
          let isValidM3U = /^#EXTM3U/m.test(text);
          if (isM3U8ByPath && upstreamResp.ok && (!isValidM3U)) {
            // Retry with referer candidates even on 200 if the body isn't a valid playlist
            const refererCandidates = new Set<string>();
            if (activeHeaders['Referer']) {
              try { refererCandidates.add(new URL(activeHeaders['Referer']).origin + '/'); } catch { /* ignore */ }
              refererCandidates.add(activeHeaders['Referer']);
            }
            refererCandidates.add('https://hianime.to/');
            refererCandidates.add('https://aniwatch.to/');
            refererCandidates.add('https://megaplay.buzz/');
            refererCandidates.add(`${upstream.protocol}//${upstream.host}/`);
            refererCandidates.add(upstream.toString());
            for (const ref of refererCandidates) {
              const trialHeaders = { ...upstreamHeaders };
              trialHeaders['Referer'] = ref;
              try { const refUrl = new URL(ref); trialHeaders['Origin'] = refUrl.origin; } catch { /* ignore */ }
              const trialResp = await fetch(upstream.toString(), { headers: trialHeaders, redirect: 'follow' });
              const trialCT = trialResp.headers.get('content-type') || '';
              const body = await trialResp.clone().text();
              console.log(`[stream-proxy] alt-retry Referer=${ref} ← ${trialResp.status} ${trialCT}, validM3U=${/^#EXTM3U/m.test(body)}`);
              if (trialResp.ok && /^#EXTM3U/m.test(body)) {
                upstreamResp = trialResp;
                contentType = trialCT;
                text = body;
                activeHeaders = trialHeaders;
                try {
                  const payload = { Referer: trialHeaders['Referer'], Origin: trialHeaders['Origin'] };
                  chosenHeadersParam = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
                } catch { /* ignore */ }
                isM3U8PathOrType = true;
                isValidM3U = true;
                break;
              }
            }
          }
          let outText = text;
          if (isM3U8PathOrType && isValidM3U) {
            const base = upstream;
            // First rewrite URI="..." occurrences inside tag lines (e.g., #EXT-X-MAP, #EXT-X-KEY)
            const firstPass = text.replace(/URI="([^"]+)"/g, (_m, p1) => {
              try {
                const abs = new URL(p1, base);
                const hq = chosenHeadersParam ? `&h=${encodeURIComponent(chosenHeadersParam)}` : '';
                return `URI="${selfOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hq}"`;
              } catch {
                return `URI="${p1}"`;
              }
            });
            const lines = firstPass.split(/\r?\n/);
            const rewritten = lines.map((line) => {
              const trimmed = line.trim();
              if (trimmed === '' || trimmed.startsWith('#')) return line; // keep tags/comments
              try {
                const abs = new URL(line, base);
                const hq = chosenHeadersParam ? `&h=${encodeURIComponent(chosenHeadersParam)}` : '';
                return `${selfOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hq}`;
              } catch {
                return line;
              }
            });
            outText = rewritten.join('\n');
          }

          res.statusCode = upstreamResp.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache');
          const ct = (isM3U8PathOrType && isValidM3U)
            ? 'application/vnd.apple.mpegurl'
            : (contentType || 'text/plain; charset=utf-8');
          res.setHeader('Content-Type', ct);
          res.end(outText);
          return;
        } catch (e) {
          console.error('[stream-proxy] error', e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Proxy error');
        }
      });
    }
  }
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.onrender.com',
      '.nyanime.qzz.io',
      'nyanime.qzz.io',
      '.pages.dev',
      '.workers.dev'
    ],
    proxy: {
      '/api': {
        target: 'https://nyanime-backend.vercel.app',
        changeOrigin: true,
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Consumet API proxy (for anime metadata)
      '/consumet': {
        target: 'https://api.consumet.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/consumet/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Consumet API proxy error', err);
          });
        },
      },
    },
  },
  build: {
    outDir: "dist", // Explicitly set build output directory
    chunkSizeWarningLimit: 600, // Increase warning limit slightly
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-select',
            '@radix-ui/react-scroll-area',
          ],
          'vendor-forms': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
          ],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-utils': [
            'axios',
            'date-fns',
            'lucide-react',
            'clsx',
            'tailwind-merge',
          ],
          'vendor-hls': ['hls.js'],
        },
      },
    },
  },
  plugins: [
    react(),
    aniwatchDevPlugin(),
    streamProxyPlugin(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
