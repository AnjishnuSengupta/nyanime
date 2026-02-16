/**
 * React hooks for Aniwatch API data fetching
 * Uses local server-side /aniwatch route (npm package scraper with old API fallback)
 */

import { useQuery } from '@tanstack/react-query';
import { 
  searchAnime, 
  fetchEpisodes,
  getEpisodeServers,
  getStreamingSources,
} from '../services/aniwatchApiService';

/**
 * Hook to fetch Aniwatch home page data
 * Includes: spotlight, trending, latest episodes, top airing, etc.
 */
export const useAniwatchHome = () => {
  return useQuery({
    queryKey: ['aniwatch', 'home'],
    queryFn: async () => {
      // Use local server route — server handles npm package scraping + old API fallback
      const response = await fetch('/aniwatch?action=home');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch home data: ${response.statusText}`);
      }
      
      const json = await response.json();
      // Server wraps in { success, data } — extract data
      return json.data || json;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });
};

/**
 * Hook to search anime on Aniwatch
 */
export const useAniwatchSearch = (query: string, page: number = 1) => {
  return useQuery({
    queryKey: ['aniwatch', 'search', query, page],
    queryFn: () => searchAnime(query, page),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

/**
 * Hook to fetch anime details by Aniwatch ID
 */
// Hook for episodes list

/**
 * Hook to fetch episodes for an anime
 */
export const useAniwatchEpisodes = (animeId: string) => {
  return useQuery({
    queryKey: ['aniwatch', 'episodes', animeId],
    queryFn: () => fetchEpisodes(animeId),
    enabled: !!animeId,
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
    retry: 2,
  });
};

/**
 * Hook to fetch available servers for an episode
 */
export const useEpisodeServers = (episodeId: string) => {
  return useQuery({
    queryKey: ['aniwatch', 'servers', episodeId],
    queryFn: () => getEpisodeServers(episodeId),
    enabled: !!episodeId,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });
};

/**
 * Hook to fetch streaming sources for an episode
 */
export const useStreamingSources = (
  episodeId: string,
  category: 'sub' | 'dub' = 'sub',
  server: string = 'streamtape'
) => {
  return useQuery({
    queryKey: ['aniwatch', 'sources', episodeId, category, server],
    queryFn: () => getStreamingSources(episodeId, category, server),
    enabled: !!episodeId,
    staleTime: 0, // Don't cache streaming URLs (they expire quickly)
    retry: 1,
    refetchOnMount: true, // Always fetch fresh URLs
  });
};
