
// Anime Service — Backend proxy for all browse, search, and recommendation data.
// All data flows through server.js /api/browse/* routes, which handle:
//   - Jikan as primary source with SWR caching
//   - Stale cache serving during outages
//   - AniList as last-resort fallback
//
// The frontend no longer calls api.jikan.moe directly.

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

// Backend URL — empty string means same origin (Vite proxy or production build)
const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://nyanime-backend-v2.onrender.com';
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

// ── Search re-ranking (client-side, for responsiveness) ──────────────────

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

// ── Backend fetch helper ─────────────────────────────────────────────────

async function browseFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for backend calls

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Backend ${response.status}: ${path}`);
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── Genre ID map (kept for URL parameter construction) ───────────────────
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

// Helper to format API data to our app format (kept for backward compatibility
// with any code path that receives raw Jikan data from other endpoints)
const formatAnimeData = (anime: JikanAnime): AnimeData => {
  // Determine airing status directly from Jikan API data (no overrides)
  const airing = anime.status === "Currently Airing";
  const effectiveEpisodes = anime.episodes;
  const effectiveStatus = anime.status;
  
  // We no longer calculate airingEpisodes from the start date manually because it's highly inaccurate due to hiatuses, delays, or double-episode releases. We will rely on the streaming API's episode list to determine the actual number of aired episodes.
  const airingEpisodes: number | undefined = undefined;

  
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

// ── Browse fetchers (all go through backend /api/browse/* routes) ─────────

// Fetch trending/popular anime
export const fetchTrendingAnime = async (): Promise<AnimeData[]> => {
  try {
    const resp = await browseFetch<{ data: AnimeData[] }>('/api/browse/trending');
    return resp.data || [];
  } catch (error) {
    console.error("Error fetching trending anime:", error);
    return [];
  }
};

// Fetch popular anime of all time
export const fetchPopularAnime = async (): Promise<AnimeData[]> => {
  try {
    const resp = await browseFetch<{ data: AnimeData[] }>('/api/browse/popular');
    return resp.data || [];
  } catch (error) {
    console.error("Error fetching popular anime:", error);
    return [];
  }
};

// Fetch all-time top-ranked anime (by score, unfiltered)
export const fetchTopAnime = async (): Promise<AnimeData[]> => {
  try {
    const resp = await browseFetch<{ data: AnimeData[] }>('/api/browse/top');
    return resp.data || [];
  } catch (error) {
    console.error("Error fetching top anime:", error);
    return [];
  }
};

// Fetch "trendy" anime — ranked by current favorite count (buzz, not raw member count)
export const fetchTrendyAnime = async (): Promise<AnimeData[]> => {
  try {
    const resp = await browseFetch<{ data: AnimeData[] }>('/api/browse/trendy');
    return resp.data || [];
  } catch (error) {
    console.error("Error fetching trendy anime:", error);
    return [];
  }
};

// Fetch seasonal anime (current season)
export const fetchSeasonalAnime = async (): Promise<AnimeData[]> => {
  try {
    const resp = await browseFetch<{ data: AnimeData[] }>('/api/browse/seasonal');
    return resp.data || [];
  } catch (error) {
    console.error("Error fetching seasonal anime:", error);
    return [];
  }
};

// Search anime by title with multiple filters
export const searchAnime = async (
  query?: string,
  genre?: string,
  year?: string,
  status?: string,
  page: number = 1
): Promise<{ anime: AnimeData[], pagination: { hasNextPage: boolean, totalPages: number } }> => {
  try {
    // Build query params for the backend search route
    const params = new URLSearchParams();
    if (query) params.set('q', query);

    // Resolve genre names to Jikan IDs (backend expects numeric IDs for Jikan passthrough)
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
        params.set('genre', Array.from(new Set(genreIds)).join(','));
      }
    }

    if (year) params.set('year', year);

    if (status) {
      const statusMap: Record<string, string> = {
        Airing: 'airing',
        Completed: 'complete',
        Upcoming: 'upcoming',
      };
      params.set('status', statusMap[status] || status);
    }

    params.set('page', String(page));

    const resp = await browseFetch<{
      data: { anime: AnimeData[], pagination: { hasNextPage: boolean, totalPages: number } }
    }>(`/api/browse/search?${params.toString()}`);

    const result = resp.data;

    // Client-side re-ranking for relevance (same logic as before)
    const ranked = rerankAnimeResults(result.anime || [], query);

    return {
      anime: ranked,
      pagination: result.pagination || { hasNextPage: false, totalPages: 0 },
    };
  } catch (error) {
    console.error("Error searching anime:", error);
    return { anime: [], pagination: { hasNextPage: false, totalPages: 0 } };
  }
};

// Get anime by ID
export const getAnimeById = async (id: number): Promise<AnimeData | null> => {
  try {
    const resp = await browseFetch<{ data: AnimeData }>(`/api/browse/anime/${id}`);

    if (!resp.data) return null;

    let animeData = resp.data;

    // If no trailer ID is available, try to find one using YouTube API
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
    const resp = await browseFetch<{ data: AnimeData[] }>(`/api/browse/similar/${id}`);
    return resp.data || [];
  } catch (error) {
    console.error(`Error fetching similar anime for ID ${id}:`, error);
    return [];
  }
};

// Get genres list (static — Jikan genre list rarely changes)
export const fetchGenres = async (): Promise<string[]> => {
  return Object.keys(GENRE_ID_MAP).map(
    genre => genre.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
};
