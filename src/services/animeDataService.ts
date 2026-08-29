// Interface for anime basic info
export interface AnimeBasicInfo {
  id: string;
  malId: number;
  title: string;
  image: string;
  totalEpisodes?: number;
  status?: string;
  genres?: string[];
  releaseYear?: string;
}

// Cache for anime data to avoid repeated API calls
const animeCache = new Map<number, AnimeBasicInfo>();

// Backend URL — empty string means same origin
const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://nyanime-backend-v2.onrender.com';

/**
 * Fetch anime info via the backend browse proxy (which handles Jikan + AniList fallback)
 */
export const fetchAnimeInfo = async (malId: number): Promise<AnimeBasicInfo | null> => {
  // Check cache first
  const cachedInfo = animeCache.get(malId);
  if (cachedInfo) {
    return cachedInfo;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/browse/anime/${malId}`, {
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resp = await response.json();
    const anime = resp.data;
    
    if (!anime) return null;

    const animeInfo: AnimeBasicInfo = {
      id: String(anime.id),
      malId: Number(anime.id),
      title: anime.title || anime.title_english || 'Unknown Anime',
      image: anime.image || '/placeholder.svg',
      totalEpisodes: anime.episodes || 0,
      status: anime.status,
      genres: anime.category ? anime.category.split(', ').filter(Boolean) : [],
      releaseYear: anime.year || 'Unknown',
    };
    
    // Cache the result
    animeCache.set(malId, animeInfo);
    
    return animeInfo;
  } catch (error) {
    console.error(`Error fetching anime info for MAL ID ${malId}:`, error);
    return null;
  }
};

/**
 * Fetch multiple anime infos in parallel (no rate limiting needed — backend handles it)
 */
export const fetchMultipleAnimeInfo = async (malIds: number[]): Promise<(AnimeBasicInfo | null)[]> => {
  return Promise.all(malIds.map(id => fetchAnimeInfo(id)));
};

/**
 * Search anime by title using the backend search proxy
 */
export const searchAnimeByTitle = async (title: string): Promise<AnimeBasicInfo[]> => {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/browse/search?q=${encodeURIComponent(title)}&page=1`,
      { signal: AbortSignal.timeout(15000) }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resp = await response.json();
    const result = resp.data;

    if (!result?.anime) return [];

    return result.anime.slice(0, 10).map((anime: Record<string, unknown>): AnimeBasicInfo => {
      return {
        id: String(anime.id),
        malId: Number(anime.id),
        title: String(anime.title || anime.title_english || 'Unknown Anime'),
        image: String(anime.image || '/placeholder.svg'),
        totalEpisodes: Number(anime.episodes) || 0,
        status: String(anime.status || 'Unknown'),
        genres: anime.category ? String(anime.category).split(', ').filter(Boolean) : [],
        releaseYear: String(anime.year || 'Unknown'),
      };
    });
  } catch (error) {
    console.error('Error searching anime:', error);
    return [];
  }
};

/**
 * Get anime info with fallback to search if MAL ID fetch fails
 */
export const getAnimeInfoWithFallback = async (malId: number, title?: string): Promise<AnimeBasicInfo> => {
  // Try to fetch by MAL ID first
  const animeInfo = await fetchAnimeInfo(malId);
  
  if (animeInfo) {
    return animeInfo;
  }
  
  // If MAL ID fetch fails and we have a title, try searching
  if (title) {
    const searchResults = await searchAnimeByTitle(title);
    if (searchResults.length > 0) {
      return searchResults[0];
    }
  }
  
  // Return fallback data
  return {
    id: malId.toString(),
    malId,
    title: title || `Anime ${malId}`,
    image: '/placeholder.svg',
    totalEpisodes: 0,
    status: 'Unknown',
    genres: [],
    releaseYear: 'Unknown',
  };
};

/**
 * Clear the anime cache (useful for testing or memory management)
 */
export const clearAnimeCache = () => {
  animeCache.clear();
};
