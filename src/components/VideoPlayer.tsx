
import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Settings, Maximize, 
         SkipForward, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { usePlyr } from '../hooks/usePlyr';
import { ScrollArea } from '@/components/ui/scroll-area';
import 'plyr/dist/plyr.css';

interface VideoPlayerProps {
  src: string;
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail?: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  initialProgress?: number;
  autoPlay?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title,
  episodeNumber,
  totalEpisodes,
  thumbnail,
  onNextEpisode,
  onPreviousEpisode,
  onEpisodeSelect,
  initialProgress = 0,
  autoPlay = false
}) => {
  const { elementRef } = usePlyr({
    autoplay: autoPlay,
    keyboard: { focused: true, global: true },
  });
  
  const [isEpisodeListOpen, setIsEpisodeListOpen] = useState(false);

  useEffect(() => {
    const video = elementRef.current;
    if (!video || !initialProgress) return;
    
    video.currentTime = initialProgress;
  }, [initialProgress]);

  const toggleEpisodeList = () => {
    setIsEpisodeListOpen(!isEpisodeListOpen);
  };

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      <video
        ref={elementRef}
        poster={thumbnail}
        className="w-full h-full"
        crossOrigin="anonymous"
        data-plyr-config={JSON.stringify({ title: `${title} - Episode ${episodeNumber}` })}
      >
        <source src={src} type="video/mp4" />
      </video>
      
      {/* Episode Navigation */}
      <div className="absolute top-4 left-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex justify-between">
          {onPreviousEpisode && episodeNumber > 1 && (
            <Button 
              variant="ghost" 
              className="text-white bg-black/50 hover:bg-black/70"
              onClick={onPreviousEpisode}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous Episode
            </Button>
          )}
          
          {onEpisodeSelect && (
            <Button
              variant="ghost"
              className="text-white bg-black/50 hover:bg-black/70 mx-auto"
              onClick={toggleEpisodeList}
            >
              <List className="h-4 w-4 mr-2" />
              Episodes List
            </Button>
          )}
          
          {onNextEpisode && episodeNumber < totalEpisodes && (
            <Button 
              variant="ghost" 
              className="text-white bg-black/50 hover:bg-black/70 ml-auto"
              onClick={onNextEpisode}
            >
              Next Episode
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Episode Selection Overlay */}
      {isEpisodeListOpen && onEpisodeSelect && (
        <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center p-6">
          <div className="glass-card w-full max-w-3xl max-h-[80vh] rounded-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="text-white text-lg font-semibold">Episodes - {title}</h3>
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10"
                onClick={toggleEpisodeList}
              >
                Close
              </Button>
            </div>
            
            <ScrollArea className="h-[60vh]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-4">
                {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map((ep) => (
                  <Button
                    key={ep}
                    variant={ep === episodeNumber ? "default" : "outline"}
                    className={`h-12 ${ep === episodeNumber ? 'bg-anime-purple' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                    onClick={() => {
                      onEpisodeSelect(ep);
                      setIsEpisodeListOpen(false);
                    }}
                  >
                    {ep}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
