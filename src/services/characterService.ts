
import { AnimeData } from './animeService';

import AnimeAvatarService from './animeAvatarService';

export interface Character {
  id: number; // Changed to number type
  name: string;
  image: string;
  role?: string;
  voiceActor?: {
    name: string;
    image?: string;
    id?: string; // Added to match the implementation
  };
}

export type CharacterData = Character;

export interface ReviewData {
  id: number; // Changed to number type
  user: {
    username: string;
    avatar?: string;
    id?: string; // Added to match the implementation
  };
  rating: number;
  text: string;
  date: string;
}

const API_BASE_URL = "https://api.jikan.moe/v4";
const RATE_LIMIT_DELAY = 1000;

// Helper to format character data
const formatCharacterData = (character: {
  character: {
    mal_id: number;
    name: string;
    images: {jpg: {image_url: string}};
  };
  role: string;
  voice_actors?: Array<{
    person: {mal_id: number; name: string; images: {jpg: {image_url: string}}};
    language: string;
  }>;
}): CharacterData => {
  return {
    id: character.character.mal_id,
    name: character.character.name,
    image: character.character.images.jpg.image_url,
    role: character.role,
    voiceActor: character.voice_actors && character.voice_actors.length > 0 ? {
      id: `va-${character.voice_actors[0].person.mal_id}`,
      name: character.voice_actors[0].person.name,
      image: character.voice_actors[0].person.images?.jpg?.image_url
    } : undefined
  };
};

// Helper to format review data
const formatReviewData = (review: {
  mal_id: number;
  user: {username: string};
  score: number;
  content: string;
  date: string;
}): ReviewData => {
  return {
    id: review.mal_id,
    user: {
      id: `user-${review.user.username}`,
      username: review.user.username,
      avatar: AnimeAvatarService.getUserAvatar(review.user.username)
    },
    rating: review.score,
    text: review.content,
    date: new Date(review.date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  };
};

// Add delay between API calls to respect rate limits
const delayRequest = () => new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

// Fetch characters for an anime
export const fetchCharacters = async (animeId: number): Promise<CharacterData[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/anime/${animeId}/characters`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Return the first 10 characters to keep loading time reasonable
    return data.data.slice(0, 10).map(formatCharacterData);
  } catch (error) {
    console.error(`Error fetching characters for anime ${animeId}:`, error);
    return generateFallbackCharacters();
  }
};

// Fetch reviews for an anime
export const fetchReviews = async (animeId: number): Promise<ReviewData[]> => {
  try {
    await delayRequest(); // Prevent rate limiting
    const response = await fetch(`${API_BASE_URL}/anime/${animeId}/reviews`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Return the first 5 reviews
    return data.data.slice(0, 5).map(formatReviewData);
  } catch (error) {
    console.error(`Error fetching reviews for anime ${animeId}:`, error);
    return generateFallbackReviews();
  }
};

// Generate fallback characters when API fails
const generateFallbackCharacters = (): CharacterData[] => {
  const characterNames = ["Naruto Uzumaki", "Sasuke Uchiha", "Monkey D. Luffy", "Goku", "Eren Yeager", 
                          "Levi Ackerman", "Edward Elric", "Light Yagami", "Lelouch Lamperouge", "Spike Spiegel"];
  const voiceActors = ["Junko Takeuchi", "Noriaki Sugiyama", "Mayumi Tanaka", "Masako Nozawa", "Yuki Kaji",
                       "Hiroshi Kamiya", "Romi Park", "Mamoru Miyano", "Jun Fukuyama", "Koichi Yamadera"];
                       
  return characterNames.map((name, index) => ({
    id: index + 1,
    name,
    image: AnimeAvatarService.getCharacterAvatar(index + 10),
    role: index % 3 === 0 ? "Main" : "Supporting",
    voiceActor: {
      id: `va-${index}`, // Added consistent id format
      name: voiceActors[index],
      image: AnimeAvatarService.getCharacterAvatar(index + 20)
    }
  }));
};

// Generate fallback reviews when API fails
const generateFallbackReviews = (): ReviewData[] => {
  const reviews = [
    "This anime completely blew me away with its stunning animation and compelling storyline. The character development is masterful, and I found myself emotionally invested from the very first episode.",
    "While the premise is interesting, the pacing is a bit slow for my taste. Still, the art style and music more than make up for it. I'd recommend giving it a chance.",
    "An absolute masterpiece that deserves all the praise it gets. The way the themes are explored adds layers of depth to what could have been a simple story. Can't wait for the next season!",
    "I had high expectations going in, and this anime exceeded all of them. The action sequences are breathtaking, and the emotional moments hit hard. A must-watch for any anime fan.",
    "The world-building in this series is phenomenal. Every detail feels intentional and adds to the immersive experience. It's the kind of show that rewards multiple viewings."
  ];
  
  return reviews.map((text, index) => ({
    id: index + 1,
    user: {
      id: `user-${index}`, // Added consistent id format
      username: ["AnimeExpert", "OtakuMaster", "SakuraBlossom", "TokyoDrifter", "MangaReader"][index],
      avatar: AnimeAvatarService.getCharacterAvatar(index + 15)
    },
    rating: 7 + Math.floor(Math.random() * 4),
    text,
    date: new Date(Date.now() - (index * 86400000 * 5)).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }));
};
