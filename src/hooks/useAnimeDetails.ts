
import { useQuery } from '@tanstack/react-query';
import { fetchCharacters, fetchReviews, CharacterData, ReviewData } from '../services/characterService';
import AnimeAvatarService from '../services/animeAvatarService';

// Enhanced character and review hooks with proper data handling
export const useAnimeCharacters = (animeId: number) => {
  return useQuery({
    queryKey: ['animeCharacters', animeId],
    queryFn: () => fetchCharacters(animeId),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: animeId > 0,
    // Ensure we always return an array even if the fetch fails
    select: (data) => Array.isArray(data) ? data : [],
    // Error handling moved to meta.onError in v5
    meta: {
      onError: (error: Error) => {
        console.error('Error fetching characters:', error);
      }
    }
  });
};

export const useAnimeReviews = (animeId: number) => {
  return useQuery({
    queryKey: ['animeReviews', animeId],
    queryFn: () => fetchReviews(animeId),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: animeId > 0,
    // Ensure we always return an array even if the fetch fails
    select: (data) => Array.isArray(data) ? data : [],
    // Error handling moved to meta.onError in v5
    meta: {
      onError: (error: Error) => {
        console.error('Error fetching reviews:', error);
      }
    }
  });
};

// Generate fallback characters and reviews data if the API fails
export const generateFallbackCharacters = (animeId: number): CharacterData[] => {
  // Generate some fallback character data based on animeId to ensure consistent results
  return Array.from({ length: 10 }, (_, i) => ({
    id: animeId * 100 + i, // Convert to number ID
    name: `Character ${i + 1}`,
    image: AnimeAvatarService.getCharacterAvatar((animeId * 10 + i)),
    role: i === 0 ? 'Main' : i < 3 ? 'Supporting' : 'Background',
    voiceActor: {
      id: `va-${i}`,
      name: `Voice Actor ${i + 1}`,
      image: AnimeAvatarService.getCharacterAvatar((animeId * 10 + i + 5))
    }
  }));
};

export const generateFallbackReviews = (animeId: number): ReviewData[] => {
  // Generate some fallback review data based on animeId to ensure consistent results
  const reviewTexts = [
    "This anime is a masterpiece! The character development and story arcs are incredibly well-crafted.",
    "I was skeptical at first, but this show really won me over. The animation quality is top-notch and the soundtrack is amazing.",
    "A solid series with great moments, though there are some pacing issues in the middle episodes.",
    "This anime has become one of my all-time favorites. The themes it explores are thought-provoking and emotionally resonant.",
    "While the animation is stunning, the plot feels derivative of better series. Still worth watching for the visuals alone."
  ];
  
  return Array.from({ length: 5 }, (_, i) => ({
    id: animeId * 100 + i, // Convert to number ID
    user: {
      id: `user-${animeId * 5 + i}`,
      username: `Anime${['Fan', 'Lover', 'Critic', 'Expert', 'Watcher'][i]}${animeId % 100}`,
      avatar: AnimeAvatarService.getUserAvatar(`user${(animeId * 5 + i)}`)
    },
    rating: Math.floor(7 + (animeId * i) % 4),
    text: reviewTexts[i],
    date: new Date(Date.now() - (i * 86400000)).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }));
};

export type { CharacterData, ReviewData };
