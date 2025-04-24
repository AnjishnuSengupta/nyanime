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

// Provider instances cache with proper typing
const providerInstances: Record<string, ANIME.AnimeParser> = {};

// Get or create provider instance
const getProvider = (providerName: AnimeProvider = PROVIDERS.GOGOANIME): ANIME.AnimeParser => {
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
    throw error; // Rethrow to allow caller to handle
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
    throw error; // Rethrow to allow caller to handle
  }
};

/**
 * Get episode streaming sources
 */
export const getEpisodeSources = async (
  episodeId: string, 
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  server?: StreamingServer
): Promise<EpisodeSource> => {
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
    
    // Add proper user-agent and referer headers to bypass CORS and provider restrictions
    const customHeaders = {
      ...(sources.headers || {}),
      'Referer': 'https://gogoanimehd.io/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
    };
    
    return {
      headers: customHeaders,
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
    throw error; // Rethrow to allow caller to handle
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
    
    // Check if provider supports this method
    if (typeof provider.fetchEpisodeServers !== 'function') {
      console.log(`Provider ${providerName} doesn't support fetchEpisodeServers`);
      return [];
    }
    
    const servers = await provider.fetchEpisodeServers(episodeId);
    console.log(`Found ${servers.length} servers for episode ${episodeId}`);
    return servers;
  } catch (error) {
    console.error(`Error getting servers for episode ID "${episodeId}":`, error);
    throw error;
  }
};

/**
 * Search anime by title and get episode links directly
 * This is useful for finding sources when you only have the title and episode number
 */
export const searchAndGetEpisodeLinks = async (
  title: string,
  episodeNumber: number,
  providerName: AnimeProvider = PROVIDERS.GOGOANIME
): Promise<{ sources: EpisodeSource; provider: string }> => {
  try {
    console.log(`Searching for "${title}" and getting episode ${episodeNumber} links using ${providerName}`);
    const provider = getProvider(providerName);
    
    // First search for the anime
    const searchResults = await provider.search(title);
    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      throw new Error(`No search results found for "${title}" on ${providerName}`);
    }
    
    // Get the first search result's anime info
    const animeId = searchResults.results[0].id;
    console.log(`Found anime with ID: ${animeId} for "${title}" on ${providerName}`);
    
    let animeInfo;
    if (providerName === PROVIDERS.GOGOANIME || providerName === PROVIDERS.ZORO) {
      animeInfo = await provider.fetchAnimeInfo(animeId, SUB_OR_DUB.SUB);
    } else {
      animeInfo = await provider.fetchAnimeInfo(animeId);
    }
    
    if (!animeInfo || !animeInfo.episodes || animeInfo.episodes.length === 0) {
      throw new Error(`No episodes found for "${title}" on ${providerName}`);
    }
    
    // Find the episode with the matching number
    const episode = animeInfo.episodes.find((ep: any) => 
      Number(ep.number) === episodeNumber
    );
    
    if (!episode) {
      throw new Error(`Episode ${episodeNumber} not found for "${title}" on ${providerName}`);
    }
    
    console.log(`Found episode ID: ${episode.id} for "${title}", episode ${episodeNumber} on ${providerName}`);
    
    // Get episode sources
    const sources = await getEpisodeSources(episode.id, providerName);
    return { sources, provider: providerName };
    
  } catch (error) {
    console.error(`Error in searchAndGetEpisodeLinks for "${title}", episode ${episodeNumber}:`, error);
    throw error;
  }
};

/**
 * Try to get sources from multiple providers for an anime episode
 */
export const getSourcesFromMultipleProviders = async (
  title: string,
  episodeNumber: number,
  providers: AnimeProvider[] = [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX]
): Promise<{ sources: EpisodeSource; provider: string }> => {
  console.log(`Trying to get sources for "${title}" episode ${episodeNumber} from multiple providers`);
  
  let lastError: Error | null = null;
  
  for (const provider of providers) {
    try {
      const result = await searchAndGetEpisodeLinks(title, episodeNumber, provider);
      if (result && result.sources && result.sources.sources && result.sources.sources.length > 0) {
        console.log(`Found sources from ${provider} for "${title}" episode ${episodeNumber}`);
        return result;
      }
    } catch (error) {
      console.warn(`Error getting sources from ${provider} for "${title}" episode ${episodeNumber}:`, error);
      lastError = error as Error;
    }
  }
  
  throw lastError || new Error(`No sources found from any provider for "${title}" episode ${episodeNumber}`);
};

// Utility function to get best source from an EpisodeSource
export const getBestSource = (sources: EpisodeSource): VideoSource => {
  if (!sources || !sources.sources || sources.sources.length === 0) {
    throw new Error('No sources available');
  }
  
  // Try to get 1080p first, then 720p, then default to the first source
  return sources.sources.find(s => s.quality === '1080p') || 
         sources.sources.find(s => s.quality === '720p') || 
         sources.sources[0];
};

// Create a proxy URL to bypass CORS for the player if needed
export const createProxyUrl = (source: VideoSource): string => {
  if (source.isM3U8) {
    // For HLS streams, use HLS.js player with referer
    return `https://hls-player.vercel.app/?url=${encodeURIComponent(source.url)}&referer=https://nyanime.vercel.app`;
  }
  
  // For direct MP4 links, use a direct player with referer
  return `https://player.vercel.app/?url=${encodeURIComponent(source.url)}&referer=https://nyanime.vercel.app`;
};