import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronRight, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { getUserData, removeFromHistory } from '@/services/firebaseAuthService';
import { fetchAnimeInfo } from '@/services/animeDataService';
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
  const [watchProgress, setWatchProgress] = useState<WatchProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId] = useState<string | null>(() => localStorage.getItem('userId'));
  const isLoggedIn = !!userId;

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

  const loadWatchHistory = async (userId: string) => {
    setIsLoading(true);
    
    try {
      // Try loading from Firebase first
      const userData = await getUserData(userId);
      
      let historyItems = [];
      
      // For logged-in users, ONLY use Firebase data (don't fall back to localStorage)
      // This prevents stale data from showing for new users
      if (userData && userData.history && userData.history.length > 0) {
        historyItems = userData.history;
      }
      
      if (historyItems.length === 0) {
        setWatchProgress([]);
        setIsLoading(false);
        return;
      }

      // Sort by most recent and take top 4
      const sortedHistory = [...historyItems]
        .sort((a, b) => {
          const timeA = a.lastWatched instanceof Date ? a.lastWatched.getTime() : new Date(a.lastWatched).getTime();
          const timeB = b.lastWatched instanceof Date ? b.lastWatched.getTime() : new Date(b.lastWatched).getTime();
          return timeB - timeA;
        })
        .slice(0, 4);

      // Fetch anime info for each history item
      const progressItems: WatchProgressItem[] = [];
      
      for (const historyItem of sortedHistory) {
        try {
          const animeInfo = await fetchAnimeInfo(historyItem.animeId);
          
          if (animeInfo) {
            progressItems.push({
              id: historyItem.animeId,
              title: animeInfo.title,
              image: animeInfo.image,
              episode: historyItem.episodeId,
              totalEpisodes: animeInfo.totalEpisodes || 12,
              progress: historyItem.progress,
              timestamp: historyItem.timestamp || 0,
              lastWatched: formatLastWatched(
                historyItem.lastWatched instanceof Date 
                  ? historyItem.lastWatched 
                  : new Date(historyItem.lastWatched)
              )
            });
          }
        } catch {
          // Silently skip failed anime info fetches
        }
      }

      setWatchProgress(progressItems);
    } catch {
      toast({
        title: "Error loading history",
        description: "Failed to load watch history",
        variant: "destructive"
      });
      setWatchProgress([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      (async () => {
        await loadWatchHistory(userId);
      })();
    } else {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
      // Remove from Firebase history
      await removeFromHistory(userId, animeId);
      
      // Update local state
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
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 bg-anime-purple rounded-full"></div>
            <h2 className="text-xl font-semibold text-white">Continue Watching</h2>
          </div>
          <button 
            onClick={() => navigate('/history')}
            className="text-sm text-anime-purple flex items-center hover:underline focus:outline-none"
          >
            See All <ChevronRight className="ml-1 w-4 h-4" />
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {watchProgress.map((item) => (
            <div 
              key={`${item.id}-${item.episode}`}
              className="glass-card group overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(147,51,234,0.3)] hover:border-anime-purple/50 cursor-pointer relative bg-white/5 border border-white/10"
              onClick={() => { navigate(`/anime/${item.id}/watch?episode=${item.episode}&t=${item.timestamp}`); }}
            >
              <div className="relative h-32 overflow-hidden">
                <img 
                  src={item.image} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h3 className="text-white font-medium text-sm line-clamp-1 group-hover:text-anime-purple transition-colors">{item.title}</h3>
                  <p className="text-white/70 text-xs mt-0.5">Episode {item.episode} of {item.totalEpisodes}</p>
                </div>
                
                {/* Overlay Action Buttons */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
                  <Button 
                    size="sm"
                    className="h-10 w-10 p-0 rounded-full bg-anime-purple hover:bg-anime-purple/90 shadow-[0_0_15px_rgba(147,51,234,0.5)] transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/anime/${item.id}/watch?episode=${item.episode}&t=${item.timestamp}`);
                    }}
                  >
                    <Play className="h-5 w-5 ml-1" />
                  </Button>
                </div>
                
                {/* Remove Button (Top Right) */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Button 
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full bg-red-500/80 hover:bg-red-500 backdrop-blur-md"
                    onClick={(e) => handleRemoveItem(item.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="p-3 pt-2 bg-gradient-to-b from-transparent to-black/20">
                <div className="flex items-center justify-between text-[11px] font-medium text-white/50 mb-2 uppercase tracking-wider">
                  <span className="text-anime-purple/90">{Math.round(item.progress)}% COMPLETED</span>
                  <span className="flex items-center">
                    <span className="mr-2">{formatTimeFromSeconds(item.timestamp)}</span>
                    <span>{item.lastWatched}</span>
                  </span>
                </div>
                <Progress value={item.progress} className="h-1.5 bg-white/10" indicatorClassName="bg-anime-purple shadow-[0_0_10px_rgba(147,51,234,0.8)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContinueWatching;
