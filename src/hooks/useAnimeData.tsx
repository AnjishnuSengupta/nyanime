
import { useState, useEffect, useCallback } from 'react';
import { 
  fetchTrendingAnime, 
  fetchPopularAnime, 
  fetchSeasonalAnime, 
  getAnimeById,
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

// Search hook with pagination
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
    enabled: !!(query || genre || year || status),
  });
};

// Get anime by ID
export const useAnimeById = (id: number) => {
  return useQuery({
    queryKey: ['anime', id],
    queryFn: () => getAnimeById(id),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
};

// Main hook that combines all anime data sources
export const useAnimeData = () => {
  const { data: trendingAnime = [], isLoading: trendingLoading } = useTrendingAnime();
  const { data: popularAnime = [], isLoading: popularLoading } = usePopularAnime();
  const { data: seasonalAnime = [], isLoading: seasonalLoading } = useSeasonalAnime();
  
  const isLoading = trendingLoading || popularLoading || seasonalLoading;
  const allAnime = [...(trendingAnime || []), ...(popularAnime || []), ...(seasonalAnime || [])];
  
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
    getAnimeById: getAnimeByIdLocal
  };
};

export type { AnimeData };
