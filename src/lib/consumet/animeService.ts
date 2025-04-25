import client from './client';

// Define provider types based on Consumet docs
export const PROVIDERS = {
  GOGOANIME: 'gogoanime',
  ANIMEPAHE: 'animepahe',
  ZORO: 'zoro', // Now called Kaido/AniWatch
  ANIMEFOX: 'animefox',
  CRUNCHYROLL: 'crunchyroll',
  BILIBILI: 'bilibili',
} as const;

export type AnimeProvider = typeof PROVIDERS[keyof typeof PROVIDERS];

// Define streaming servers based on Consumet docs
export const SERVERS = {
  GOGOCDN: 'gogocdn',
  STREAMSB: 'streamsb',
  VIDSTREAMING: 'vidstreaming',
  VIDCLOUD: 'vidcloud',
} as const;

export type StreamingServer = typeof SERVERS[keyof typeof SERVERS];

// Define interfaces based on Consumet API responses
export interface AnimeResult {
  id: string;
  title: string;
  url: string;
  image: string;
  releaseDate?: string;
  subOrDub?: string;
}

export interface AnimeInfo {
  id: string;
  title: string;
  url: string;
  genres?: string[];
  totalEpisodes?: number;
  image?: string;
  releaseDate?: string;
  description?: string;
  subOrDub?: string;
  type?: string;
  status?: string;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  number: number;
  url: string;
  title?: string;
}

export interface Source {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface Subtitle {
  id: string;
  language: string;
  url: string;
}

export interface EpisodeSources {
  headers?: Record<string, string>;
  sources: Source[];
  subtitles?: Subtitle[];
}

export interface ServerInfo {
  name: string;
  url: string;
}

class AnimeService {
  // Search for anime
  async search(query: string, provider: AnimeProvider = PROVIDERS.GOGOANIME, page: number = 1): Promise<AnimeResult[]> {
    try {
      const response = await client.get(`/anime/${provider}/${query}`, {
        params: { page }
      });
      
      return response.data.results || [];
    } catch (error) {
      console.error(`Error searching anime with provider ${provider}:`, error);
      return [];
    }
  }
  
  // Get anime info (including episodes)
  async getAnimeInfo(id: string, provider: AnimeProvider = PROVIDERS.GOGOANIME): Promise<AnimeInfo | null> {
    try {
      const response = await client.get(`/anime/${provider}/info/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting anime info for ${id} with provider ${provider}:`, error);
      return null;
    }
  }
  
  // Get episode sources (streaming links)
  async getEpisodeSources(
    episodeId: string, 
    provider: AnimeProvider = PROVIDERS.GOGOANIME,
    server?: StreamingServer
  ): Promise<EpisodeSources> {
    try {
      let url = `/anime/${provider}/watch/${episodeId}`;
      if (server) {
        url += `?server=${server}`;
      }
      const response = await client.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error getting episode sources for ${episodeId} with provider ${provider}:`, error);
      return { sources: [] };
    }
  }
  
  // Get available servers for an episode
  async getServers(
    episodeId: string,
    provider: AnimeProvider = PROVIDERS.GOGOANIME
  ): Promise<ServerInfo[]> {
    try {
      const response = await client.get(`/anime/${provider}/servers/${episodeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting servers for ${episodeId} with provider ${provider}:`, error);
      return [];
    }
  }
  
  // Utility method to search and get episode by title and number
  async searchAndGetEpisode(
    title: string,
    episodeNumber: number,
    provider: AnimeProvider = PROVIDERS.GOGOANIME
  ): Promise<{ episode: Episode | null, anime: AnimeInfo | null }> {
    try {
      // Search for the anime
      const searchResults = await this.search(title, provider);
      if (!searchResults.length) {
        return { episode: null, anime: null };
      }
      
      // Get info for the first result
      const animeInfo = await this.getAnimeInfo(searchResults[0].id, provider);
      if (!animeInfo) {
        return { episode: null, anime: null };
      }
      
      // Find the requested episode
      const episode = animeInfo.episodes.find(ep => ep.number === episodeNumber);
      if (!episode) {
        return { episode: null, anime: animeInfo };
      }
      
      return { episode, anime: animeInfo };
    } catch (error) {
      console.error(`Error searching for ${title} episode ${episodeNumber}:`, error);
      return { episode: null, anime: null };
    }
  }
  
  // Get sources for an episode using title and episode number
  async getSourcesByTitleAndEpisode(
    title: string,
    episodeNumber: number,
    provider: AnimeProvider = PROVIDERS.GOGOANIME,
    server?: StreamingServer
  ): Promise<{ sources: EpisodeSources, anime: AnimeInfo | null }> {
    try {
      const { episode, anime } = await this.searchAndGetEpisode(title, episodeNumber, provider);
      
      if (!episode) {
        return { sources: { sources: [] }, anime };
      }
      
      const sources = await this.getEpisodeSources(episode.id, provider, server);
      return { sources, anime };
    } catch (error) {
      console.error(`Error getting sources for ${title} episode ${episodeNumber}:`, error);
      return { sources: { sources: [] }, anime: null };
    }
  }
  
  // Try multiple providers to find a working source
  async tryMultipleProviders(
    title: string,
    episodeNumber: number,
    providers: AnimeProvider[] = [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX]
  ): Promise<{ sources: EpisodeSources, provider: AnimeProvider, anime: AnimeInfo | null }> {
    for (const provider of providers) {
      try {
        const { sources, anime } = await this.getSourcesByTitleAndEpisode(title, episodeNumber, provider);
        if (sources.sources && sources.sources.length > 0) {
          return { sources, provider, anime };
        }
      } catch (error) {
        console.warn(`Provider ${provider} failed for ${title} episode ${episodeNumber}:`, error);
      }
    }
    
    return { 
      sources: { sources: [] }, 
      provider: providers[0], 
      anime: null 
    };
  }
  
  // Generate a proper Consumet episode ID from anime title and episode number
  generateEpisodeId(
    title: string,
    episodeNumber: number,
    provider: AnimeProvider = PROVIDERS.GOGOANIME
  ): string {
    const formattedTitle = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
      
    switch (provider) {
      case PROVIDERS.GOGOANIME:
        return `${formattedTitle}-episode-${episodeNumber}`;
      case PROVIDERS.ZORO:
        return `${formattedTitle}-${episodeNumber}`;
      default:
        return `${formattedTitle}-episode-${episodeNumber}`;
    }
  }
}

export default new AnimeService();