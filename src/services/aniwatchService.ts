// Aniwatch API Service - Integration with your hosted aniwatch backend
// API URL: https://nyanime-backend.vercel.app/

const ANIWATCH_API_BASE_URL = "https://nyanime-backend.vercel.app/api/v2/hianime";

export interface AniwatchAnime {
  id: string;
  name: string;
  poster: string;
  duration: string;
  type: string;
  rating: string;
  episodes: {
    sub: number;
    dub: number;
  };
}

export interface AniwatchAnimeDetails {
  anime: {
    info: {
      id: string;
      name: string;
      poster: string;
      description: string;
      stats: {
        rating: string;
        quality: string;
        episodes: {
          sub: number;
          dub: number;
        };
        type: string;
        duration: string;
      };
    };
    moreInfo: {
      aired: string;
      genres: string[];
      status: string;
      studios: string;
      duration: string;
    };
  };
  recommendedAnimes: AniwatchAnime[];
  relatedAnimes: AniwatchAnime[];
  seasons: Array<{
    id: string;
    name: string;
    title: string;
    poster: string;
    isCurrent: boolean;
  }>;
}

export interface AniwatchEpisode {
  number: number;
  title: string;
  episodeId: string;
  isFiller: boolean;
}

export interface AniwatchEpisodeServer {
  serverId: number;
  serverName: string;
}

export interface AniwatchEpisodeServers {
  episodeId: string;
  episodeNo: number;
  sub: AniwatchEpisodeServer[];
  dub: AniwatchEpisodeServer[];
  raw: AniwatchEpisodeServer[];
}

export interface AniwatchVideoSource {
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
    "User-Agent": string;
    [key: string]: string;
  };
  sources: AniwatchVideoSource[];
  subtitles: AniwatchSubtitle[];
  anilistID: number | null;
  malID: number | null;
}

export interface AniwatchSearchResult {
  animes: AniwatchAnime[];
  mostPopularAnimes: AniwatchAnime[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  searchQuery: string;
  searchFilters: Record<string, string[]>;
}

export interface AniwatchHomePage {
  spotlightAnimes: Array<{
    id: string;
    name: string;
    jname: string;
    poster: string;
    description: string;
    rank: number;
    otherInfo: string[];
    episodes: {
      sub: number;
      dub: number;
    };
  }>;
  trendingAnimes: Array<{
    id: string;
    name: string;
    poster: string;
    rank: number;
  }>;
  latestEpisodeAnimes: AniwatchAnime[];
  topUpcomingAnimes: AniwatchAnime[];
  topAiringAnimes: Array<{
    id: string;
    name: string;
    jname: string;
    poster: string;
  }>;
  mostPopularAnimes: AniwatchAnime[];
  mostFavoriteAnimes: AniwatchAnime[];
  latestCompletedAnimes: AniwatchAnime[];
  genres: string[];
  top10Animes: {
    today: Array<{
      episodes: {
        sub: number;
        dub: number;
      };
      id: string;
      name: string;
      poster: string;
      rank: number;
    }>;
    week: Array<{
      episodes: {
        sub: number;
        dub: number;
      };
      id: string;
      name: string;
      poster: string;
      rank: number;
    }>;
    month: Array<{
      episodes: {
        sub: number;
        dub: number;
      };
      id: string;
      name: string;
      poster: string;
      rank: number;
    }>;
  };
}

// Helper function to make API requests with error handling
// API utility function with proper error handling and response parsing
const fetchAniwatchAPI = async <T>(endpoint: string): Promise<T> => {
  const url = `${ANIWATCH_API_BASE_URL}${endpoint}`;
  
  try {
    console.log(`Calling Aniwatch API: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'nyanime-client/1.0.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // The API returns { status: 200, data: {...} }, so we need to extract the data
    if (data.status === 200 && data.data) {
      return data.data as T;
    } else if (data.success && data.data) {
      return data.data as T;
    } else {
      // If the response doesn't have the expected structure, return it as-is
      return data as T;
    }
  } catch (error) {
    console.error(`Error fetching from Aniwatch API (${endpoint}):`, error);
    throw error;
  }
};

// Search for anime
export const searchAniwatchAnime = async (query: string, page: number = 1): Promise<AniwatchSearchResult> => {
  const endpoint = `/search?q=${encodeURIComponent(query)}&page=${page}`;
  return fetchAniwatchAPI<AniwatchSearchResult>(endpoint);
};

// Get anime home page data
export const getAniwatchHomePage = async (): Promise<AniwatchHomePage> => {
  return fetchAniwatchAPI<AniwatchHomePage>('/home');
};

// Get anime details by ID
export const getAniwatchAnimeDetails = async (animeId: string): Promise<AniwatchAnimeDetails> => {
  const endpoint = `/anime/${encodeURIComponent(animeId)}`;
  return fetchAniwatchAPI<AniwatchAnimeDetails>(endpoint);
};

// Get episodes for an anime
export const getAniwatchEpisodes = async (animeId: string): Promise<{ totalEpisodes: number; episodes: AniwatchEpisode[] }> => {
  const endpoint = `/anime/${encodeURIComponent(animeId)}/episodes`;
  return fetchAniwatchAPI<{ totalEpisodes: number; episodes: AniwatchEpisode[] }>(endpoint);
};

// Get available servers for an episode
export const getAniwatchEpisodeServers = async (episodeId: string): Promise<AniwatchEpisodeServers> => {
  const endpoint = `/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`;
  return fetchAniwatchAPI<AniwatchEpisodeServers>(endpoint);
};

// Get streaming sources for an episode
export const getAniwatchStreamingSources = async (
  episodeId: string,
  server: string = "hd-1",
  category: "sub" | "dub" | "raw" = "sub"
): Promise<AniwatchStreamingData> => {
  const endpoint = `/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`;
  return fetchAniwatchAPI<AniwatchStreamingData>(endpoint);
};

// Get category animes (trending, popular, etc.)
export const getAniwatchCategoryAnimes = async (
  category: string,
  page: number = 1
): Promise<{
  category: string;
  animes: AniwatchAnime[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}> => {
  const endpoint = `/category/${category}?page=${page}`;
  return fetchAniwatchAPI<{
    category: string;
    animes: AniwatchAnime[];
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
  }>(endpoint);
};

// Get anime by genre
export const getAniwatchGenreAnimes = async (
  genre: string,
  page: number = 1
): Promise<{
  genreName: string;
  animes: AniwatchAnime[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}> => {
  const endpoint = `/genre/${genre}?page=${page}`;
  return fetchAniwatchAPI<{
    genreName: string;
    animes: AniwatchAnime[];
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
  }>(endpoint);
};

// Utility function to convert MAL ID to search for Aniwatch anime
export const findAniwatchAnimeByTitle = async (title: string): Promise<AniwatchAnime | null> => {
  try {
    console.log(`Searching for anime with title: ${title}`);
    const searchResult = await searchAniwatchAnime(title, 1);
    
    if (searchResult.animes.length === 0) {
      console.log(`No anime found for title: ${title}`);
      return null;
    }

    // Try to find the best match
    const exactMatch = searchResult.animes.find(anime => 
      anime.name.toLowerCase() === title.toLowerCase()
    );

    if (exactMatch) {
      console.log(`Found exact match: ${exactMatch.name} (${exactMatch.id})`);
      return exactMatch;
    }

    // If no exact match, try partial matching
    const partialMatch = searchResult.animes.find(anime =>
      anime.name.toLowerCase().includes(title.toLowerCase()) ||
      title.toLowerCase().includes(anime.name.toLowerCase())
    );

    if (partialMatch) {
      console.log(`Found partial match: ${partialMatch.name} (${partialMatch.id})`);
      return partialMatch;
    }

    // Return the first result as fallback
    console.log(`Using first result as fallback: ${searchResult.animes[0].name} (${searchResult.animes[0].id})`);
    return searchResult.animes[0];
  } catch (error) {
    console.error(`Error searching for anime by title "${title}":`, error);
    return null;
  }
};

// Helper function to get the best streaming source
export const getBestStreamingSource = (sources: AniwatchVideoSource[]): AniwatchVideoSource | null => {
  if (sources.length === 0) return null;

  // Prefer M3U8 sources as they're more reliable for streaming
  const m3u8Sources = sources.filter(source => source.isM3U8);
  
  if (m3u8Sources.length > 0) {
    // Sort by quality if available, prefer higher quality
    const sortedSources = m3u8Sources.sort((a, b) => {
      const qualityOrder = ['1080p', '720p', '480p', '360p', 'default'];
      const aIndex = a.quality ? qualityOrder.indexOf(a.quality) : qualityOrder.length;
      const bIndex = b.quality ? qualityOrder.indexOf(b.quality) : qualityOrder.length;
      return aIndex - bIndex;
    });
    
    return sortedSources[0];
  }

  // Fallback to any available source
  return sources[0];
};

// Enhanced episode fetching with retry logic
export const getAniwatchEpisodesWithRetry = async (animeId: string, retries: number = 3): Promise<AniwatchEpisode[]> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching episodes for ${animeId}, attempt ${attempt}/${retries}`);
      const episodeData = await getAniwatchEpisodes(animeId);
      return episodeData.episodes;
    } catch (error) {
      console.error(`Attempt ${attempt} failed for episodes ${animeId}:`, error);
      
      if (attempt === retries) {
        console.error(`All ${retries} attempts failed for episodes ${animeId}`);
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return [];
};

// Enhanced streaming source fetching with multiple servers
export const getAniwatchStreamingSourcesWithFallback = async (
  episodeId: string,
  category: "sub" | "dub" | "raw" = "sub"
): Promise<AniwatchStreamingData | null> => {
  // Try different servers in order of preference
  const servers = ["hd-1", "vidstreaming", "megacloud"];
  
  for (const server of servers) {
    try {
      console.log(`Attempting to get streaming sources with server: ${server}`);
      const streamingData = await getAniwatchStreamingSources(episodeId, server, category);
      
      if (streamingData.sources && streamingData.sources.length > 0) {
        console.log(`Successfully got ${streamingData.sources.length} sources from server: ${server}`);
        return streamingData;
      }
    } catch (error) {
      console.error(`Failed to get sources from server ${server}:`, error);
    }
  }
  
  console.error(`Failed to get streaming sources from all servers for episode: ${episodeId}`);
  return null;
};
