/**
 * Aniwatch API Service — Frontend client
 * 
 * Calls server-side API routes that use the `aniwatch` npm package for direct scraping.
 * No external hosted API dependency — faster, more reliable.
 * 
 * Server routes:
 *   - Vercel:     /api/aniwatch?action=...
 *   - Render:     /aniwatch?action=...
 *   - Cloudflare: /aniwatch?action=...
 *   - Dev (Vite): /aniwatch?action=... (proxied by Vite dev server)
 * 
 * The old hosted API is used as automatic fallback by the server if scraping fails.
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
  tracks: AniwatchTrack[];
  subtitles?: AniwatchTrack[];
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
  embedURL?: string;
  download?: string;
}

export interface VideoSource {
  url: string;
  directUrl?: string;
  embedUrl?: string;
  quality: string;
  headers?: Record<string, string>;
  type: 'hls' | 'mp4';
  isM3U8?: boolean;
  tracks?: AniwatchTrack[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
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
  // In-flight request deduplication: prevents duplicate scraper calls
  // when React Strict Mode double-invokes effects
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * Build the API URL for the local server-side aniwatch route.
   * 
   * All platforms (Vercel, Render, Cloudflare, Netlify) expose the same
   * `/aniwatch` endpoint on the same origin — no CORS proxies needed.
   * 
   * Action-based routing: /aniwatch?action=search&q=...
   * Legacy path routing:  /aniwatch?path=/api/v2/hianime/...
   * 
   * Vercel rewrites /aniwatch → /api/aniwatch (see vercel.json).
   * Render serves via Express (server.js).
   * Cloudflare/Netlify use Functions (functions/aniwatch.ts).
   * Vite dev server proxies /aniwatch → local Express or direct handler.
   */
  private buildActionUrl(action: string, params: Record<string, string> = {}): string {
    const searchParams = new URLSearchParams({ action, ...params });
    return `/aniwatch?${searchParams.toString()}`;
  }

  /**
   * Make an API request with caching.
   * Calls local /aniwatch server-side route (same origin, no CORS needed).
   * Server handles npm package scraping with old API fallback automatically.
   */
  private async fetchAction<T>(
    action: string,
    params: Record<string, string> = {},
    cacheDuration: number = CACHE_DURATION
  ): Promise<T | null> {
    const cacheKey = `${action}:${JSON.stringify(params)}`;

    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // Deduplicate in-flight requests (React Strict Mode calls effects twice)
    if (this.inflight.has(cacheKey)) {
      return this.inflight.get(cacheKey) as Promise<T | null>;
    }

    const doFetch = async (): Promise<T | null> => {

    // Retry up to 2 times for transient failures (scraper can be intermittent)
    const maxRetries = action === 'sources' ? 2 : 1;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const url = this.buildActionUrl(action, params);
        
        // Timeout: 60s for sources (server tries 4 extractors sequentially with 12s each), 10s for others
        const timeoutMs = action === 'sources' ? 60000 : 10000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[aniwatch] ${action} failed: HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries})`);
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          return null;
        }
        
        const json = await response.json();
        
        // Server wraps responses in { success, data } or { success, error }
        let data: T;
        if (json.success && json.data !== undefined) {
          data = json.data as T;
        } else if (json.data !== undefined) {
          data = json.data as T;
        } else if (json && typeof json === 'object' && !json.error) {
          // Direct data (no wrapper)
          data = json as T;
        } else {
          console.warn(`[aniwatch] ${action} returned error:`, json.error || json);
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          return null;
        }
        
        this.cache.set(cacheKey, data, cacheDuration);
        return data;
      } catch (error) {
        const isTimeout = error instanceof DOMException && error.name === 'AbortError';
        console.error(`[aniwatch] ${action} request ${isTimeout ? 'timed out' : 'failed'} (attempt ${attempt + 1}/${maxRetries}):`, error);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        return null;
      }
    }
    
    return null;
    }; // end doFetch

    // Track in-flight request and clean up when done
    const promise = doFetch().finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Search for anime by title
   * 
   * @param title - The anime title to search for
   * @param page - Page number (default: 1)
   * @returns Array of search results
   * 
   * Server: action=search&q={query}&page={page}
   */
  async searchAnime(title: string, page: number = 1): Promise<AniwatchSearchResult[]> {
    interface SearchResponse {
      animes: AniwatchSearchResult[];
      mostPopularAnimes?: AniwatchSearchResult[];
      currentPage: number;
      totalPages: number;
      hasNextPage: boolean;
    }

    const data = await this.fetchAction<SearchResponse>('search', {
      q: title,
      page: String(page),
    });
    
    if (!data || !data.animes || data.animes.length === 0) {
      return [];
    }

    return data.animes;
  }

  /**
   * Find the best matching anime from search results
   * Uses fuzzy matching to handle season numbers, special characters, etc.
   * 
   * @param searchResults - Array of search results from searchAnime
   * @param targetTitle - The original anime title to match against
   * @param expectedEpisodes - Expected number of episodes (optional, for better matching)
   * @param alternativeTitle - Alternative title (e.g., English title when target is Japanese)
   * @returns The best matching result or the first result if no good match found
   */
  findBestMatch(
    searchResults: AniwatchSearchResult[], 
    targetTitle: string, 
    expectedEpisodes?: number,
    alternativeTitle?: string
  ): AniwatchSearchResult | null {
    if (searchResults.length === 0) return null;
    if (searchResults.length === 1) return searchResults[0];
    
    // Normalize a title for comparison - removes special chars, normalizes spaces
    const normalize = (str: string): string => {
      return str
        .toLowerCase()
        .replace(/[-_:]/g, ' ')       // Replace hyphens, underscores, colons with spaces
        .replace(/[^a-z0-9\s]/g, '')  // Remove other special characters
        .replace(/\s+/g, ' ')         // Normalize spaces
        .trim();
    };
    
    // Get individual words from a title (for word matching)
    const getWords = (str: string): string[] => {
      return normalize(str).split(' ').filter(w => w.length > 0);
    };
    
    // Roman numeral to number mapping
    const romanNumerals: Record<string, number> = {
      'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 
      'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10
    };
    
    // Extract season/part number from title
    const extractSeasonInfo = (title: string): { base: string; season: number; part: number } => {
      const normalized = title.toLowerCase().replace(/[-_:]/g, ' ');
      let season = 1;
      let part = 0;
      
      // Match patterns like "Season 2", "S2", "2nd Season", "Part 2", etc.
      const seasonPatterns = [
        /season\s*(\d+)/i,
        /(\d+)(?:st|nd|rd|th)\s*season/i,
        /\b(\d+)\s*(?:season|cour)\b/i,
        /\bs(\d+)\b/i,
      ];
      
      const partPatterns = [
        /part\s*(\d+)/i,
        /cour\s*(\d+)/i,
      ];
      
      for (const pattern of seasonPatterns) {
        const match = normalized.match(pattern);
        if (match) {
          season = parseInt(match[1]) || 1;
          break;
        }
      }
      
      for (const pattern of partPatterns) {
        const match = normalized.match(pattern);
        if (match) {
          part = parseInt(match[1]) || 0;
          break;
        }
      }
      
      // Check for trailing number (e.g., "One Punch Man 3")
      if (season === 1) {
        const trailingNumberMatch = normalized.match(/\s(\d+)$/);
        if (trailingNumberMatch) {
          const trailingNum = parseInt(trailingNumberMatch[1]);
          if (trailingNum >= 2 && trailingNum <= 10) {
            season = trailingNum;
          }
        }
      }
      
      // Check for Roman numerals at end (e.g., "Mob Psycho 100 II")
      if (season === 1) {
        const romanMatch = normalized.match(/\s(ii|iii|iv|v|vi|vii|viii|ix|x)$/i);
        if (romanMatch) {
          season = romanNumerals[romanMatch[1].toLowerCase()] || 1;
        }
      }
      
      // Remove season/part info for base comparison
      const base = normalized
        .replace(/season\s*\d+/gi, '')
        .replace(/\bs\d+\b/gi, '')
        .replace(/\d+(?:st|nd|rd|th)\s*season/gi, '')
        .replace(/part\s*\d+/gi, '')
        .replace(/cour\s*\d+/gi, '')
        .replace(/\s+\d+$/g, '')
        .replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return { base, season, part };
    };
    
    // Words that indicate extra content (movies, specials, etc.)
    const extraContentWords = new Set([
      'movie', 'movies', 'film', 'films', 'special', 'specials', 
      'ova', 'ovas', 'oad', 'ona', 'recap', 'summary', 'commemorative',
      'prologue', 'epilogue', 'side', 'story', 'arc', 'chapter'
    ]);
    
    // Process primary title
    const targetInfo = extractSeasonInfo(targetTitle);
    const targetNormalized = normalize(targetTitle);
    const targetWords = getWords(targetTitle);
    const targetHasExtraContent = targetWords.some(w => extraContentWords.has(w));
    
    // Process alternative title if provided
    const altInfo = alternativeTitle ? extractSeasonInfo(alternativeTitle) : null;
    const altNormalized = alternativeTitle ? normalize(alternativeTitle) : null;
    const altWords = alternativeTitle ? getWords(alternativeTitle) : [];
    
    console.log('[findBestMatch] Target:', targetTitle);
    console.log('[findBestMatch] Target info:', targetInfo, 'words:', targetWords);
    if (alternativeTitle) {
      console.log('[findBestMatch] Alt title:', alternativeTitle, 'words:', altWords);
    }
    
    // Score each result
    const scored = searchResults.map(result => {
      const resultInfo = extractSeasonInfo(result.name);
      const resultNormalized = normalize(result.name);
      const resultWords = getWords(result.name);
      let score = 0;
      
      // === EXACT MATCH BONUS (check both titles) ===
      if (resultNormalized === targetNormalized) {
        score += 1000;
      } else if (altNormalized && resultNormalized === altNormalized) {
        score += 1000;
      }
      
      // === WORD MATCHING ===
      // Count how many target words appear in result
      const matchingWords = targetWords.filter(w => resultWords.includes(w));
      let wordMatchRatio = matchingWords.length / targetWords.length;
      
      // Also check alternative title words
      if (altWords.length > 0) {
        const altMatchingWords = altWords.filter(w => resultWords.includes(w));
        const altWordMatchRatio = altMatchingWords.length / altWords.length;
        // Use the better match ratio
        wordMatchRatio = Math.max(wordMatchRatio, altWordMatchRatio);
      }
      
      // High bonus for matching all target words
      if (wordMatchRatio === 1) {
        score += 400;
      } else if (wordMatchRatio >= 0.8) {
        score += 300;
      } else if (wordMatchRatio >= 0.5) {
        score += 150;
      } else if (wordMatchRatio < 0.3) {
        // Penalize if very few words match - likely wrong anime
        score -= 200;
      }
      
      // === BASE TITLE MATCHING (check both titles) ===
      let baseMatchScore = 0;
      
      // Check against primary title
      if (resultInfo.base === targetInfo.base) {
        baseMatchScore = 400;
      } else if (resultInfo.base.includes(targetInfo.base)) {
        baseMatchScore = 250;
      } else if (targetInfo.base.includes(resultInfo.base)) {
        baseMatchScore = 150;
      }
      
      // Check against alternative title and use better score
      if (altInfo) {
        let altBaseScore = 0;
        if (resultInfo.base === altInfo.base) {
          altBaseScore = 400;
        } else if (resultInfo.base.includes(altInfo.base)) {
          altBaseScore = 250;
        } else if (altInfo.base.includes(resultInfo.base)) {
          altBaseScore = 150;
        }
        baseMatchScore = Math.max(baseMatchScore, altBaseScore);
      }
      
      score += baseMatchScore;
      
      // === SEASON MATCHING (use target or alt season) ===
      const targetSeason = targetInfo.season;
      const altSeason = altInfo?.season || targetSeason;
      // Use the season that matches better
      const seasonDiffFromTarget = Math.abs(resultInfo.season - targetSeason);
      const seasonDiffFromAlt = Math.abs(resultInfo.season - altSeason);
      const bestSeasonDiff = Math.min(seasonDiffFromTarget, seasonDiffFromAlt);
      
      if (bestSeasonDiff === 0) {
        score += 300;
      } else {
        // Penalize wrong season heavily
        score -= bestSeasonDiff * 200;
      }
      
      // === PART MATCHING ===
      if (resultInfo.part === targetInfo.part) {
        score += 50;
      } else if (resultInfo.part !== 0 || targetInfo.part !== 0) {
        score -= Math.abs(resultInfo.part - targetInfo.part) * 50;
      }
      
      // === EPISODE COUNT ===
      if (expectedEpisodes && result.episodes) {
        const resultEps = result.episodes.sub || result.episodes.dub || 0;
        if (resultEps === expectedEpisodes) {
          score += 100;
        } else if (Math.abs(resultEps - expectedEpisodes) <= 2) {
          score += 50;
        }
      }
      
      // Prefer results with more episodes (main series over movies)
      if (result.episodes) {
        const episodeCount = result.episodes.sub || result.episodes.dub || 0;
        score += Math.min(Math.log10(episodeCount + 1) * 60, 180);
      }
      
      // === EXTRA CONTENT PENALTY ===
      // Penalize movies/specials/OVAs when target doesn't have these words
      const resultHasExtraContent = resultWords.some(w => extraContentWords.has(w));
      if (resultHasExtraContent && !targetHasExtraContent) {
        score -= 350;
      }
      
      // === LENGTH PENALTY ===
      // If result has many more words than target (and extra content), it's likely a variant
      const extraWords = resultWords.length - targetWords.length;
      if (extraWords > 3 && resultHasExtraContent) {
        score -= extraWords * 20;
      }
      
      console.log(`[findBestMatch] "${result.name}" -> words:${matchingWords.length}/${targetWords.length}, season:${resultInfo.season}, score:${score}`);
      
      return { result, score, resultInfo };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    const bestMatch = scored[0]?.result || searchResults[0];
    console.log('[findBestMatch] Selected:', bestMatch?.name, bestMatch?.id);
    
    // Return the best match
    return bestMatch;
  }

  /**
   * Get all episodes for an anime
   * 
   * @param animeId - The unique anime ID (e.g., "steinsgate-3")
   * @returns Array of episodes
   * 
   * Server: action=episodes&id={animeId}
   */
  async getEpisodes(animeId: string): Promise<EpisodeInfo[]> {
    interface EpisodesResponse {
      totalEpisodes: number;
      episodes: AniwatchEpisode[];
    }

    const data = await this.fetchAction<EpisodesResponse>('episodes', {
      id: animeId,
    });
    
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
   * @param category - Audio category: 'sub' or 'dub' (default: 'sub')
   * @param server - Server name (server tries all servers internally, this is a hint)
   * @returns Streaming data with sources, headers, and tracks (subtitles)
   * 
   * Server: action=sources&episodeId={episodeId}&server={server}&category={category}
   */
  async getStreamingSources(
    episodeId: string,
    category: 'sub' | 'dub' = 'sub',
    server: string = 'streamtape'
  ): Promise<AniwatchStreamingData | null> {
    
    // Small delay to avoid hammering local scraper (only if rapid-fire requests)
    if (this.lastRequestTime > 0) {
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      const minDelay = 100; // 100ms between requests (local server is fast)
      if (timeSinceLastRequest < minDelay) {
        const waitTime = minDelay - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    this.lastRequestTime = Date.now();
    
    // Server now handles multi-server fallback internally:
    // It tries streamtape → streamsb → hd-1 → hd-2 automatically.
    // Non-MegaCloud servers (streamtape/streamsb) use different CDNs
    // that work from datacenter IPs and don't block Brave browser.
    // hd-1/hd-2 both use MegaCloud CDN (blocks datacenter IPs + Brave).
    // Just make one call — server handles all fallback logic.
    try {
      const data = await this.fetchAction<AniwatchStreamingData>('sources', {
        episodeId,
        server,
        category,
      }, 2 * 60 * 1000); // Cache streaming sources for 2 minutes
      
      if (data && data.sources && data.sources.length > 0) {
        // Normalize: API may return tracks or subtitles
        if (!data.tracks && (data as any).subtitles) {
          data.tracks = (data as any).subtitles;
        }
        return data;
      }
    } catch {
      // Server failed after trying all servers internally
    }
    
    return null;
  }

  /**
   * Get all available servers for an episode
   * 
   * @param episodeId - The episode ID
   * @returns Available servers for sub, dub, and raw
   * 
   * Server: action=servers&episodeId={episodeId}
   */
  async getEpisodeServers(episodeId: string): Promise<{
    sub: Array<{ serverId: number; serverName: string }>;
    dub: Array<{ serverId: number; serverName: string }>;
    raw: Array<{ serverId: number; serverName: string }>;
  } | null> {
    interface ServersResponse {
      episodeId: string;
      episodeNo: number;
      sub: Array<{ serverId: number; serverName: string }>;
      dub: Array<{ serverId: number; serverName: string }>;
      raw: Array<{ serverId: number; serverName: string }>;
    }

    const data = await this.fetchAction<ServersResponse>('servers', {
      episodeId,
    });
    
    if (!data) {
      return null;
    }
    
    return {
      sub: data.sub || [],
      dub: data.dub || [],
      raw: data.raw || [],
    };
  }

  /**
   * Convert Aniwatch streaming data to VideoSource format used by the player
   */
  convertToVideoSources(streamingData: AniwatchStreamingData): VideoSource[] {
    const tracks = streamingData.tracks || streamingData.subtitles || [];
    return streamingData.sources.map((source) => ({
      url: source.url,
      directUrl: source.url,
      embedUrl: streamingData.embedURL || undefined,
      quality: source.quality || 'auto',
      type: source.isM3U8 ? 'hls' : 'mp4',
      isM3U8: source.isM3U8,
      headers: streamingData.headers,
      tracks,
      intro: streamingData.intro,
      outro: streamingData.outro,
    }));
  }

  /**
   * Main method: Get streaming data for an episode by anime title and episode number
   * This is the primary method used by the video player
   * 
   * @param animeTitle - The title of the anime
   * @param episodeNumber - The episode number
   * @param category - Audio category: 'sub' or 'dub'
   * @param expectedEpisodes - Expected total episode count (for better matching)
   * @returns Array of video sources ready for the player
   */
  async getStreamingDataForEpisode(
    animeTitle: string,
    episodeNumber: number,
    category: 'sub' | 'dub' = 'sub',
    expectedEpisodes?: number
  ): Promise<VideoSource[]> {
    try {
      // Step 1: Search for the anime
      const searchResults = await this.searchAnime(animeTitle);
      
      if (searchResults.length === 0) {
        return [];
      }

      // Use smart matching to find the correct anime
      const anime = this.findBestMatch(searchResults, animeTitle, expectedEpisodes);
      
      if (!anime) {
        return [];
      }

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
   * Test API connectivity — tries the home endpoint first (fast), falls back to search
   */
  async testConnection(): Promise<boolean> {
    try {
      const home = await this.fetchAction<{ spotlightAnimes?: unknown[] }>('home');
      if (home && home.spotlightAnimes) return true;
      // Fallback to search
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
  category?: 'sub' | 'dub'
) => aniwatchApi.getStreamingDataForEpisode(animeTitle, episodeNumber, category);

/**
 * Get streaming sources by episode ID
 */
export const getStreamingSources = (
  episodeId: string,
  category?: 'sub' | 'dub',
  server?: string
) => aniwatchApi.getStreamingSources(episodeId, category, server);

/**
 * Get available servers for an episode
 */
export const getEpisodeServers = (episodeId: string) =>
  aniwatchApi.getEpisodeServers(episodeId);
