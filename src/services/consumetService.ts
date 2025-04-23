
import { ANIME } from "@consumet/extensions";

// Define providers
export const PROVIDERS = {
  GOGOANIME: "gogoanime",
  ZORO: "zoro",
  ANIMEPAHE: "animepahe",
  ANIMEFOX: "animefox",
  CRUNCHYROLL: "crunchyroll",
} as const;

export type AnimeProvider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

// Define streaming servers that some providers use
export const STREAMING_SERVERS = {
  GOGOCDN: "gogocdn",
  STREAMSB: "streamsb",
  VIDSTREAMING: "vidstreaming",
  GOGO: "gogo",
  VIDCLOUD: "vidcloud",
} as const;

export type StreamingServer = (typeof STREAMING_SERVERS)[keyof typeof STREAMING_SERVERS];

// Define sub or dub enum
export const SUB_OR_DUB = {
  SUB: "sub",
  DUB: "dub",
} as const;

export type SubOrDub = (typeof SUB_OR_DUB)[keyof typeof SUB_OR_DUB];

// Define source types and interfaces
export interface VideoSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
}

export interface Subtitle {
  url: string;
  lang: string;
}

export interface EpisodeSource {
  headers?: Record<string, string>;
  sources: VideoSource[];
  subtitles?: Subtitle[];
  intro?: { start: number; end: number };
}

// Provider instances cache
const providerInstances: Record<string, any> = {};

// Get or create provider instance
const getProvider = (providerName: AnimeProvider = PROVIDERS.GOGOANIME) => {
  if (!providerInstances[providerName]) {
    switch (providerName) {
      case PROVIDERS.GOGOANIME:
        providerInstances[providerName] = new ANIME.Gogoanime();
        break;
      case PROVIDERS.ZORO:
        providerInstances[providerName] = new ANIME.Zoro();
        break;
      case PROVIDERS.ANIMEPAHE:
        providerInstances[providerName] = new ANIME.AnimePahe();
        break;
      case PROVIDERS.ANIMEFOX:
        providerInstances[providerName] = new ANIME.AnimeFox();
        break;
      case PROVIDERS.CRUNCHYROLL:
        providerInstances[providerName] = new ANIME.Crunchyroll();
        break;
      default:
        providerInstances[providerName] = new ANIME.Gogoanime();
    }
  }
  
  return providerInstances[providerName];
};

/**
 * Search for anime using the specified provider
 */
export const searchAnime = async (query: string, providerName: AnimeProvider = PROVIDERS.GOGOANIME) => {
  try {
    console.log(`Searching for "${query}" using ${providerName} provider`);
    const provider = getProvider(providerName);
    const results = await provider.search(query);
    console.log(`Found ${results.results.length} results for "${query}"`);
    return results.results;
  } catch (error) {
    console.error(`Error searching for anime "${query}":`, error);
    return [];
  }
};

/**
 * Get anime info including episodes
 */
export const getAnimeInfo = async (
  animeId: string, 
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  subOrDub: SubOrDub = SUB_OR_DUB.SUB
) => {
  try {
    console.log(`Getting info for anime ID: ${animeId} using ${providerName} provider (${subOrDub})`);
    const provider = getProvider(providerName);
    
    let info;
    if (providerName === PROVIDERS.GOGOANIME || providerName === PROVIDERS.ZORO) {
      info = await provider.fetchAnimeInfo(animeId, subOrDub);
    } else {
      info = await provider.fetchAnimeInfo(animeId);
    }
    
    console.log(`Got info for "${info.title}" with ${info.episodes?.length || 0} episodes`);
    return info;
  } catch (error) {
    console.error(`Error getting anime info for ID "${animeId}":`, error);
    return null;
  }
};

/**
 * Get episode streaming sources
 */
export const getEpisodeSources = async (
  episodeId: string, 
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  server?: StreamingServer
): Promise<EpisodeSource | null> => {
  try {
    console.log(`Getting sources for episode ID: ${episodeId} using ${providerName} provider ${server ? `(server: ${server})` : ''}`);
    const provider = getProvider(providerName);
    
    let sources;
    if (server) {
      sources = await provider.fetchEpisodeSources(episodeId, server);
    } else {
      sources = await provider.fetchEpisodeSources(episodeId);
    }
    
    console.log(`Found ${sources.sources?.length || 0} sources for episode ${episodeId}`);
    
    return {
      headers: sources.headers,
      sources: sources.sources.map(source => ({
        url: source.url,
        quality: source.quality,
        isM3U8: source.url.includes('.m3u8')
      })),
      subtitles: sources.subtitles,
      intro: sources.intro
    };
  } catch (error) {
    console.error(`Error getting episode sources for ID "${episodeId}":`, error);
    return null;
  }
};

/**
 * Get available servers for an episode
 */
export const getAvailableServers = async (
  episodeId: string,
  providerName: AnimeProvider = PROVIDERS.GOGOANIME
) => {
  try {
    console.log(`Getting available servers for episode ID: ${episodeId} from ${providerName}`);
    const provider = getProvider(providerName);
    
    if (!provider.fetchEpisodeServers) {
      console.log(`Provider ${providerName} doesn't support fetchEpisodeServers`);
      return [];
    }
    
    const servers = await provider.fetchEpisodeServers(episodeId);
    console.log(`Found ${servers.length} servers for episode ${episodeId}`);
    return servers;
  } catch (error) {
    console.error(`Error getting servers for episode ID "${episodeId}":`, error);
    return [];
  }
};

/**
 * Get recent episodes
 */
export const getRecentEpisodes = async (providerName: AnimeProvider = PROVIDERS.GOGOANIME) => {
  try {
    console.log(`Getting recent episodes from ${providerName}`);
    const provider = getProvider(providerName);
    const recentEpisodes = await provider.fetchRecentEpisodes();
    console.log(`Found ${recentEpisodes.results.length} recent episodes`);
    return recentEpisodes.results;
  } catch (error) {
    console.error(`Error getting recent episodes:`, error);
    return [];
  }
};

/**
 * Get top airing anime
 */
export const getTopAiringAnime = async (providerName: AnimeProvider = PROVIDERS.GOGOANIME) => {
  try {
    console.log(`Getting top airing anime from ${providerName}`);
    const provider = getProvider(providerName);
    if (!provider.fetchTopAiring) {
      console.log(`Provider ${providerName} doesn't support top airing`);
      return [];
    }
    const topAiring = await provider.fetchTopAiring();
    console.log(`Found ${topAiring.results.length} top airing anime`);
    return topAiring.results;
  } catch (error) {
    console.error(`Error getting top airing anime:`, error);
    return [];
  }
};

/**
 * Helper function: Search for anime and get episode sources in one step
 */
export const searchAndGetEpisodeLinks = async (
  title: string,
  episodeNumber: number,
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  subOrDub: SubOrDub = SUB_OR_DUB.SUB
) => {
  try {
    // Search for anime
    const searchResults = await searchAnime(title, providerName);
    if (!searchResults.length) return null;
    
    // Get anime info with episodes
    const animeInfo = await getAnimeInfo(searchResults[0].id, providerName, subOrDub);
    if (!animeInfo || !animeInfo.episodes || animeInfo.episodes.length === 0) return null;
    
    // Find the specific episode
    const episode = animeInfo.episodes.find(ep => Number(ep.number) === episodeNumber);
    if (!episode) return null;
    
    // Get episode sources
    const sources = await getEpisodeSources(episode.id, providerName);
    
    return {
      animeId: searchResults[0].id,
      animeTitle: animeInfo.title,
      episodeId: episode.id,
      episodeNumber,
      sources,
      provider: providerName
    };
  } catch (error) {
    console.error(`Error in searchAndGetEpisodeLinks for "${title}" episode ${episodeNumber}:`, error);
    return null;
  }
};

/**
 * Try multiple providers to get episode sources
 */
export const getSourcesFromMultipleProviders = async (
  title: string,
  episodeNumber: number,
  providers: AnimeProvider[] = [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX]
) => {
  for (const provider of providers) {
    try {
      const result = await searchAndGetEpisodeLinks(title, episodeNumber, provider);
      if (result && result.sources) {
        return result;
      }
    } catch (error) {
      console.warn(`Error getting sources from ${provider}:`, error);
    }
  }
  
  return null;
};
