
// Anime Service - Handles all API calls to the Jikan API (MyAnimeList unofficial API)

export interface JikanAnimeResponse {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
}

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  synopsis: string;
  status: string;
  genres: { mal_id: number; name: string; type: string }[];
  studios?: { mal_id: number; name: string; type: string }[];
  score: number;
  year: number;
  episodes: number;
  aired: {
    from: string;
    to: string;
  };
  trailer?: {
    youtube_id?: string;
    url?: string;
  };
}

export interface AnimeData {
  id: number;
  title: string;
  title_japanese?: string;
  image: string;
  category: string;
  rating: string;
  year: string;
  episodes?: number;
  similarAnime?: AnimeData[];
  synopsis?: string;
  trailerId?: string;
  studios?: string;
  // Add missing properties used in VideoPage.tsx
  type?: string;
  status?: string;
  title_english?: string; // Added for VideoPage.tsx
  duration?: string;      // Added for VideoPage.tsx
  airing?: boolean;       // Added to indicate if anime is still airing
  airingEpisodes?: number; // Number of currently aired episodes
  airedFrom?: string;     // ISO date string for when the anime started airing
}

const API_BASE_URL = "https://api.jikan.moe/v4";
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const RATE_LIMIT_DELAY = 250; // Keep queue responsive while still spacing requests
const MAX_LIMIT = 25; // Maximum limit allowed by Jikan API (lowered from 100 to 25)
const API_RATE_LIMIT = Number(import.meta.env.VITE_API_RATE_LIMIT) || 60; // Default to 60 requests per minute

const SEARCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'for', 'from', 'at', 'by',
  'season', 'part', 'episode', 'movie', 'film', 'special', 'ova', 'oad', 'ona',
]);

const SEARCH_TOKEN_SYNONYMS: Record<string, string[]> = {
  noble: ['kizoku'],
  reincarnation: ['tensei'],
  doctor: ['dr'],
  dr: ['doctor'],
  demon: ['maou'],
  king: ['ou'],
};

// Request queue for rate limiting
const requestQueue: (() => Promise<unknown>)[] = [];
let isProcessingQueue = false;
let requestsThisMinute = 0;
let rateWindowStart = Date.now();

// Process the request queue with rate limiting
const processRequestQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  // Reset the rate counter if a minute has passed
  const now = Date.now();
  if (now - rateWindowStart > 60000) {
    requestsThisMinute = 0;
    rateWindowStart = now;
  }
  
  // If we've reached the rate limit, wait until the next minute
  if (requestsThisMinute >= API_RATE_LIMIT) {
    const timeToWait = 60000 - (now - rateWindowStart);
    await new Promise(resolve => setTimeout(resolve, timeToWait > 0 ? timeToWait : 1000));
    
    // Reset the rate counter
    requestsThisMinute = 0;
    rateWindowStart = Date.now();
  }
  
  try {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      requestsThisMinute++;
      await nextRequest();
    }
  } catch (error) {
    console.error("Error processing request from queue:", error);
  } finally {
    isProcessingQueue = false;
    
    // Process next request after a small delay
    setTimeout(() => {
      processRequestQueue();
    }, RATE_LIMIT_DELAY);
  }
};

// Enqueue a request to be executed with rate limiting
const enqueueRequest = <T>(requestFn: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    processRequestQueue();
  });
};

// Helper to make rate-limited API requests
const fetchWithRateLimit = <T>(url: string): Promise<T> => {
  return enqueueRequest(async () => {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(url);

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
        const backoffMs = retryAfterMs > 0 ? retryAfterMs : 1000 * (attempt + 1);

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new Error('Rate limit exceeded');
      }

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      return response.json();
    }

    throw new Error('API request failed after retries');
  });
};

const normalizeSearchText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[:\-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenizeSearchText = (value: string): string[] => {
  return normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
};

const expandSearchTokens = (tokens: string[]): string[] => {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const synonym of SEARCH_TOKEN_SYNONYMS[token] || []) {
      expanded.add(synonym);
    }
  }
  return Array.from(expanded);
};

const buildSearchQueryVariants = (query: string): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  const normalized = normalizeSearchText(trimmed);
  if (normalized) variants.add(normalized);

  const debracketed = trimmed
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (debracketed) variants.add(debracketed);

  const colonBase = trimmed.split(':')[0]?.trim();
  if (colonBase && colonBase.length >= 3) variants.add(colonBase);

  const dashBase = trimmed.split(' - ')[0]?.trim();
  if (dashBase && dashBase.length >= 3) variants.add(dashBase);

  const strippedSuffix = normalized
    .replace(/\b(season\s*\d+|part\s*\d+|movie|film|special|ova|oad|ona|cour\s*\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (strippedSuffix && strippedSuffix.length >= 3) variants.add(strippedSuffix);

  return Array.from(variants).slice(0, 5);
};

const scoreAnimeSearchMatch = (anime: AnimeData, query: string): number => {
  const qNorm = normalizeSearchText(query);
  if (!qNorm) return 0;

  const primary = normalizeSearchText(anime.title || '');
  const english = normalizeSearchText(anime.title_english || '');
  const japanese = normalizeSearchText(anime.title_japanese || '');
  const combined = `${primary} ${english} ${japanese}`.trim();

  const queryTokens = expandSearchTokens(tokenizeSearchText(query));
  const titleTokens = new Set(expandSearchTokens(tokenizeSearchText(`${anime.title || ''} ${anime.title_english || ''} ${anime.title_japanese || ''}`)));

  let score = 0;

  if (primary === qNorm || english === qNorm || japanese === qNorm) score += 250;
  if (primary.startsWith(qNorm) || english.startsWith(qNorm) || japanese.startsWith(qNorm)) score += 150;
  if (primary.includes(qNorm) || english.includes(qNorm) || japanese.includes(qNorm)) score += 100;
  if (combined.includes(qNorm)) score += 70;

  if (queryTokens.length > 0) {
    let overlap = 0;
    for (const token of queryTokens) {
      if (titleTokens.has(token)) overlap += 1;
    }
    const overlapRatio = overlap / queryTokens.length;
    score += Math.round(overlapRatio * 120);

    const allTokensPresent = queryTokens.every((token) => titleTokens.has(token));
    if (allTokensPresent) score += 80;
  }

  const rating = Number(anime.rating);
  if (Number.isFinite(rating)) {
    score += Math.round(rating * 2);
  }

  // Give a slight preference to newer entries only when title confidence ties.
  const year = Number(anime.year);
  if (Number.isFinite(year)) {
    score += Math.max(0, Math.min(8, year - 2010));
  }

  return score;
};

const rerankAnimeResults = (animes: AnimeData[], query?: string): AnimeData[] => {
  if (!query || !query.trim()) return animes;

  const scored = animes.map((anime) => ({ anime, score: scoreAnimeSearchMatch(anime, query) }));
  scored.sort((a, b) => b.score - a.score);

  // Keep broad results but prioritize matches strongly.
  return scored.map((item) => item.anime);
};


// Helper to format API data to our app format
const formatAnimeData = (anime: JikanAnime): AnimeData => {
  // Determine airing status directly from Jikan API data (no overrides)
  const airing = anime.status === "Currently Airing";
  const effectiveEpisodes = anime.episodes;
  const effectiveStatus = anime.status;
  
  // For airing anime, calculate how many episodes have aired
  // For long-running anime like One Piece, episodes might be null
  let airingEpisodes: number | undefined = effectiveEpisodes || undefined;
  
  if (airing) {
    const startDate = anime.aired?.from ? new Date(anime.aired.from) : null;
    if (startDate) {
      const now = new Date();
      const weeksSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      // Most anime release 1 episode per week
      if (anime.episodes) {
        // Anime with known total: cap at total
        airingEpisodes = Math.min(weeksSinceStart + 1, anime.episodes);
      } else {
        // Long-running anime with unknown total (e.g. One Piece):
        // Don't estimate from weeks — shows have hiatuses that make the calculation wrong.
        // Let the actual episode list from the streaming API be the source of truth.
        airingEpisodes = undefined;
      }
    } else if (!anime.episodes) {
      // No start date and no episode count - set to undefined so we use API count
      airingEpisodes = undefined;
    }
  }
  
  return {
    id: anime.mal_id,
    title: anime.title,
    title_japanese: anime.title_japanese || undefined,
    image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '/placeholder.svg',
    category: anime.genres ? anime.genres.map(genre => genre.name).join(", ") : "Unknown",
    rating: anime.score ? anime.score.toString() : "N/A",
    year: anime.year ? anime.year.toString() : "Unknown",
    episodes: effectiveEpisodes || undefined,
    synopsis: anime.synopsis,
    trailerId: anime.trailer?.youtube_id,
    studios: anime.studios ? anime.studios.map(studio => studio.name).join(", ") : "Unknown",
    duration: "24:00", // Default duration if not available
    title_english: anime.title_english || anime.title, // Use English title from API, fallback to regular title
    status: effectiveStatus,
    type: (effectiveEpisodes ?? anime.episodes) === 1 ? "Movie" : "TV",
    airing: airing,
    airingEpisodes: airingEpisodes,
    airedFrom: anime.aired?.from || undefined
  };
};

// Find trailer for anime using YouTube API if not provided by Jikan
const findAnimeTrailer = async (animeTitle: string): Promise<string | undefined> => {
  if (!YOUTUBE_API_KEY) return undefined;
  
  try {
    const searchQuery = encodeURIComponent(`${animeTitle} anime official trailer`);
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`YouTube API responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].id.videoId;
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching trailer from YouTube:", error);
    return undefined;
  }
};

// Fetch trending/popular anime
export const fetchTrendingAnime = async (): Promise<AnimeData[]> => {
  try {
    const data = await fetchWithRateLimit<JikanAnimeResponse>(
      `${API_BASE_URL}/top/anime?filter=airing&limit=${MAX_LIMIT}`
    );
    return data.data.map(formatAnimeData);
  } catch (error) {
    console.error("Error fetching trending anime:", error);
    return [];
  }
};

// Fetch popular anime of all time
export const fetchPopularAnime = async (): Promise<AnimeData[]> => {
  try {
    const data = await fetchWithRateLimit<JikanAnimeResponse>(
      `${API_BASE_URL}/top/anime?filter=bypopularity&limit=${MAX_LIMIT}`
    );
    return data.data.map(formatAnimeData);
  } catch (error) {
    console.error("Error fetching popular anime:", error);
    return [];
  }
};

// Fetch seasonal anime (current season)
export const fetchSeasonalAnime = async (): Promise<AnimeData[]> => {
  try {
    const data = await fetchWithRateLimit<JikanAnimeResponse>(
      `${API_BASE_URL}/seasons/now?limit=${MAX_LIMIT}`
    );
    if (!data || !data.data) {
      throw new Error("Invalid data structure received from API");
    }
    return data.data.map(formatAnimeData);
  } catch (error) {
    console.error("Error fetching seasonal anime:", error);
    return [];
  }
};

// Search anime by title with multiple filters
// Genre name to MAL ID mapping
const GENRE_ID_MAP: Record<string, number> = {
  'action': 1,
  'adventure': 2,
  'comedy': 4,
  'drama': 8,
  'fantasy': 10,
  'horror': 14,
  'mystery': 7,
  'romance': 22,
  'sci-fi': 24,
  'slice of life': 36,
  'sports': 30,
  'supernatural': 37,
  'suspense': 41,
  'ecchi': 9,
  'mecha': 18,
  'music': 19,
  'psychological': 40,
  'school': 23,
  'shounen': 27,
  'shoujo': 25,
  'seinen': 42,
  'isekai': 62,
  'military': 38,
  'historical': 13,
  'martial arts': 17,
  'space': 29,
  'vampire': 32,
  'harem': 35,
  'parody': 20,
  'samurai': 21,
  'super power': 31,
};

export const searchAnime = async (
  query?: string,
  genre?: string,
  year?: string,
  status?: string,
  page: number = 1
): Promise<{ anime: AnimeData[], pagination: { hasNextPage: boolean, totalPages: number } }> => {
  try {
    const searchQueries = query ? buildSearchQueryVariants(query) : [''];
    const animeMap = new Map<number, AnimeData>();
    let hasNextPage = false;
    let totalPages = page;

    const buildUrl = (searchText: string, targetPage: number): string => {
      let url = `${API_BASE_URL}/anime?page=${targetPage}&limit=${MAX_LIMIT}&sfw=true`;

      if (searchText) {
        url += `&q=${encodeURIComponent(searchText)}`;
      }

      if (genre) {
        const genreTerms = genre
          .split(',')
          .map((term) => term.trim().toLowerCase())
          .filter(Boolean);

        const genreIds = genreTerms
          .map((term) => {
            const exact = GENRE_ID_MAP[term];
            if (exact) return exact;
            const matchedKey = Object.keys(GENRE_ID_MAP).find((key) => key.includes(term) || term.includes(key));
            return matchedKey ? GENRE_ID_MAP[matchedKey] : null;
          })
          .filter((id): id is number => id !== null);

        if (genreIds.length > 0) {
          url += `&genres=${Array.from(new Set(genreIds)).join(',')}`;
        }
      }

      if (year) url += `&start_date=${year}`;

      if (status) {
        const statusMap: Record<string, string> = {
          Airing: 'airing',
          Completed: 'complete',
          Upcoming: 'upcoming',
        };
        url += `&status=${statusMap[status] || status.toLowerCase()}`;
      }

      return url;
    };

    // Fast path: primary query, current page only.
    const primaryQuery = searchQueries[0] || '';
    const primaryData = await fetchWithRateLimit<JikanAnimeResponse>(buildUrl(primaryQuery, page));
    hasNextPage = Boolean(primaryData?.pagination?.has_next_page);
    totalPages = Number(primaryData?.pagination?.last_visible_page || page);
    for (const rawAnime of primaryData?.data || []) {
      const formatted = formatAnimeData(rawAnime);
      animeMap.set(formatted.id, formatted);
    }

    // Slow path only if results are weak and we have a meaningful query.
    const shouldExpand = Boolean(query && page === 1 && animeMap.size < 8);
    if (shouldExpand) {
      const fallbackQueries = searchQueries.slice(1, 3);
      for (const searchText of fallbackQueries) {
        const data = await fetchWithRateLimit<JikanAnimeResponse>(buildUrl(searchText, 1));
        hasNextPage = hasNextPage || Boolean(data?.pagination?.has_next_page);
        totalPages = Math.max(totalPages, Number(data?.pagination?.last_visible_page || page));
        for (const rawAnime of data?.data || []) {
          const formatted = formatAnimeData(rawAnime);
          animeMap.set(formatted.id, formatted);
        }
        if (animeMap.size >= 20) break;
      }

      // If still thin, pull one extra page from the primary query.
      if (animeMap.size < 10 && hasNextPage) {
        const pageTwo = await fetchWithRateLimit<JikanAnimeResponse>(buildUrl(primaryQuery, 2));
        for (const rawAnime of pageTwo?.data || []) {
          const formatted = formatAnimeData(rawAnime);
          animeMap.set(formatted.id, formatted);
        }
      }
    }

    const ranked = rerankAnimeResults(Array.from(animeMap.values()), query);

    return {
      anime: ranked,
      pagination: {
        hasNextPage,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error searching anime:", error);
    return { anime: [], pagination: { hasNextPage: false, totalPages: 0 } };
  }
};

// Get anime by ID
export const getAnimeById = async (id: number): Promise<AnimeData | null> => {
  try {
    const data = await fetchWithRateLimit<{data: JikanAnime}>(`${API_BASE_URL}/anime/${id}`);
    
    if (!data.data) return null;
    
    let animeData = formatAnimeData(data.data);
    
    // If no trailer ID is available from Jikan, try to find one using YouTube API
    if (!animeData.trailerId && YOUTUBE_API_KEY) {
      const youtubeTrailerId = await findAnimeTrailer(animeData.title);
      animeData = { ...animeData, trailerId: youtubeTrailerId };
    }
    
    // Get similar anime (recommendations)
    const similarAnime = await getSimilarAnime(id);
    
    return {
      ...animeData,
      similarAnime
    };
  } catch (error) {
    console.error(`Error fetching anime with ID ${id}:`, error);
    return null;
  }
};

// Get similar anime recommendations
export const getSimilarAnime = async (id: number): Promise<AnimeData[]> => {
  try {
    const data = await fetchWithRateLimit<{data: Array<{entry: unknown}>}>(`${API_BASE_URL}/anime/${id}/recommendations`);
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Safely extract and format the recommendations
    return data.data
      .slice(0, 5)
      .filter((rec: {entry?: unknown}) => rec && rec.entry)
      .map((rec: {entry: unknown}) => formatAnimeData(rec.entry as JikanAnime));
      
  } catch (error) {
    console.error(`Error fetching similar anime for ID ${id}:`, error);
    return [];
  }
};

// Get genres list
export const fetchGenres = async (): Promise<string[]> => {
  try {
    const data = await fetchWithRateLimit<{data: {name: string}[]}>(`${API_BASE_URL}/genres/anime`);
    
    if (!data.data) return [];
    
    return data.data.map((genre: {name: string}) => genre.name);
  } catch (error) {
    console.error("Error fetching genres:", error);
    return [];
  }
};
