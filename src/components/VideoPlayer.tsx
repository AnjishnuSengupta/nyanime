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
  const [currentPageIndex, setCurrentPageIndex] = useState(Math.floor((episodeNumber - 1) / 25));
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);

  useEffect(() => {
    const video = elementRef.current;
    if (!video || !initialProgress) return;
    
    video.currentTime = initialProgress;
  }, [initialProgress]);

  const toggleEpisodeList = () => {
    setIsEpisodeListOpen(!isEpisodeListOpen);
    
    if (!isEpisodeListOpen) {
      setCurrentPageIndex(Math.floor((episodeNumber - 1) / EPISODES_PER_PAGE));
    }
  };

  const getEpisodesForCurrentPage = () => {
    const startEpisode = currentPageIndex * EPISODES_PER_PAGE + 1;
    const endEpisode = Math.min(startEpisode + EPISODES_PER_PAGE - 1, totalEpisodes);
    
    return Array.from(
      { length: endEpisode - startEpisode + 1 }, 
      (_, i) => startEpisode + i
    );
  };

  const goToNextPage = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const goToPage = (pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < totalPages) {
      setCurrentPageIndex(pageIndex);
    }
  };

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      <video
        ref={elementRef}
        poster={thumbnail}
        className="w-full h-full"
        crossOrigin="anonymous"
      >
        <source src={src} type="video/mp4" />
      </video>
      
      <div className="absolute top-0 left-0 right-0 p-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
          {onPreviousEpisode && episodeNumber > 1 && (
            <Button 
              variant="ghost" 
              className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm"
              onClick={onPreviousEpisode}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous Episode
            </Button>
          )}
          
          {onEpisodeSelect && (
            <Button
              variant="ghost"
              className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm"
              onClick={toggleEpisodeList}
            >
              <List className="h-4 w-4 mr-2" />
              Episodes List ({episodeNumber}/{totalEpisodes})
            </Button>
          )}
          
          {onNextEpisode && episodeNumber < totalEpisodes && (
            <Button 
              variant="ghost" 
              className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm"
              onClick={onNextEpisode}
            >
              Next Episode
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {isEpisodeListOpen && onEpisodeSelect && (
        <div className="absolute inset-0 bg-black/90 z-20 flex items-center justify-center p-6">
          <div className="glass-card w-full max-w-3xl max-h-[80vh] rounded-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="text-white text-lg font-semibold">Episodes - {title}</h3>
              <div className="flex items-center gap-2">
                {totalPages > 1 && (
                  <span className="text-white/70 text-sm">
                    Page {currentPageIndex + 1} of {totalPages}
                  </span>
                )}
                <Button 
                  variant="ghost" 
                  className="text-white hover:bg-white/10"
                  onClick={toggleEpisodeList}
                >
                  Close
                </Button>
              </div>
            </div>
            
            {totalEpisodes > EPISODES_PER_PAGE && (
              <div className="flex justify-between items-center p-2 border-b border-white/10 bg-anime-dark/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:bg-white/10"
                  onClick={goToPreviousPage}
                  disabled={currentPageIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageToShow;
                    if (totalPages <= 5) {
                      pageToShow = i;
                    } else if (currentPageIndex < 2) {
                      pageToShow = i;
                    } else if (currentPageIndex > totalPages - 3) {
                      pageToShow = totalPages - 5 + i;
                    } else {
                      pageToShow = currentPageIndex - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageToShow}
                        variant={currentPageIndex === pageToShow ? "default" : "outline"}
                        size="sm"
                        className={`w-8 h-8 p-0 ${
                          currentPageIndex === pageToShow 
                            ? 'bg-anime-purple' 
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                        }`}
                        onClick={() => goToPage(pageToShow)}
                      >
                        {pageToShow + 1}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:bg-white/10"
                  onClick={goToNextPage}
                  disabled={currentPageIndex === totalPages - 1}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
            
            <ScrollArea className="h-[60vh]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-4">
                {getEpisodesForCurrentPage().map((ep) => (
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
