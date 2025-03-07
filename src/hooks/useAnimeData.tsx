
import { useState, useEffect, useCallback } from 'react';

export interface AnimeData {
  id: number;
  title: string;
  image: string;
  category: string;
  rating: string;
  year: string;
  episodes?: number;
  similarAnime?: AnimeData[];
}

// Mock data generator for similar anime
const generateSimilarAnime = (baseId: number): AnimeData[] => {
  return Array(5).fill(0).map((_, i) => ({
    id: baseId * 100 + i + 1,
    title: `Similar Anime ${i + 1}`,
    image: `https://images.unsplash.com/photo-${1470813740244 + i * 1000}-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&blur=${i}`,
    category: ["Action", "Comedy", "Drama", "Fantasy", "Horror"][Math.floor(Math.random() * 5)],
    rating: (7 + Math.random() * 2.5).toFixed(1),
    year: `202${Math.floor(Math.random() * 3)}`,
    episodes: Math.floor(Math.random() * 24) + 1
  }));
};

export const useTrendingAnime = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [trendingAnime, setTrendingAnime] = useState<AnimeData[]>([]);
  
  useEffect(() => {
    // Simulate API fetch with a timeout
    const fetchData = () => {
      setTimeout(() => {
        setTrendingAnime([
          {
            id: 1,
            title: "Demon Slayer: Entertainment District Arc",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80",
            category: "Action, Fantasy",
            rating: "9.5",
            year: "2021",
            episodes: 11
          },
          {
            id: 2,
            title: "Attack on Titan: Final Season",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80",
            category: "Action, Drama",
            rating: "9.8",
            year: "2022",
            episodes: 12
          },
          {
            id: 3,
            title: "Jujutsu Kaisen",
            image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80",
            category: "Action, Supernatural",
            rating: "9.2",
            year: "2020",
            episodes: 24
          },
          {
            id: 4,
            title: "My Hero Academia",
            image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80",
            category: "Action, Superhero",
            rating: "8.7",
            year: "2021",
            episodes: 25
          },
          {
            id: 5,
            title: "Spy x Family",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80&sat=-100",
            category: "Action, Comedy",
            rating: "9.1",
            year: "2022",
            episodes: 12
          },
          {
            id: 6,
            title: "Chainsaw Man",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80&sat=-100",
            category: "Action, Supernatural",
            rating: "9.4",
            year: "2022",
            episodes: 12
          },
          {
            id: 7,
            title: "Ranking of Kings",
            image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&sat=-100",
            category: "Adventure, Fantasy",
            rating: "9.0",
            year: "2021",
            episodes: 23
          },
          {
            id: 8,
            title: "One Piece",
            image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80&sat=-100",
            category: "Adventure, Fantasy",
            rating: "9.3",
            year: "2022",
            episodes: 1000
          },
          {
            id: 9,
            title: "Mob Psycho 100 III",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80&blur=1",
            category: "Action, Comedy",
            rating: "9.2",
            year: "2022",
            episodes: 12
          },
          {
            id: 10,
            title: "Vinland Saga",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80&blur=1",
            category: "Action, Adventure",
            rating: "9.0",
            year: "2022",
            episodes: 24
          }
        ]);
        setIsLoading(false);
      }, 1000);
    };

    fetchData();
  }, []);

  return { trendingAnime, isLoading };
};

export const usePopularAnime = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [popularAnime, setPopularAnime] = useState<AnimeData[]>([]);
  
  useEffect(() => {
    // Simulate API fetch with a timeout
    const fetchData = () => {
      setTimeout(() => {
        setPopularAnime([
          {
            id: 11,
            title: "Fullmetal Alchemist: Brotherhood",
            image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&blur=2",
            category: "Action, Adventure",
            rating: "9.7",
            year: "2009",
            episodes: 64
          },
          {
            id: 12,
            title: "Steins;Gate",
            image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80&blur=2",
            category: "Sci-Fi, Thriller",
            rating: "9.6",
            year: "2011",
            episodes: 24
          },
          {
            id: 13,
            title: "Hunter x Hunter",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80&sat=100",
            category: "Action, Adventure",
            rating: "9.5",
            year: "2011",
            episodes: 148
          },
          {
            id: 14,
            title: "Death Note",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80&sat=100",
            category: "Mystery, Psychological",
            rating: "9.4",
            year: "2006",
            episodes: 37
          },
          {
            id: 15,
            title: "Code Geass",
            image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&sat=100",
            category: "Mecha, Drama",
            rating: "9.3",
            year: "2006",
            episodes: 50
          }
        ]);
        setIsLoading(false);
      }, 1500);
    };

    fetchData();
  }, []);

  return { popularAnime, isLoading };
};

export const useSeasonalAnime = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [seasonalAnime, setSeasonalAnime] = useState<AnimeData[]>([]);
  
  useEffect(() => {
    // Simulate API fetch with a timeout
    const fetchData = () => {
      setTimeout(() => {
        setSeasonalAnime([
          {
            id: 16,
            title: "Solo Leveling",
            image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80&hue=240",
            category: "Action, Fantasy",
            rating: "9.2",
            year: "2023",
            episodes: 12
          },
          {
            id: 17,
            title: "The Apothecary Diaries",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80&hue=240",
            category: "Mystery, Drama",
            rating: "8.9",
            year: "2023",
            episodes: 24
          },
          {
            id: 18,
            title: "Delicious in Dungeon",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80&hue=240",
            category: "Fantasy, Adventure",
            rating: "8.8",
            year: "2023",
            episodes: 12
          },
          {
            id: 19,
            title: "Frieren: Beyond Journey's End",
            image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&hue=240",
            category: "Fantasy, Adventure",
            rating: "9.1",
            year: "2023",
            episodes: 28
          },
          {
            id: 20,
            title: "Blue Lock",
            image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80&hue=140",
            category: "Sports, Drama",
            rating: "8.7",
            year: "2023",
            episodes: 24
          },
          {
            id: 21,
            title: "Oshi no Ko",
            image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=600&q=80&hue=140",
            category: "Drama, Psychological",
            rating: "9.2",
            year: "2023",
            episodes: 11
          },
          {
            id: 22,
            title: "Mashle",
            image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80&hue=140",
            category: "Comedy, Fantasy",
            rating: "8.5",
            year: "2023",
            episodes: 12
          }
        ]);
        setIsLoading(false);
      }, 2000);
    };

    fetchData();
  }, []);

  return { seasonalAnime, isLoading };
};

// New function to get all anime data
export const useAnimeData = () => {
  const { trendingAnime, isLoading: trendingLoading } = useTrendingAnime();
  const { popularAnime, isLoading: popularLoading } = usePopularAnime();
  const { seasonalAnime, isLoading: seasonalLoading } = useSeasonalAnime();
  
  const allAnime = [...trendingAnime, ...popularAnime, ...seasonalAnime];
  
  const getAnimeById = useCallback((id: number): AnimeData | null => {
    const anime = allAnime.find(anime => anime.id === id);
    
    if (anime) {
      // Add similar anime to the found anime
      return {
        ...anime,
        similarAnime: generateSimilarAnime(id)
      };
    }
    
    // Return fallback data if not found
    return {
      id,
      title: `Anime ${id}`,
      image: `https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80`,
      category: "Action, Adventure",
      rating: "9.2",
      year: "2023",
      episodes: 12,
      similarAnime: generateSimilarAnime(id)
    };
  }, [allAnime]);
  
  const getSimilarAnime = useCallback((id: number): AnimeData[] => {
    return generateSimilarAnime(id);
  }, []);
  
  const isLoading = trendingLoading || popularLoading || seasonalLoading;
  
  return {
    trendingAnime,
    popularAnime,
    seasonalAnime,
    allAnime,
    isLoading,
    getAnimeById,
    getSimilarAnime
  };
};
