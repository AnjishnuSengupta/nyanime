
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { getUserData } from '@/services/authService';

interface WatchProgressItem {
  id: number;
  title: string;
  image: string;
  episode: number;
  totalEpisodes: number;
  progress: number; // 0-100
  lastWatched: string;
}

const ContinueWatching = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [watchProgress, setWatchProgress] = useState<WatchProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in and fetch their watch history
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    setIsLoggedIn(!!userId);
    
    if (userId) {
      setIsLoading(true);
      
      // Fetch user data including watch history
      getUserData(userId)
        .then(userData => {
          // Convert user history to WatchProgressItem format
          const userWatchHistory = userData.history;
          
          // This would be a more complex transformation in real life
          // typically involving fetching anime details for each history item
          const formattedWatchProgress: WatchProgressItem[] = userWatchHistory.slice(0, 4).map(item => ({
            id: item.animeId,
            title: getAnimeTitleById(item.animeId),
            image: getAnimeImageById(item.animeId),
            episode: item.episodeId,
            totalEpisodes: getAnimeTotalEpisodesById(item.animeId),
            progress: item.progress,
            lastWatched: formatLastWatched(item.timestamp)
          }));
          
          setWatchProgress(formattedWatchProgress);
        })
        .catch(error => {
          console.error('Error fetching watch history:', error);
          // Fallback to demo data if there's an error
          setWatchProgress(getDemoWatchProgress());
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);
  
  // Helper function to get anime title by ID (would fetch from API in production)
  const getAnimeTitleById = (id: number): string => {
    const titles: Record<number, string> = {
      3: "Jujutsu Kaisen",
      4: "My Hero Academia",
      16: "Solo Leveling",
      19: "Frieren: Beyond Journey's End"
    };
    return titles[id] || `Anime ${id}`;
  };
  
  // Helper function to get anime image by ID (would fetch from API in production)
  const getAnimeImageById = (id: number): string => {
    const images: Record<number, string> = {
      3: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
      4: "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
      16: "https://cdn.myanimelist.net/images/anime/1270/139794l.jpg",
      19: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg"
    };
    return images[id] || `/placeholder.svg`;
  };
  
  // Helper function to get total episodes by ID (would fetch from API in production)
  const getAnimeTotalEpisodesById = (id: number): number => {
    const episodes: Record<number, number> = {
      3: 24,
      4: 25,
      16: 12,
      19: 28
    };
    return episodes[id] || 12;
  };
  
  // Helper function to format timestamp
  const formatLastWatched = (timestamp: Date): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });
  };
  
  // Demo data for new users or when API fails
  const getDemoWatchProgress = (): WatchProgressItem[] => {
    return [
      {
        id: 3,
        title: "Jujutsu Kaisen",
        image: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
        episode: 15,
        totalEpisodes: 24,
        progress: 75,
        lastWatched: "2 days ago"
      },
      {
        id: 4,
        title: "My Hero Academia",
        image: "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
        episode: 3,
        totalEpisodes: 25,
        progress: 32,
        lastWatched: "1 week ago"
      }
    ];
  };

  // If user is not logged in, loading, or has no watch progress, don't show the component
  if (!isLoggedIn || (watchProgress.length === 0 && !isLoading)) {
    return null;
  }

  return (
    <section className="py-6">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center">
            <div className="w-2 h-6 bg-anime-purple rounded-full mr-3"></div>
            <h2 className="text-xl font-semibold text-white">Continue Watching</h2>
          </div>
          <a href="/history" className="text-sm text-anime-purple flex items-center hover:underline">
            View All <ChevronRight className="h-4 w-4" />
          </a>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {watchProgress.map((item) => (
            <div 
              key={item.id}
              className="glass-card overflow-hidden rounded-xl transition-transform hover:scale-[1.02] cursor-pointer"
              onClick={() => navigate(`/anime/${item.id}`)}
            >
              <div className="relative h-32 overflow-hidden">
                <img 
                  src={item.image} 
                  alt={item.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h3 className="text-white font-medium text-sm line-clamp-1">{item.title}</h3>
                  <p className="text-white/70 text-xs">Episode {item.episode} of {item.totalEpisodes}</p>
                </div>
                <Button 
                  size="sm"
                  className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full bg-anime-purple hover:bg-anime-purple/90"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/anime/${item.id}/watch?episode=${item.episode}`);
                  }}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3 pt-0">
                <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                  <span>{Math.round(item.progress)}% completed</span>
                  <span>{item.lastWatched}</span>
                </div>
                <Progress value={item.progress} className="h-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContinueWatching;
