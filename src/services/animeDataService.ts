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

/**
 * Fetch anime info from Jikan (MyAnimeList) API
 */
export const fetchAnimeInfo = async (malId: number): Promise<AnimeBasicInfo | null> => {
  // Check cache first
  const cachedInfo = animeCache.get(malId);
  if (cachedInfo) {
    return cachedInfo;
  }

  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const anime = data.data;
    
    const animeInfo: AnimeBasicInfo = {
      id: anime.mal_id.toString(),
      malId: anime.mal_id,
      title: anime.title || anime.title_english || 'Unknown Anime',
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '/placeholder.svg',
      totalEpisodes: anime.episodes || 0,
      status: anime.status,
      genres: anime.genres?.map((g: { name: string }) => g.name) || [],
      releaseYear: anime.year?.toString() || anime.aired?.from?.split('-')[0] || 'Unknown',
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
 * Fetch multiple anime infos in parallel
 */
export const fetchMultipleAnimeInfo = async (malIds: number[]): Promise<(AnimeBasicInfo | null)[]> => {
  // Add delay between requests to respect Jikan rate limit (3 requests/second)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  const results: (AnimeBasicInfo | null)[] = [];
  
  for (let i = 0; i < malIds.length; i++) {
    const info = await fetchAnimeInfo(malIds[i]);
    results.push(info);
    
    // Add delay between requests (350ms = ~2.8 requests/second)
    if (i < malIds.length - 1) {
      await delay(350);
    }
  }
  
  return results;
};

/**
 * Search anime by title using Jikan (MyAnimeList) API
 */
export const searchAnimeByTitle = async (title: string): Promise<AnimeBasicInfo[]> => {
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=10`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.data.map((anime: Record<string, unknown>): AnimeBasicInfo => {
      const images = anime.images as Record<string, Record<string, string>> | undefined;
      const aired = anime.aired as Record<string, string> | undefined;
      
      return {
        id: String(anime.mal_id),
        malId: Number(anime.mal_id),
        title: String(anime.title || anime.title_english || 'Unknown Anime'),
        image: images?.jpg?.large_image_url || images?.jpg?.image_url || '/placeholder.svg',
        totalEpisodes: Number(anime.episodes) || 0,
        status: String(anime.status || 'Unknown'),
        genres: (anime.genres as Array<{ name: string }> | undefined)?.map(g => g.name) || [],
        releaseYear: String(anime.year) || aired?.from?.split('-')[0] || 'Unknown',
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
