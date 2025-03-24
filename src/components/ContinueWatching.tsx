import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronRight, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { getUserData, removeFromWatchHistory } from '@/services/authService';
import { toast } from '@/hooks/use-toast';

interface WatchProgressItem {
  id: number;
  title: string;
  image: string;
  episode: number;
  totalEpisodes: number;
  progress: number; // 0-100
  timestamp: number; // Seconds where the user left off
  lastWatched: string;
}

const ContinueWatching = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [watchProgress, setWatchProgress] = useState<WatchProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const userIdFromStorage = localStorage.getItem('userId');
    setIsLoggedIn(!!userIdFromStorage);
    setUserId(userIdFromStorage);
    
    if (userIdFromStorage) {
      setIsLoading(true);
      
      getUserData(userIdFromStorage)
        .then(userData => {
          if (userData.history.length > 0) {
            const formattedWatchProgress: WatchProgressItem[] = userData.history.slice(0, 4).map(item => ({
              id: item.animeId,
              title: getAnimeTitleById(item.animeId),
              image: getAnimeImageById(item.animeId),
              episode: item.episodeId,
              totalEpisodes: getAnimeTotalEpisodesById(item.animeId),
              progress: item.progress,
              timestamp: item.timestamp,
              lastWatched: formatLastWatched(item.lastWatched)
            }));
            
            setWatchProgress(formattedWatchProgress);
          } else {
            setWatchProgress([]);
          }
        })
        .catch(error => {
          console.error('Error fetching watch history:', error);
          setWatchProgress([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const getAnimeTitleById = (id: number): string => {
    const titles: Record<number, string> = {
      3: "Jujutsu Kaisen",
      4: "My Hero Academia",
      16: "Solo Leveling",
      19: "Frieren: Beyond Journey's End"
    };
    return titles[id] || `Anime ${id}`;
  };

  const getAnimeImageById = (id: number): string => {
    const images: Record<number, string> = {
      3: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
      4: "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
      16: "https://cdn.myanimelist.net/images/anime/1270/139794l.jpg",
      19: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg"
    };
    return images[id] || `/placeholder.svg`;
  };

  const getAnimeTotalEpisodesById = (id: number): number => {
    const episodes: Record<number, number> = {
      3: 24,
      4: 25,
      16: 12,
      19: 28
    };
    return episodes[id] || 12;
  };

  const formatLastWatched = (date: Date): string => {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });
  };

  const handleRemoveItem = async (animeId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userId) {
      toast({
        title: "Error",
        description: "You must be logged in to remove items",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await removeFromWatchHistory(userId, animeId);
      setWatchProgress(prev => prev.filter(item => item.id !== animeId));
      
      toast({
        title: "Removed",
        description: "Item removed from your continue watching list",
      });
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: "Error",
        description: "Failed to remove item. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatTimeFromSeconds = (seconds: number): string => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

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
              key={`${item.id}-${item.episode}`}
              className="glass-card overflow-hidden rounded-xl transition-transform hover:scale-[1.02] cursor-pointer relative"
              onClick={() => navigate(`/anime/${item.id}/watch?episode=${item.episode}&t=${item.timestamp}`)}
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
                <div className="absolute top-2 right-2 flex space-x-2">
                  <Button 
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full bg-red-500/80 hover:bg-red-500"
                    onClick={(e) => handleRemoveItem(item.id, e)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full bg-anime-purple hover:bg-anime-purple/90"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/anime/${item.id}/watch?episode=${item.episode}&t=${item.timestamp}`);
                    }}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-3 pt-0">
                <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                  <span>{Math.round(item.progress)}% completed</span>
                  <span className="flex items-center">
                    <span className="mr-2">{formatTimeFromSeconds(item.timestamp)}</span>
                    <span>{item.lastWatched}</span>
                  </span>
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
