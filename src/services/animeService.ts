
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
const RATE_LIMIT_DELAY = 1000; // Jikan API has rate limit, delay requests by 1 second
const MAX_LIMIT = 25; // Maximum limit allowed by Jikan API (lowered from 100 to 25)
const API_RATE_LIMIT = Number(import.meta.env.VITE_API_RATE_LIMIT) || 60; // Default to 60 requests per minute

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
    const response = await fetch(url);
    
    if (response.status === 429) {
      // We hit the rate limit, wait and retry
      throw new Error("Rate limit exceeded");
    }
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    return response.json();
  });
};

// Helper to format API data to our app format
const formatAnimeData = (anime: JikanAnime): AnimeData => {
  // === Special overrides for specific anime ===
  // One Piece (MAL ID 21): original run ended at episode 1155, 
  // but Jikan may still report it as "Currently Airing"
  const OVERRIDES: Record<number, { status: string; episodes: number; airing: boolean }> = {
    21: { status: 'Finished Airing', episodes: 1155, airing: false },
  };
  
  const override = OVERRIDES[anime.mal_id];
  
  // Determine airing status
  const airing = override ? override.airing : anime.status === "Currently Airing";
  const effectiveEpisodes = override ? override.episodes : anime.episodes;
  const effectiveStatus = override ? override.status : anime.status;
  
  // For airing anime, calculate how many episodes have aired
  // For long-running anime like One Piece, episodes might be null
  let airingEpisodes: number | undefined = effectiveEpisodes || undefined;
  
  if (airing) {
    const startDate = anime.aired?.from ? new Date(anime.aired.from) : null;
    if (startDate) {
      const now = new Date();
      const weeksSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      // Most anime release 1 episode per week
      // For anime with unknown total episodes (null), estimate based on weeks since start
      if (anime.episodes) {
        airingEpisodes = Math.min(weeksSinceStart + 1, anime.episodes);
      } else {
        // For long-running anime with unknown total, use weeks calculation
        // Cap at a reasonable maximum to avoid UI issues
        airingEpisodes = Math.max(1, weeksSinceStart + 1);
      }
    } else if (!anime.episodes) {
      // No start date and no episode count - set to undefined so we use API count
      airingEpisodes = undefined;
    }
  }
  
  return {
    id: anime.mal_id,
    title: anime.title,
    image: anime.images.jpg.large_image_url || anime.images.jpg.image_url,
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
    // Ensure we're getting more results per page
    let url = `${API_BASE_URL}/anime?page=${page}&limit=${MAX_LIMIT}`;
    
    if (query) url += `&q=${encodeURIComponent(query)}`;
    
    // Use genre ID for genre filtering
    if (genre) {
      const genreLower = genre.toLowerCase();
      const genreId = GENRE_ID_MAP[genreLower];
      if (genreId) {
        url += `&genres=${genreId}`;
      } else {
        // Try to find partial match
        const matchedKey = Object.keys(GENRE_ID_MAP).find(key => 
          key.includes(genreLower) || genreLower.includes(key)
        );
        if (matchedKey) {
          url += `&genres=${GENRE_ID_MAP[matchedKey]}`;
        }
      }
    }
    
    if (year) url += `&start_date=${year}`;
    
    if (status) {
      // Map our status to Jikan's status format
      const statusMap: Record<string, string> = {
        'Airing': 'airing',
        'Completed': 'complete',
        'Upcoming': 'upcoming'
      };
      url += `&status=${statusMap[status] || status.toLowerCase()}`;
    }
    
    const data = await fetchWithRateLimit<JikanAnimeResponse>(url);
    
    return {
      anime: data.data.map(formatAnimeData),
      pagination: {
        hasNextPage: data.pagination.has_next_page,
        totalPages: data.pagination.last_visible_page
      }
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
