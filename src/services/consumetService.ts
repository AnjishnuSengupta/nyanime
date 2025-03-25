
import { ANIME } from "@consumet/extensions";

// Define providers
const PROVIDERS = {
  GOGOANIME: "gogoanime",
  ZORO: "zoro",
  ANIMEPAHE: "animepahe",
  ANIMEFOX: "animefox",
  CRUNCHYROLL: "crunchyroll",
  NINEANIME: "9anime",
  ANIFY: "anify",
  ANIMESATURN: "animesaturn",
  ANIMEUNITY: "animeunity",
  MONOSCHINOS: "monoschinos",
} as const;

export type AnimeProvider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

// Define sub or dub enum
export const SUB_OR_DUB = {
  SUB: "sub",
  DUB: "dub",
} as const;

export type SubOrDub = (typeof SUB_OR_DUB)[keyof typeof SUB_OR_DUB];

// Define streaming servers
export const STREAMING_SERVERS = {
  GogoCDN: "gogocdn",
  StreamSB: "streamsb",
  MegaCloud: "megacloud",
  VidStreaming: "vidstreaming",
  MixDrop: "mixdrop",
  UpCloud: "upcloud",
  VidCloud: "vidcloud",
  StreamTape: "streamtape",
  VizCloud: "vizcloud",
  MyCloud: "mycloud",
  Filemoon: "filemoon",
  VidMoly: "vidmoly",
} as const;

export type StreamingServer = (typeof STREAMING_SERVERS)[keyof typeof STREAMING_SERVERS];

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
      case PROVIDERS.NINEANIME:
        providerInstances[providerName] = new ANIME.NineAnime();
        break;
      case PROVIDERS.ANIFY:
        providerInstances[providerName] = new ANIME.Anify();
        break;
      // Add more providers as needed
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
    
    // Some providers support dubOrSub parameter
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
 * Get episode streaming sources with specific server
 */
export const getEpisodeSources = async (
  episodeId: string, 
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  server?: StreamingServer
): Promise<EpisodeSource | null> => {
  try {
    console.log(`Getting sources for episode ID: ${episodeId} using ${providerName} provider, server: ${server || 'default'}`);
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
      sources: sources.sources,
      subtitles: sources.subtitles,
      intro: sources.intro
    };
  } catch (error) {
    console.error(`Error getting episode sources for ID "${episodeId}":`, error);
    return null;
  }
};

/**
 * Search anime by title and get episode streaming links
 * Complete flow: search -> get info -> get episode sources
 */
export const searchAndGetEpisodeLinks = async (
  title: string, 
  episodeNumber: number,
  providerName: AnimeProvider = PROVIDERS.GOGOANIME,
  subOrDub: SubOrDub = SUB_OR_DUB.SUB,
  server?: StreamingServer
) => {
  try {
    // Step 1: Search for the anime
    const searchResults = await searchAnime(title, providerName);
    if (!searchResults.length) {
      console.log(`No results found for "${title}"`);
      return null;
    }
    
    // Step 2: Get anime info for the first result
    const animeId = searchResults[0].id;
    const animeInfo = await getAnimeInfo(animeId, providerName, subOrDub);
    if (!animeInfo || !animeInfo.episodes || animeInfo.episodes.length === 0) {
      console.log(`No episodes found for anime "${title}"`);
      return null;
    }
    
    // Step 3: Find the requested episode
    const episode = animeInfo.episodes.find(ep => 
      Number(ep.number) === episodeNumber || 
      Number(ep.id.split('-').pop()) === episodeNumber
    );
    
    if (!episode) {
      console.log(`Episode ${episodeNumber} not found for anime "${title}"`);
      return null;
    }
    
    // Step 4: Get streaming sources for the episode
    const sources = await getEpisodeSources(episode.id, providerName, server);
    return {
      title: animeInfo.title,
      episode: episode,
      sources: sources
    };
  } catch (error) {
    console.error(`Error in searchAndGetEpisodeLinks for "${title}" episode ${episodeNumber}:`, error);
    return null;
  }
};

/**
 * Get recent episodes across providers
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
 * Get all possible servers for a specific episode
 * This can be useful to display all available streaming options to the user
 */
export const getAvailableServers = async (
  episodeId: string,
  providerName: AnimeProvider = PROVIDERS.GOGOANIME
) => {
  try {
    console.log(`Getting available servers for episode ID: ${episodeId} using ${providerName} provider`);
    const provider = getProvider(providerName);
    
    // Not all providers support this method
    if (!provider.fetchEpisodeServers) {
      console.log(`Provider ${providerName} doesn't support fetching servers list`);
      return [];
    }
    
    const servers = await provider.fetchEpisodeServers(episodeId);
    console.log(`Found ${servers.length} servers for episode ${episodeId}`);
    return servers;
  } catch (error) {
    console.error(`Error getting servers for episode "${episodeId}":`, error);
    return [];
  }
};

/**
 * Try to get sources from multiple providers
 * This is useful when one provider might not have the content or is down
 */
export const getSourcesFromMultipleProviders = async (
  animeTitle: string,
  episodeNumber: number,
  providers: AnimeProvider[] = [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX]
) => {
  console.log(`Trying to get sources for "${animeTitle}" episode ${episodeNumber} from multiple providers`);
  
  for (const provider of providers) {
    try {
      console.log(`Trying provider: ${provider}`);
      const result = await searchAndGetEpisodeLinks(animeTitle, episodeNumber, provider);
      
      if (result && result.sources && result.sources.sources && result.sources.sources.length > 0) {
        console.log(`Found sources using provider ${provider}`);
        return {
          provider,
          ...result
        };
      }
    } catch (error) {
      console.error(`Error with provider ${provider}:`, error);
    }
  }
  
  console.log(`No sources found for "${animeTitle}" episode ${episodeNumber} after trying ${providers.length} providers`);
  return null;
};

// Export the providers and types for direct use
export { PROVIDERS };
