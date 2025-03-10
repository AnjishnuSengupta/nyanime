
import { useQuery } from '@tanstack/react-query';
import { fetchCharacters, fetchReviews, CharacterData, ReviewData } from '../services/characterService';

export const useAnimeCharacters = (animeId: number) => {
  return useQuery({
    queryKey: ['animeCharacters', animeId],
    queryFn: () => fetchCharacters(animeId),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: animeId > 0,
  });
};

export const useAnimeReviews = (animeId: number) => {
  return useQuery({
    queryKey: ['animeReviews', animeId],
    queryFn: () => fetchReviews(animeId),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: animeId > 0,
  });
};

export type { CharacterData, ReviewData };
