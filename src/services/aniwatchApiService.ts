/**
 * Aniwatch API Service - Direct integration with https://github.com/ghoshRitesh12/aniwatch-api
 * 
 * This service provides reliable anime streaming using the aniwatch-api backend.
 * The API scrapes hianime.to and provides clean JSON endpoints.
 * 
 * API Documentation: https://github.com/ghoshRitesh12/aniwatch-api#documentation
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface AniwatchSearchResult {
  id: string;
  name: string;
  poster?: string;
  duration?: string;
  type?: string;
  rating?: string;
  episodes?: {
    sub: number;
    dub: number;
  };
}

export interface AniwatchEpisode {
  number: number;
  title: string;
  episodeId: string;
  isFiller?: boolean;
}

export interface AniwatchStreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface AniwatchTrack {
  lang: string;
  url: string;
}

export interface AniwatchStreamingData {
  headers: {
    Referer: string;
    [key: string]: string;
  };
  sources: AniwatchStreamingSource[];
  tracks: AniwatchTrack[];  // API uses 'tracks' not 'subtitles'
  intro?: {
    start: number;
    end: number;
  };
  outro?: {
    start: number;
    end: number;
  };
  anilistID?: number | null;
  malID?: number | null;
}

export interface VideoSource {
  url: string;
  directUrl?: string;
  embedUrl?: string;
  quality: string;
  headers?: Record<string, string>;
  type: 'hls' | 'mp4';
  isM3U8?: boolean;
}

export interface EpisodeInfo {
  number: number;
  title: string;
  id: string;
  episodeId: string;
  duration?: string;
  image?: string;
  isFiller?: boolean;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Your deployed Aniwatch API instance
 * Not used directly in browser - we proxy through Vite (dev) or Vercel (prod)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ANIWATCH_API_BASE_URL = import.meta.env.VITE_ANIWATCH_API_URL || 'https://aniwatch-latest.onrender.com';

// Cache duration in milliseconds
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CACHING SYSTEM
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  set<T>(key: string, data: T, duration: number = CACHE_DURATION): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + duration,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.timestamp) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// ANIWATCH API SERVICE CLASS
// ============================================================================

class AniwatchApiService {
  private cache = new SimpleCache();
  private lastRequestTime = 0;

  /**
   * Make an API request with caching
   * Uses Vite proxy in development, Vercel serverless function in production
   */
  private async fetchWithRetry<T>(
    endpoint: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _maxRetries: number = 3
  ): Promise<T | null> {
    const cacheKey = endpoint;

    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Both DEV and PROD now use our own proxy (Vite in dev, Vercel in prod)
    try {
      // Use appropriate proxy path based on environment
      const proxyPath = import.meta.env.DEV ? '/aniwatch-api' : '/api/aniwatch?path=';
      const url = import.meta.env.DEV 
        ? `${proxyPath}${endpoint}`
        : `${proxyPath}${encodeURIComponent(endpoint)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }
      
      // Success - parse and return
      const jsonData = await response.json();
      
      // Handle both response formats
      if (jsonData.success && jsonData.data) {
        const data = jsonData.data as T;
        this.cache.set(cacheKey, data);
        return data;
      }
      
      if (jsonData.status === 200 && jsonData.data) {
        const data = jsonData.data as T;
        this.cache.set(cacheKey, data);
        return data;
      }
      
      // Check for error responses
      if (jsonData.status && jsonData.status !== 200) {
        return null;
      }
      
      // Direct data return (no wrapper)
      if (jsonData && typeof jsonData === 'object') {
        const data = jsonData as T;
        this.cache.set(cacheKey, data);
        return data;
      }
      
      return null;
      
    } catch {
      return null;
    }
  }

  /**
   * Search for anime by title
   * 
   * @param title - The anime title to search for
   * @param page - Page number (default: 1)
   * @returns Array of search results
   * 
   * API: GET /api/v2/hianime/search?q={query}&page={page}
   */
  async searchAnime(title: string, page: number = 1): Promise<AniwatchSearchResult[]> {
    const endpoint = `/api/v2/hianime/search?q=${encodeURIComponent(title)}&page=${page}`;
    
    interface SearchResponse {
      animes: AniwatchSearchResult[];
      mostPopularAnimes?: AniwatchSearchResult[];
      currentPage: number;
      totalPages: number;
      hasNextPage: boolean;
    }

    const data = await this.fetchWithRetry<SearchResponse>(endpoint);
    
    if (!data || !data.animes || data.animes.length === 0) {
      return [];
    }

    return data.animes;
  }

  /**
   * Get all episodes for an anime
   * 
   * @param animeId - The unique anime ID (e.g., "steinsgate-3")
   * @returns Array of episodes
   * 
   * API: GET /api/v2/hianime/anime/{animeId}/episodes
   */
  async getEpisodes(animeId: string): Promise<EpisodeInfo[]> {
    const endpoint = `/api/v2/hianime/anime/${encodeURIComponent(animeId)}/episodes`;
    
    interface EpisodesResponse {
      totalEpisodes: number;
      episodes: AniwatchEpisode[];
    }

    const data = await this.fetchWithRetry<EpisodesResponse>(endpoint);
    
    if (!data || !data.episodes || data.episodes.length === 0) {
      return [];
    }

    const episodes: EpisodeInfo[] = data.episodes.map(ep => ({
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      id: ep.episodeId,
      episodeId: ep.episodeId,
      duration: '24:00', // Default duration
      isFiller: ep.isFiller || false,
    }));

    return episodes;
  }

  /**
   * Get streaming sources for an episode
   * 
   * @param episodeId - The episode ID (e.g., "steinsgate-3?ep=230")
   * @param category - Audio category: 'sub', 'dub', or 'raw' (default: 'sub')
   * @param server - Server name (default: 'hd-1')
   * @returns Streaming data with sources, headers, and tracks (subtitles)
   * 
   * API: GET /api/v2/hianime/episode/sources?animeEpisodeId={episodeId}&server={server}&category={category}
   */
  async getStreamingSources(
    episodeId: string,
    category: 'sub' | 'dub' | 'raw' = 'sub',
    server: string = 'hd-1'
  ): Promise<AniwatchStreamingData | null> {
    
    // Add small delay to avoid rate limiting (only if not first request)
    if (this.lastRequestTime > 0) {
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      const minDelay = 500; // 500ms between requests
      if (timeSinceLastRequest < minDelay) {
        const waitTime = minDelay - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    this.lastRequestTime = Date.now();
    
    // Servers to try in order (hd-1 and hd-2 are most reliable)
    const serversToTry = [
      server,        // Try requested server first
      'hd-1',        // Primary HD server
      'hd-2',        // Backup HD server
      'megacloud',   // Alternative server
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
    
    // Try each server
    for (const serverName of serversToTry) {
      try {
        // episodeId format: "one-piece-100?ep=2142" - encode properly for query param
        const encodedEpisodeId = encodeURIComponent(episodeId);
        const endpoint = `/api/v2/hianime/episode/sources?animeEpisodeId=${encodedEpisodeId}&server=${serverName}&category=${category}`;
        
        // Use Vite proxy in dev mode - it works fine for all endpoints
        const data = await this.fetchWithRetry<AniwatchStreamingData>(endpoint, 2);
        
        if (data && data.sources && data.sources.length > 0) {
          return data;
        }
      } catch (error) {
        // Server failed, try next
      }
    }
    
    return null;
  }

  /**
   * Get all available servers for an episode
   * 
   * @param episodeId - The episode ID
   * @returns Available servers for sub, dub, and raw
   * 
   * API: GET /api/v2/hianime/episode/servers?animeEpisodeId={episodeId}
   */
  async getEpisodeServers(episodeId: string): Promise<{
    sub: Array<{ serverId: number; serverName: string }>;
    dub: Array<{ serverId: number; serverName: string }>;
    raw: Array<{ serverId: number; serverName: string }>;
  } | null> {
    // episodeId format: "anime-id?ep=123" - properly encode it for the query string
    const encodedEpisodeId = encodeURIComponent(episodeId);
    const endpoint = `/api/v2/hianime/episode/servers?animeEpisodeId=${encodedEpisodeId}`;
    
    interface ServersResponse {
      episodeId: string;
      episodeNo: number;
      sub: Array<{ serverId: number; serverName: string }>;
      dub: Array<{ serverId: number; serverName: string }>;
      raw: Array<{ serverId: number; serverName: string }>;
    }

    const data = await this.fetchWithRetry<ServersResponse>(endpoint);
    
    if (!data) {
      return null;
    }
    
    return {
      sub: data.sub,
      dub: data.dub,
      raw: data.raw,
    };
  }

  /**
   * Convert Aniwatch streaming data to VideoSource format used by the player
   */
  convertToVideoSources(streamingData: AniwatchStreamingData): VideoSource[] {
    return streamingData.sources.map((source) => ({
      url: source.url,
      directUrl: source.url,
      embedUrl: source.url,
      quality: source.quality || 'auto',
      type: source.isM3U8 ? 'hls' : 'mp4',
      isM3U8: source.isM3U8,
      headers: streamingData.headers,
    }));
  }

  /**
   * Main method: Get streaming data for an episode by anime title and episode number
   * This is the primary method used by the video player
   * 
   * @param animeTitle - The title of the anime
   * @param episodeNumber - The episode number
   * @param category - Audio category: 'sub', 'dub', or 'raw'
   * @returns Array of video sources ready for the player
   */
  async getStreamingDataForEpisode(
    animeTitle: string,
    episodeNumber: number,
    category: 'sub' | 'dub' | 'raw' = 'sub'
  ): Promise<VideoSource[]> {
    try {
      // Step 1: Search for the anime
      const searchResults = await this.searchAnime(animeTitle);
      
      if (searchResults.length === 0) {
        return [];
      }

      // Use the first result (usually the most relevant)
      const anime = searchResults[0];

      // Step 2: Get episodes for the anime
      const episodes = await this.getEpisodes(anime.id);
      
      if (episodes.length === 0) {
        return [];
      }

      // Step 3: Find the specific episode
      const targetEpisode = episodes.find(ep => ep.number === episodeNumber);
      
      if (!targetEpisode) {
        return [];
      }

      // Step 4: Get streaming sources
      const streamingData = await this.getStreamingSources(targetEpisode.episodeId, category);
      
      if (!streamingData) {
        return [];
      }

      // Step 5: Convert to VideoSource format
      const videoSources = this.convertToVideoSources(streamingData);
      
      return videoSources;

    } catch (error) {
      console.error('Error getting streaming data:', error);
      return [];
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.searchAnime('Naruto');
      return result.length > 0;
    } catch (error) {
      console.error('API test failed:', error);
      return false;
    }
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

const aniwatchApi = new AniwatchApiService();
export default aniwatchApi;

// ============================================================================
// EXPORT CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Search for anime
 */
export const searchAnime = (title: string, page?: number) => 
  aniwatchApi.searchAnime(title, page);

/**
 * Get episodes for an anime
 */
export const fetchEpisodes = (animeId: string) => 
  aniwatchApi.getEpisodes(animeId);

/**
 * Get streaming sources (main function for video player)
 */
export const getStreamingDataForEpisode = (
  animeTitle: string,
  episodeNumber: number,
  category?: 'sub' | 'dub' | 'raw'
) => aniwatchApi.getStreamingDataForEpisode(animeTitle, episodeNumber, category);

/**
 * Get streaming sources by episode ID
 */
export const getStreamingSources = (
  episodeId: string,
  category?: 'sub' | 'dub' | 'raw',
  server?: string
) => aniwatchApi.getStreamingSources(episodeId, category, server);

/**
 * Get available servers for an episode
 */
export const getEpisodeServers = (episodeId: string) =>
  aniwatchApi.getEpisodeServers(episodeId);
