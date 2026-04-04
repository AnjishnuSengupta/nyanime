
import { useCallback, useMemo } from 'react';
import { 
  fetchTrendingAnime, 
  fetchPopularAnime, 
  fetchSeasonalAnime, 
  getAnimeById,
  getSimilarAnime,
  searchAnime,
  AnimeData
} from '../services/animeService';
import { useQuery } from '@tanstack/react-query';

// Custom hook for trending anime
export const useTrendingAnime = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['trendingAnime'],
    queryFn: fetchTrendingAnime,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled,
  });
};

// Custom hook for popular anime
export const usePopularAnime = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['popularAnime'],
    queryFn: fetchPopularAnime,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled,
  });
};

// Custom hook for seasonal anime
export const useSeasonalAnime = (enabled: boolean = true) => {
  // Calculate current season and year to include in query key
  // This ensures cache is invalidated when seasons change
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();
  
  // Determine season: Winter (0-2), Spring (3-5), Summer (6-8), Fall (9-11)
  let season: string;
  if (month >= 0 && month <= 2) season = 'winter';
  else if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else season = 'fall';
  
  const seasonKey = `${year}-${season}`;
  
  return useQuery({
    queryKey: ['seasonalAnime', seasonKey, 'v2'], // Added version to force cache refresh
    queryFn: fetchSeasonalAnime,
    staleTime: 60 * 60 * 1000, // 1 hour cache (within same season)
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    enabled,
  });
};

// Search hook with pagination - Modified to ensure enabled for genre searches
export const useAnimeSearch = (
  query?: string,
  genre?: string,
  year?: string,
  status?: string,
  page: number = 1
) => {
  return useQuery({
    queryKey: ['animeSearch', query, genre, year, status, page],
    queryFn: () => searchAnime(query, genre, year, status, page),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: !!(query || genre || year || status), // Only run query if at least one search parameter is provided
  });
};

// Get anime by ID
export const useAnimeById = (id: number) => {
  return useQuery({
    queryKey: ['anime', id],
    queryFn: () => getAnimeById(id),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: id > 0,
  });
};

// Custom hook for getting similar anime
export const useSimilarAnime = (id: number) => {
  return useQuery({
    queryKey: ['similarAnime', id],
    queryFn: () => getSimilarAnime(id),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: id > 0,
    retry: 1, // Only retry once to avoid excessive API calls
    retryDelay: 2000, // Wait 2 seconds before retrying
  });
};

// Main hook that combines all anime data sources
export const useAnimeData = () => {
  const { data: trendingAnime = [], isLoading: trendingLoading } = useTrendingAnime();
  const { data: popularAnime = [], isLoading: popularLoading } = usePopularAnime();
  const { data: seasonalAnime = [], isLoading: seasonalLoading } = useSeasonalAnime();
  
  const isLoading = trendingLoading || popularLoading || seasonalLoading;
  const allAnime = useMemo(() => 
    [...(trendingAnime || []), ...(popularAnime || []), ...(seasonalAnime || [])], 
    [trendingAnime, popularAnime, seasonalAnime]
  );
  
  // For backward compatibility, maintain getAnimeById
  const getAnimeByIdLocal = useCallback((id: number): AnimeData | null => {
    const anime = allAnime.find(anime => anime.id === id);
    return anime || null;
  }, [allAnime]);
  
  return {
    trendingAnime: trendingAnime || [],
    popularAnime: popularAnime || [],
    seasonalAnime: seasonalAnime || [],
    allAnime,
    isLoading,
    getAnimeById: getAnimeByIdLocal,
    getSimilarAnime // Keep this function here for backward compatibility
  };
};

export type { AnimeData };
