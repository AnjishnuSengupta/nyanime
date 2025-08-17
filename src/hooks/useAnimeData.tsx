
import { useState, useEffect, useCallback, useMemo } from 'react';
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
export const useTrendingAnime = () => {
  return useQuery({
    queryKey: ['trendingAnime'],
    queryFn: fetchTrendingAnime,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
};

// Custom hook for popular anime
export const usePopularAnime = () => {
  return useQuery({
    queryKey: ['popularAnime'],
    queryFn: fetchPopularAnime,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
};

// Custom hook for seasonal anime
export const useSeasonalAnime = () => {
  return useQuery({
    queryKey: ['seasonalAnime'],
    queryFn: fetchSeasonalAnime,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
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
  // Add console log for debugging purposes
  console.log(`useAnimeById called with ID: ${id}`);
  
  return useQuery({
    queryKey: ['anime', id],
    queryFn: () => {
      console.log(`Fetching anime data for ID: ${id}`);
      return getAnimeById(id);
    },
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
    console.log(`Looking for anime with ID: ${id} in local cache`);
    const anime = allAnime.find(anime => anime.id === id);
    if (anime) {
      console.log(`Found anime in local cache: ${anime.title}`);
    } else {
      console.log(`Anime with ID: ${id} not found in local cache`);
    }
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
