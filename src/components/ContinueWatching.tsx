
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface WatchProgressItem {
  id: number;
  title: string;
  image: string;
  episode: number;
  totalEpisodes: number;
  progress: number; // 0-100
  lastWatched: string;
}

// Mock data for continue watching
const mockWatchProgress: WatchProgressItem[] = [
  {
    id: 3,
    title: "Jujutsu Kaisen",
    image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80",
    episode: 15,
    totalEpisodes: 24,
    progress: 75,
    lastWatched: "2 days ago"
  },
  {
    id: 4,
    title: "My Hero Academia",
    image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80",
    episode: 3,
    totalEpisodes: 25,
    progress: 32,
    lastWatched: "1 week ago"
  },
  {
    id: 16,
    title: "Solo Leveling",
    image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=600&q=80&hue=240",
    episode: 8,
    totalEpisodes: 12,
    progress: 45,
    lastWatched: "3 days ago"
  },
  {
    id: 19,
    title: "Frieren: Beyond Journey's End",
    image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=600&q=80&hue=240",
    episode: 20,
    totalEpisodes: 28,
    progress: 90,
    lastWatched: "Yesterday"
  }
];

const ContinueWatching = () => {
  const navigate = useNavigate();

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
          {mockWatchProgress.map((item) => (
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
