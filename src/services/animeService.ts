
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
  // Add missing properties used in NotFound.tsx
  type?: string;
  status?: string;
}

const API_BASE_URL = "https://api.jikan.moe/v4";
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const RATE_LIMIT_DELAY = 1000; // Jikan API has rate limit, delay requests by 1 second
const MAX_LIMIT = 100; // Maximum limit allowed by Jikan API

// Helper to format API data to our app format
const formatAnimeData = (anime: JikanAnime): AnimeData => {
  return {
    id: anime.mal_id,
    title: anime.title,
    image: anime.images.jpg.large_image_url || anime.images.jpg.image_url,
    category: anime.genres ? anime.genres.map(genre => genre.name).join(", ") : "Unknown",
    rating: anime.score ? anime.score.toString() : "N/A",
    year: anime.year ? anime.year.toString() : "Unknown",
    episodes: anime.episodes || undefined,
    synopsis: anime.synopsis,
    trailerId: anime.trailer?.youtube_id,
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

// Add delay between API calls to respect rate limits
const delayRequest = () => new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

// Fetch trending/popular anime
export const fetchTrendingAnime = async (): Promise<AnimeData[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/top/anime?filter=airing&limit=${MAX_LIMIT}`);
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
    const response = await fetch(`${API_BASE_URL}/top/anime?filter=bypopularity&limit=${MAX_LIMIT}`);
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
    const response = await fetch(`${API_BASE_URL}/seasons/now?limit=${MAX_LIMIT}`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    const data: JikanAnimeResponse = await response.json();
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
    
    // Use genres parameter for genre filtering
    if (genre) {
      // Make sure genre is properly capitalized to match API expected format
      const formattedGenre = genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();
      url += `&genres=${encodeURIComponent(formattedGenre)}`;
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
    
    console.log("Search URL:", url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data: JikanAnimeResponse = await response.json();
    console.log("API Response data:", data);
    
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
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data) return null;
    
    let animeData = formatAnimeData(data.data);
    
    // If no trailer ID is available from Jikan, try to find one using YouTube API
    if (!animeData.trailerId && YOUTUBE_API_KEY) {
      const youtubeTrailerId = await findAnimeTrailer(animeData.title);
      animeData = { ...animeData, trailerId: youtubeTrailerId };
    }
    
    // Get similar anime (recommendations)
    await delayRequest();
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
    const response = await fetch(`${API_BASE_URL}/anime/${id}/recommendations`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      console.log("No similar anime data returned from API");
      return [];
    }
    
    // Safely extract and format the recommendations
    return data.data
      .slice(0, 5)
      .filter((rec: any) => rec && rec.entry)
      .map((rec: any) => formatAnimeData(rec.entry));
      
  } catch (error) {
    console.error(`Error fetching similar anime for ID ${id}:`, error);
    return [];
  }
};

// Get genres list
export const fetchGenres = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/genres/anime`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data) return [];
    
    return data.data.map((genre: any) => genre.name);
  } catch (error) {
    console.error("Error fetching genres:", error);
    return [];
  }
};
