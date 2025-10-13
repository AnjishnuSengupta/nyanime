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

export interface AniwatchSubtitle {
  lang: string;
  url: string;
}

export interface AniwatchStreamingData {
  headers: {
    Referer: string;
    'User-Agent': string;
    [key: string]: string;
  };
  sources: AniwatchStreamingSource[];
  subtitles: AniwatchSubtitle[];
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
 * Uses environment variable with fallback
 */
const ANIWATCH_API_BASE_URL = import.meta.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend.vercel.app';
const USE_CORS_PROXY = false; // ✅ Backend CORS should be configured!
const CORS_PROXY = import.meta.env.VITE_CORS_PROXY_URL || 'https://corsproxy.io/?';

console.log(`🔧 Aniwatch API: Using base URL: ${ANIWATCH_API_BASE_URL}`);
console.log(`🔧 CORS Proxy enabled: ${USE_CORS_PROXY}`);

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

  /**
   * Make an API request with caching and improved mobile network handling
   */
  private async fetchWithRetry<T>(
    endpoint: string,
    maxRetries: number = 5 // Increased from 3 to 5 for mobile networks
  ): Promise<T | null> {
    const cacheKey = endpoint;

    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      console.log(`✅ Cache hit for: ${endpoint}`);
      return cached;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Add CORS proxy if enabled
      const baseUrl = USE_CORS_PROXY 
        ? `${CORS_PROXY}${encodeURIComponent(ANIWATCH_API_BASE_URL)}` 
        : ANIWATCH_API_BASE_URL;
      const url = `${baseUrl}${endpoint}`;

      try {
        console.log(`🌐 Fetching (attempt ${attempt + 1}/${maxRetries}): ${url}`);
        
        const controller = new AbortController();
        // Progressive timeout: longer for mobile networks
        const timeout = 10000 + (attempt * 5000); // Start at 10s, increase by 5s each retry
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache', // Prevent stale mobile cache
          },
          signal: controller.signal,
          // Mobile-friendly settings
          cache: 'no-store', // Don't use browser cache on mobile
          keepalive: true, // Keep connection alive for retries
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Retry on server errors (5xx) and some client errors
          if (response.status >= 500 || response.status === 429 || response.status === 408) {
            throw new Error(`HTTP ${response.status}: ${response.statusText} (retrying...)`);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const jsonData = await response.json();
        
        console.log(`📦 API Response format:`, { 
          hasSuccess: 'success' in jsonData, 
          hasStatus: 'status' in jsonData,
          hasData: 'data' in jsonData,
          keys: Object.keys(jsonData)
        });
        
        // Aniwatch API returns { success: true, data: {...} }
        if (jsonData.success && jsonData.data) {
          const data = jsonData.data as T;
          this.cache.set(cacheKey, data);
          console.log(`✅ Successfully fetched data from API`);
          return data;
        }

        // Old format compatibility { status: 200, data: {...} }
        if (jsonData.status === 200 && jsonData.data) {
          const data = jsonData.data as T;
          this.cache.set(cacheKey, data);
          console.log(`✅ Successfully fetched data (legacy format)`);
          return data;
        }
        
        // Try direct data return (some endpoints return data directly)
        if (jsonData && typeof jsonData === 'object' && !jsonData.success && !jsonData.status) {
          const data = jsonData as T;
          this.cache.set(cacheKey, data);
          console.log(`✅ Successfully fetched data (direct format)`);
          return data;
        }

        throw new Error('Invalid API response format');

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Request failed (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
        
        // Exponential backoff for mobile networks
        if (attempt < maxRetries - 1) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 seconds
          console.log(`⏳ Waiting ${backoffTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    console.error(`❌ All retry attempts failed after ${maxRetries} attempts`);
    console.error('Last error:', lastError);
    return null;
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
    console.log(`🔍 Searching for anime: "${title}"`);
    
    const endpoint = `/api/v2/hianime/search?q=${encodeURIComponent(title)}&page=${page}`;
    
    interface SearchResponse {
      animes: AniwatchSearchResult[];
      currentPage: number;
      hasNextPage: boolean;
      totalPages: number;
    }

    const data = await this.fetchWithRetry<SearchResponse>(endpoint);
    
    if (!data || !data.animes || data.animes.length === 0) {
      console.log(`⚠️ No results found for: "${title}"`);
      return [];
    }

    console.log(`✅ Found ${data.animes.length} results for: "${title}"`);
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
    console.log(`📺 Getting episodes for anime ID: ${animeId}`);
    
    const endpoint = `/api/v2/hianime/anime/${encodeURIComponent(animeId)}/episodes`;
    
    interface EpisodesResponse {
      totalEpisodes: number;
      episodes: AniwatchEpisode[];
    }

    const data = await this.fetchWithRetry<EpisodesResponse>(endpoint);
    
    if (!data || !data.episodes || data.episodes.length === 0) {
      console.log(`⚠️ No episodes found for anime ID: ${animeId}`);
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

    console.log(`✅ Found ${episodes.length} episodes for: ${animeId}`);
    return episodes;
  }

  /**
   * Get streaming sources for an episode - Mobile optimized
   * 
   * @param episodeId - The episode ID (e.g., "steinsgate-3?ep=230")
   * @param category - Audio category: 'sub', 'dub', or 'raw' (default: 'sub')
   * @param server - Server name (default: 'hd-1')
   * @returns Streaming data with sources, headers, and subtitles
   * 
   * API: GET /api/v2/hianime/episode/sources?animeEpisodeId={episodeId}&server={server}&category={category}
   */
  async getStreamingSources(
    episodeId: string,
    category: 'sub' | 'dub' | 'raw' = 'sub',
    _server: string = 'hd-1'
  ): Promise<AniwatchStreamingData | null> {
    console.log(`🎬 Getting streaming sources for episode: ${episodeId} (category: ${category})`);
    
    // Try ALL servers aggressively - prioritize reliable ones first
    const serversToTry = [
      'hd-1',        // Primary HD server
      'megacloud',   // Reliable backup
      'hd-2',        // Secondary HD
      'vidstreaming', // Fallback 1
      'streamtape',  // Fallback 2
      'streamsb',    // Fallback 3
    ];
    
    const allSources: AniwatchStreamingData['sources'] = [];
    let firstWorkingData: AniwatchStreamingData | null = null;
    let successfulServers = 0;
    
    // Try servers in parallel for faster loading on mobile
    const serverPromises = serversToTry.map(async (serverName) => {
      try {
        console.log(`🔄 Trying server: ${serverName} with category: ${category}`);
        const endpoint = `/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${serverName}&category=${category}`;
        
        const data = await this.fetchWithRetry<AniwatchStreamingData>(endpoint, 3); // Reduced retries for parallel requests
        
        if (data && data.sources && data.sources.length > 0) {
          console.log(`✅ Found ${data.sources.length} streaming sources from server: ${serverName}`);
          console.log(`📋 Sources:`, data.sources.map(s => `${s.quality || 'auto'} (${s.isM3U8 ? 'HLS' : 'MP4'})`));
          
          return {
            serverName,
            data,
            sources: data.sources.map(s => ({
              ...s,
              serverName: serverName // Add server identifier
            }))
          };
        } else {
          console.log(`⚠️ No sources from server ${serverName}`);
          return null;
        }
      } catch (error) {
        console.log(`❌ Server ${serverName} failed:`, error);
        return null;
      }
    });
    
    // Wait for all servers (with timeout)
    const results = await Promise.allSettled(serverPromises.map(p => 
      Promise.race([
        p,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server timeout')), 15000)
        )
      ])
    ));
    
    // Collect all successful sources
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const serverResult = result.value as { serverName: string; data: AniwatchStreamingData; sources: AniwatchStreamingData['sources'] };
        
        // Keep first working data for headers and metadata
        if (!firstWorkingData) {
          firstWorkingData = serverResult.data;
        }
        
        allSources.push(...serverResult.sources);
        successfulServers++;
      }
    }
    
    if (allSources.length === 0) {
      console.log(`❌ No streaming sources found from any server for episode: ${episodeId}`);
      return null;
    }
    
    console.log(`✅ Total sources collected: ${allSources.length} from ${successfulServers} servers`);
    
    // Sort sources by quality (prefer auto/default first for adaptive streaming)
    const sortedSources = allSources.sort((a, b) => {
      if (a.quality === 'default' || a.quality === 'auto') return -1;
      if (b.quality === 'default' || b.quality === 'auto') return 1;
      return 0;
    });
    
    // Return data with all collected sources
    if (!firstWorkingData) {
      console.log(`❌ No valid streaming data found`);
      return null;
    }
    
    return {
      ...firstWorkingData,
      sources: sortedSources
    };
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
    console.log(`🖥️ Getting available servers for episode: ${episodeId}`);
    
    const endpoint = `/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`;
    
    interface ServersResponse {
      episodeId: string;
      episodeNo: number;
      sub: Array<{ serverId: number; serverName: string }>;
      dub: Array<{ serverId: number; serverName: string }>;
      raw: Array<{ serverId: number; serverName: string }>;
    }

    const data = await this.fetchWithRetry<ServersResponse>(endpoint);
    
    if (!data) {
      console.log(`⚠️ No servers found for episode: ${episodeId}`);
      return null;
    }

    console.log(`✅ Available servers - Sub: ${data.sub.length}, Dub: ${data.dub.length}, Raw: ${data.raw.length}`);
    
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
    console.log(`🚀 Getting streaming data for: "${animeTitle}" Episode ${episodeNumber} (${category})`);
    
    try {
      // Step 1: Search for the anime
      const searchResults = await this.searchAnime(animeTitle);
      
      if (searchResults.length === 0) {
        console.log('❌ No anime found in search results');
        return [];
      }

      // Use the first result (usually the most relevant)
      const anime = searchResults[0];
      console.log(`✅ Found anime: ${anime.name} (ID: ${anime.id})`);

      // Step 2: Get episodes for the anime
      const episodes = await this.getEpisodes(anime.id);
      
      if (episodes.length === 0) {
        console.log('❌ No episodes found for this anime');
        return [];
      }

      // Step 3: Find the specific episode
      const targetEpisode = episodes.find(ep => ep.number === episodeNumber);
      
      if (!targetEpisode) {
        console.log(`❌ Episode ${episodeNumber} not found. Available episodes: 1-${episodes.length}`);
        return [];
      }

      console.log(`✅ Found episode: ${targetEpisode.title} (ID: ${targetEpisode.episodeId})`);

      // Step 4: Get streaming sources
      const streamingData = await this.getStreamingSources(targetEpisode.episodeId, category);
      
      if (!streamingData) {
        console.log('❌ No streaming sources available');
        return [];
      }

      // Step 5: Convert to VideoSource format
      const videoSources = this.convertToVideoSources(streamingData);
      
      console.log(`✅ Successfully retrieved ${videoSources.length} video sources`);
      console.log(`📋 Source details:`, videoSources.map(s => `${s.quality} (${s.type})`).join(', '));
      
      return videoSources;

    } catch (error) {
      console.error('❌ Error getting streaming data:', error);
      return [];
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing API connection...');
      const result = await this.searchAnime('Naruto');
      console.log(`✅ API test successful! Found ${result.length} results`);
      return result.length > 0;
    } catch (error) {
      console.error('❌ API test failed:', error);
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
