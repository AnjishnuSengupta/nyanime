/**
 * Aniwatch API Service — Frontend client
 * 
 * Calls server-side API routes that adapt Consumet providers.
 * No direct frontend scraper calls are used.
 * 
 * Server routes:
 *   - Vercel:     /api/aniwatch?action=...
 *   - Render:     /aniwatch?action=...
 *   - Cloudflare: /aniwatch?action=...
 *   - Dev (Vite): /aniwatch?action=... (proxied by Vite dev server)
 * 
 * Any fallback behavior is handled server-side only.
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
const DEBUG_MATCHING = import.meta.env.DEV && import.meta.env.VITE_DEBUG_ANIWATCH_MATCHING === '1';

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

  delete(key: string): void {
    this.cache.delete(key);
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

  private normalizeSearchTerm(value: string): string {
    return value
      .toLowerCase()
      .replace(/\./g, ' ')
      .replace(/[:\-_/]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private scoreSearchResult(result: AniwatchSearchResult, query: string): number {
    const target = this.normalizeSearchTerm(query);
    if (!target) return 0;

    const title = this.normalizeSearchTerm(result.name || '');
    if (!title) return 0;

    const queryTokens = target.split(' ').filter((token) => token.length >= 2);
    const titleTokens = new Set(title.split(' ').filter((token) => token.length >= 2));

    let score = 0;
    if (title === target) score += 250;
    if (title.startsWith(target)) score += 140;
    if (title.includes(target)) score += 90;

    if (queryTokens.length > 0) {
      const overlap = queryTokens.reduce((count, token) => count + (titleTokens.has(token) ? 1 : 0), 0);
      const overlapRatio = overlap / queryTokens.length;
      score += Math.round(overlapRatio * 120);
      if (overlap === queryTokens.length) score += 80;
    }

    const subEpisodes = Number(result.episodes?.sub || 0);
    if (Number.isFinite(subEpisodes) && subEpisodes > 0) score += Math.min(20, subEpisodes / 8);

    return score;
  }

  private rankSearchResults(results: AniwatchSearchResult[], query: string): AniwatchSearchResult[] {
    return [...results]
      .map((item) => ({ item, score: this.scoreSearchResult(item, query) }))
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

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
    * Server handles Consumet provider routing and fallback automatically.
   */
  private async fetchAction<T>(
    action: string,
    params: Record<string, string> = {},
    cacheDuration: number = CACHE_DURATION,
    externalSignal?: AbortSignal
  ): Promise<T | null> {
    const cacheKey = `${action}:${JSON.stringify(params)}`;

    // Check cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    // If caller already aborted, bail immediately
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
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
        const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);
        
        // If caller provides an external abort signal, forward it
        const onExternalAbort = () => { controller.abort(); };
        externalSignal?.addEventListener('abort', onExternalAbort);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
          externalSignal?.removeEventListener('abort', onExternalAbort);
        });
        
        // clearTimeout(timeoutId);
        // externalSignal?.removeEventListener('abort', onExternalAbort);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[aniwatch] ${action} HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries}):`, errorText);
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
          const errorMsg = json?.error || JSON.stringify(json);
          console.error(`[aniwatch] ${action} returned error (attempt ${attempt + 1}/${maxRetries}):`, errorMsg);
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          return null;
        }
        
        this.cache.set(cacheKey, data, cacheDuration);
        return data;
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        // If caller aborted (episode changed), re-throw so caller can handle
        if (isAbort && externalSignal?.aborted) {
          throw error;
        }
        console.error(`[aniwatch] ${action} request ${isAbort ? 'timed out' : 'failed'} (attempt ${attempt + 1}/${maxRetries}):`, error);
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
    const combinedResults: AniwatchSearchResult[] = [];
    const seenIds = new Set<string>();

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

    let rawResults = Array.isArray(data?.animes) ? data.animes : [];

    // Retry once with normalized query for punctuation-heavy titles (e.g. "Dr. Stone").
    if (rawResults.length === 0) {
      const normalizedQuery = this.normalizeSearchTerm(title);
      if (normalizedQuery && normalizedQuery !== title.trim().toLowerCase()) {
        const fallback = await this.fetchAction<SearchResponse>('search', {
          q: normalizedQuery,
          page: String(page),
        });
        rawResults = Array.isArray(fallback?.animes) ? fallback.animes : [];
      }
    }

    if (rawResults.length === 0) return combinedResults;

    const rankedResults = this.rankSearchResults(rawResults, title);

    for (const item of rankedResults) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      combinedResults.push(item);
    }

    return combinedResults;
  }

  private buildSearchVariants(title: string): string[] {
    const trimmed = title.trim();
    const variants = new Set<string>([trimmed]);

    const debracketed = trimmed.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (debracketed) variants.add(debracketed);

    const dePunctuated = debracketed
      .replace(/[:\-_/]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (dePunctuated) variants.add(dePunctuated);

    const colonBase = trimmed.split(':')[0]?.trim();
    if (colonBase && colonBase.length >= 3) variants.add(colonBase);

    const dashBase = trimmed.split(' - ')[0]?.trim();
    if (dashBase && dashBase.length >= 3) variants.add(dashBase);

    // Remove common movie/special suffixes to recover main series entries.
    const strippedSuffix = dePunctuated
      .replace(/\b(zenpen|kouhen|movie|film|special|ova|oad|ona|part\s*\d+|cour\s*\d+)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (strippedSuffix && strippedSuffix.length >= 3) variants.add(strippedSuffix);

    return Array.from(variants).filter((q) => q.length >= 2).slice(0, 6);
  }

  private async searchAnimeWithVariants(title: string): Promise<AniwatchSearchResult[]> {
    const queries = this.buildSearchVariants(title);
    const merged: AniwatchSearchResult[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const pageOne = await this.searchAnime(query, 1);
      for (const item of pageOne) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
      }

      // Pull page 2 for the most promising variants when result set is still thin.
      if (merged.length < 12 && i < 2) {
        const pageTwo = await this.searchAnime(query, 2);
        for (const item of pageTwo) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          merged.push(item);
        }
      }
    }

    return merged;
  }

  private hasEnglishSubtitle(videoSources: VideoSource[]): boolean {
    return videoSources.some((source) =>
      (source.tracks || []).some((track) => {
        const lang = String(track?.lang || '').toLowerCase();
        return lang === 'en' || lang === 'eng' || lang.includes('english');
      }),
    );
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
    const extractSeasonInfo = (title: string): { base: string; season: number; part: number; seasonExplicit: boolean; partExplicit: boolean } => {
      const normalized = title.toLowerCase().replace(/[-_:]/g, ' ');
      let season = 1;
      let part = 0;
      let seasonExplicit = false;
      let partExplicit = false;
      
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
          seasonExplicit = true;
          break;
        }
      }
      
      for (const pattern of partPatterns) {
        const match = normalized.match(pattern);
        if (match) {
          part = parseInt(match[1]) || 0;
          partExplicit = true;
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
            seasonExplicit = true;
          }
        }
      }
      
      // Check for Roman numerals at end (e.g., "Mob Psycho 100 II")
      if (season === 1) {
        const romanMatch = normalized.match(/\s(ii|iii|iv|v|vi|vii|viii|ix|x)$/i);
        if (romanMatch) {
          season = romanNumerals[romanMatch[1].toLowerCase()] || 1;
          seasonExplicit = true;
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
      
      return { base, season, part, seasonExplicit, partExplicit };
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
    
    if (DEBUG_MATCHING) {
      console.log('[findBestMatch] Target:', targetTitle);
      console.log('[findBestMatch] Target info:', targetInfo, 'words:', targetWords);
    }
    if (alternativeTitle) {
      if (DEBUG_MATCHING) {
        console.log('[findBestMatch] Alt title:', alternativeTitle, 'words:', altWords);
      }
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
      
      // === SEASON MATCHING ===
      // Prefer explicit season hints to avoid selecting season 1 for season 2/3 titles.
      const hasTargetSeasonHint = targetInfo.seasonExplicit;
      const hasAltSeasonHint = Boolean(altInfo?.seasonExplicit);

      if (hasTargetSeasonHint || hasAltSeasonHint) {
        let preferredSeason = targetInfo.season;
        if (hasAltSeasonHint && (!hasTargetSeasonHint || (altInfo && altInfo.season !== targetInfo.season))) {
          preferredSeason = altInfo?.season || targetInfo.season;
        }

        const seasonDiff = Math.abs(resultInfo.season - preferredSeason);
        if (seasonDiff === 0) {
          score += 360;
        } else {
          // Strong penalty for explicit season mismatches.
          score -= 520 + (seasonDiff * 160);
        }
      } else {
        // No explicit season markers: keep only a tiny preference.
        if (resultInfo.season === 1) {
          score += 30;
        }
      }
      
      // === PART MATCHING ===
      if (resultInfo.part === targetInfo.part) {
        score += 50;
      } else if (resultInfo.part !== 0 || targetInfo.partExplicit || targetInfo.part !== 0) {
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

      if (DEBUG_MATCHING) {
        console.log(`[findBestMatch] "${result.name}" -> words:${matchingWords.length}/${targetWords.length}, season:${resultInfo.season}, score:${score}`);
      }
      
      return { result, score, resultInfo };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    const bestMatch = scored[0]?.result || searchResults[0];
    if (DEBUG_MATCHING) {
      console.log('[findBestMatch] Selected:', bestMatch?.name, bestMatch?.id);
    }
    
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
    server: string = 'hd-2',
    bustCache: boolean = false,
    signal?: AbortSignal
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
    
    // If busting cache, clear existing cached sources for this episode
    if (bustCache) {
      const cacheKey = `sources:${JSON.stringify({ episodeId, server, category })}`;
      this.cache.delete(cacheKey);
    }
    
    // Server now handles multi-server fallback internally:
    // It tries streamtape → streamsb → hd-2 → hd-1 automatically.
    // Non-MegaCloud servers (streamtape/streamsb) are preferred but rarely available.
    // hd-2 (MegaF/netmagcdn) is more reliable than hd-1 (MegaCloud rotating domains).
    // hd-1 (MegaCloud) is tried LAST as it uses ads and rotating CDN domains.
    // Just make one call — server handles all fallback logic.
    try {
      const data = await this.fetchAction<AniwatchStreamingData>('sources', {
        episodeId,
        server,
        category,
      }, 60 * 1000, signal); // Cache streaming sources for 60s (CDN tokens expire quickly)
      
      if (data && data.sources && data.sources.length > 0) {
        // Normalize: API may return tracks or subtitles
        const dataWithSubtitles = data as AniwatchStreamingData & { subtitles?: AniwatchTrack[] };
        if (!data.tracks && dataWithSubtitles.subtitles) {
          data.tracks = dataWithSubtitles.subtitles;
        }
        return data;
      }
    } catch (err) {
      // Re-throw AbortError so caller can detect episode change
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
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
    sub: Array<{ serverId: number; serverName: string; linkId?: string }>;
    dub: Array<{ serverId: number; serverName: string; linkId?: string }>;
    raw: Array<{ serverId: number; serverName: string; linkId?: string }>;
  } | null> {
    interface ServersResponse {
      episodeId: string;
      episodeNo: number;
      sub: Array<{ serverId: number; serverName: string; linkId?: string }>;
      dub: Array<{ serverId: number; serverName: string; linkId?: string }>;
      raw: Array<{ serverId: number; serverName: string; linkId?: string }>;
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
    const sanitizeMediaUrl = (value: string): string => {
      let url = String(value || '').trim().replace(/^['"]|['"]$/g, '');
      const replaceIdx = url.indexOf('.replace(');
      if (replaceIdx > 0) {
        url = url.slice(0, replaceIdx);
      }
      try {
        return new URL(url).toString();
      } catch {
        return '';
      }
    };

    const tracks = (streamingData.tracks || streamingData.subtitles || [])
      .map((track) => ({
        ...track,
        url: sanitizeMediaUrl(track.url),
      }))
      .filter((track) => Boolean(track.url));

    return streamingData.sources
      .map((source) => {
      const cleanedUrl = sanitizeMediaUrl(source.url);
      return {
      url: cleanedUrl,
      directUrl: cleanedUrl,
      embedUrl: streamingData.embedURL || undefined,
      quality: source.quality || 'auto',
      type: source.isM3U8 || cleanedUrl.includes('.m3u8') ? 'hls' : 'mp4',
      isM3U8: source.isM3U8 || cleanedUrl.includes('.m3u8'),
      headers: streamingData.headers,
      tracks,
      intro: streamingData.intro,
      outro: streamingData.outro,
    };
    })
      .filter((source) => Boolean(source.url));
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
      // Step 1: Search with multiple normalized title variants.
      const searchResults = await this.searchAnimeWithVariants(animeTitle);
      
      if (searchResults.length === 0) {
        return [];
      }

      // Use smart matching first, but keep fallback candidates for season/part mismatches.
      const bestMatch = this.findBestMatch(searchResults, animeTitle, expectedEpisodes);
      const candidates = [
        ...(bestMatch ? [bestMatch] : []),
        ...searchResults.filter((item) => item.id !== bestMatch?.id),
      ].slice(0, 8);

      let fallbackWithoutEnglish: VideoSource[] = [];

      // Step 2+: Try several ranked candidates until we resolve episode + sources.
      for (const anime of candidates) {
        const episodes = await this.getEpisodes(anime.id);
        if (episodes.length === 0) continue;

        // For movies/specials providers may expose a single entry even when episodeNumber is 1.
        const targetEpisode = episodes.find((ep) => ep.number === episodeNumber)
          || (episodeNumber === 1 && episodes.length === 1 ? episodes[0] : undefined);
        if (!targetEpisode) continue;

        const streamingData = await this.getStreamingSources(targetEpisode.episodeId, category);
        if (!streamingData) continue;

        const videoSources = this.convertToVideoSources(streamingData);
        if (!videoSources.length) continue;

        if (this.hasEnglishSubtitle(videoSources)) {
          return videoSources;
        }

        // Keep the first working non-English source as a fallback if nothing better is found.
        if (!fallbackWithoutEnglish.length) {
          fallbackWithoutEnglish = videoSources;
        }
      }

      return fallbackWithoutEnglish;

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
  server?: string,
  bustCache?: boolean,
  signal?: AbortSignal
) => aniwatchApi.getStreamingSources(episodeId, category, server, bustCache, signal);

/**
 * Get available servers for an episode
 */
export const getEpisodeServers = (episodeId: string) =>
  aniwatchApi.getEpisodeServers(episodeId);
