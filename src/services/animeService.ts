
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
  score: number;
  year: number;
  episodes: number;
  aired: {
    from: string;
    to: string;
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
}

const API_BASE_URL = "https://api.jikan.moe/v4";
const RATE_LIMIT_DELAY = 1000; // Jikan API has rate limit, delay requests by 1 second

// Helper to format API data to our app format
const formatAnimeData = (anime: JikanAnime): AnimeData => {
  return {
    id: anime.mal_id,
    title: anime.title,
    image: anime.images.jpg.large_image_url || anime.images.jpg.image_url,
    category: anime.genres.map(genre => genre.name).join(", "),
    rating: anime.score ? anime.score.toString() : "N/A",
    year: anime.year ? anime.year.toString() : "Unknown",
    episodes: anime.episodes || undefined,
    synopsis: anime.synopsis,
  };
};

// Add delay between API calls to respect rate limits
const delayRequest = () => new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

// Fetch trending/popular anime
export const fetchTrendingAnime = async (): Promise<AnimeData[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/top/anime?filter=airing&limit=10`);
    const data: JikanAnimeResponse = await response.json();
    return data.data.map(formatAnimeData);
  } catch (error) {
    console.error("Error fetching trending anime:", error);
    return [];
  }
};

// Fetch popular anime of all time
export const fetchPopularAnime = async (): Promise<AnimeData[]> => {
  try {
    await delayRequest(); // Prevent rate limiting
    const response = await fetch(`${API_BASE_URL}/top/anime?filter=bypopularity&limit=10`);
    const data: JikanAnimeResponse = await response.json();
    return data.data.map(formatAnimeData);
  } catch (error) {
    console.error("Error fetching popular anime:", error);
    return [];
  }
};

// Fetch seasonal anime (current season)
export const fetchSeasonalAnime = async (): Promise<AnimeData[]> => {
  try {
    await delayRequest(); // Prevent rate limiting
    const response = await fetch(`${API_BASE_URL}/seasons/now?limit=10`);
    const data: JikanAnimeResponse = await response.json();
    return data.data.map(formatAnimeData);
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
    let url = `${API_BASE_URL}/anime?page=${page}&limit=20`;
    
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (genre) url += `&genres=${encodeURIComponent(genre)}`;
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
    
    const response = await fetch(url);
    const data: JikanAnimeResponse = await response.json();
    
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
    const response = await fetch(`${API_BASE_URL}/anime/${id}`);
    const data = await response.json();
    
    if (!data.data) return null;
    
    // Get similar anime (recommendations)
    let similarAnime: AnimeData[] = [];
    try {
      await delayRequest();
      const recResponse = await fetch(`${API_BASE_URL}/anime/${id}/recommendations`);
      const recData = await recResponse.json();
      similarAnime = recData.data.slice(0, 5).map((rec: any) => formatAnimeData(rec.entry));
    } catch (error) {
      console.error("Error fetching recommendations:", error);
    }
    
    return {
      ...formatAnimeData(data.data),
      similarAnime
    };
  } catch (error) {
    console.error(`Error fetching anime with ID ${id}:`, error);
    return null;
  }
};

// Get genres list
export const fetchGenres = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/genres/anime`);
    const data = await response.json();
    return data.data.map((genre: any) => genre.name);
  } catch (error) {
    console.error("Error fetching genres:", error);
    return [];
  }
};
