import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Settings, Maximize, 
         SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
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
import 'plyr/dist/plyr.css';

interface VideoPlayerProps {
  src: string;
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail?: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
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
  initialProgress = 0,
  autoPlay = false
}) => {
  const { elementRef } = usePlyr({
    autoplay: autoPlay,
    keyboard: { focused: true, global: true },
  });

  useEffect(() => {
    const video = elementRef.current;
    if (!video || !initialProgress) return;
    
    video.currentTime = initialProgress;
  }, [initialProgress]);

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
    </div>
  );
};

export default VideoPlayer;
