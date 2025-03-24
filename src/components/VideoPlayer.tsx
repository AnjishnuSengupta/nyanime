
import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Settings, Maximize, 
         SkipForward, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { usePlyr } from '../hooks/usePlyr';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VideoSource } from '../services/videoSourceService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import 'plyr/dist/plyr.css';

interface VideoPlayerProps {
  sources: VideoSource[];
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail?: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  initialProgress?: number;
  autoPlay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  sources,
  title,
  episodeNumber,
  totalEpisodes,
  thumbnail,
  onNextEpisode,
  onPreviousEpisode,
  onEpisodeSelect,
  initialProgress = 0,
  autoPlay = false,
  onTimeUpdate
}) => {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const { elementRef, playerRef, addEventListener, removeEventListener } = usePlyr({
    autoplay: autoPlay,
    keyboard: { focused: true, global: true },
  });
  
  const [isEpisodeListOpen, setIsEpisodeListOpen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(Math.floor((episodeNumber - 1) / 25));
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);

  // Sort sources by priority (working sources first, then by provider)
  const sortedSources = [...sources].sort((a, b) => {
    // First prioritize working sources
    if (a.isWorking === true && b.isWorking !== true) return -1;
    if (a.isWorking !== true && b.isWorking === true) return 1;
    
    // Then prioritize by provider type
    const providerPriority: Record<string, number> = {
      'vidsrc': 1,
      'hls': 2,
      'scraped': 3,
      'gogoanime': 4,
      'zoro': 5,
      'animepahe': 6,
      'vidstreaming': 7,
      'mp4upload': 8,
      'streamtape': 9,
      'doodstream': 10,
      'filemoon': 11
    };
    
    return (providerPriority[a.provider] || 99) - (providerPriority[b.provider] || 99);
  });

  const getCurrentSource = () => {
    if (!sortedSources.length) return null;
    return sortedSources[currentSourceIndex];
  };

  const getCurrentSourceUrl = () => {
    const source = getCurrentSource();
    return source?.directUrl || '';
  };

  // Handle source change
  useEffect(() => {
    if (sortedSources.length > 0 && playerRef.current) {
      const video = elementRef.current;
      if (video) {
        const currentTime = video.currentTime;
        const isPaused = video.paused;
        
        video.src = getCurrentSourceUrl();
        video.load();
        
        // Preserve playback position and state
        video.addEventListener('loadedmetadata', function onLoad() {
          video.currentTime = currentTime;
          if (!isPaused) video.play();
          video.removeEventListener('loadedmetadata', onLoad);
        });
      }
    }
  }, [currentSourceIndex, playerRef, elementRef]);

  useEffect(() => {
    const video = elementRef.current;
    if (!video || !initialProgress) return;
    
    video.currentTime = initialProgress;
  }, [initialProgress, elementRef]);

  useEffect(() => {
    if (playerRef?.current && onTimeUpdate) {
      const player = playerRef.current;
      
      const handleTimeUpdate = () => {
        const currentTime = (player as any).currentTime;
        if (currentTime > 0) {
          onTimeUpdate(currentTime);
        }
      };
      
      const intervalId = setInterval(handleTimeUpdate, 5000);
      
      addEventListener('pause', handleTimeUpdate);
      
      return () => {
        clearInterval(intervalId);
        removeEventListener('pause', handleTimeUpdate);
        handleTimeUpdate();
      };
    }
  }, [playerRef, onTimeUpdate, addEventListener, removeEventListener]);

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
  
  const handleServerChange = (value: string) => {
    const newIndex = parseInt(value);
    if (!isNaN(newIndex) && newIndex >= 0 && newIndex < sortedSources.length) {
      setCurrentSourceIndex(newIndex);
      toast({
        title: "Server Changed",
        description: `Switched to ${sortedSources[newIndex].quality || sortedSources[newIndex].provider} server`,
        duration: 3000,
      });
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
        <source src={getCurrentSourceUrl()} type="video/mp4" />
      </video>
      
      {/* Top navigation controls */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-2">
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button 
                variant="ghost" 
                className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full h-8 px-3"
                onClick={onPreviousEpisode}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
          </div>
          
          <div className="flex-1 text-center">
            <span className="text-white font-medium text-sm bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
              {title} - Episode {episodeNumber}/{totalEpisodes}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Server selection dropdown */}
            {sortedSources.length > 1 && (
              <div className="relative z-50">
                <Select
                  value={String(currentSourceIndex)}
                  onValueChange={handleServerChange}
                >
                  <SelectTrigger className="w-[140px] h-8 text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm text-xs">
                    <SelectValue placeholder="Select Server" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedSources.map((source, index) => (
                      <SelectItem 
                        key={source.id} 
                        value={String(index)}
                        className="flex items-center"
                      >
                        <span className="flex items-center">
                          {source.quality || `Server ${index + 1}`}
                          {source.isWorking === true && (
                            <span className="ml-2 w-2 h-2 bg-green-500 rounded-full"></span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button 
                variant="ghost" 
                className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full h-8 px-3"
                onClick={onNextEpisode}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            
            {onEpisodeSelect && (
              <Button
                variant="ghost"
                className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full h-8 px-3"
                onClick={toggleEpisodeList}
              >
                <List className="h-4 w-4 mr-1" />
                Episodes
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Episode selection overlay */}
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
            
            {/* Pagination for large series */}
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
                
                <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar max-w-[50%]">
                  {(() => {
                    const pageButtons = [];
                    const maxVisiblePages = 5;
                    
                    if (totalPages <= maxVisiblePages) {
                      // Show all pages if total is less than max visible
                      for (let i = 0; i < totalPages; i++) {
                        pageButtons.push(
                          <Button
                            key={i}
                            variant={currentPageIndex === i ? "default" : "outline"}
                            size="sm"
                            className={`w-8 h-8 p-0 ${
                              currentPageIndex === i 
                                ? 'bg-anime-purple' 
                                : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                            }`}
                            onClick={() => goToPage(i)}
                          >
                            {i + 1}
                          </Button>
                        );
                      }
                    } else {
                      // Show pagination with ellipsis for large series
                      const showFirst = currentPageIndex > 1;
                      const showLast = currentPageIndex < totalPages - 2;
                      
                      // First page
                      if (showFirst) {
                        pageButtons.push(
                          <Button
                            key={0}
                            variant={currentPageIndex === 0 ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0 bg-white/5 border-white/10 text-white hover:bg-white/10"
                            onClick={() => goToPage(0)}
                          >
                            1
                          </Button>
                        );
                        
                        // Ellipsis after first page
                        if (currentPageIndex > 2) {
                          pageButtons.push(
                            <span key="ellipsis1" className="text-white/50">...</span>
                          );
                        }
                      }
                      
                      // Current page and neighbors
                      const start = Math.max(showFirst ? currentPageIndex - 1 : 0, 0);
                      const end = Math.min(showLast ? currentPageIndex + 1 : totalPages - 1, totalPages - 1);
                      
                      for (let i = start; i <= end; i++) {
                        pageButtons.push(
                          <Button
                            key={i}
                            variant={currentPageIndex === i ? "default" : "outline"}
                            size="sm"
                            className={`w-8 h-8 p-0 ${
                              currentPageIndex === i 
                                ? 'bg-anime-purple' 
                                : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                            }`}
                            onClick={() => goToPage(i)}
                          >
                            {i + 1}
                          </Button>
                        );
                      }
                      
                      // Ellipsis before last page
                      if (showLast && currentPageIndex < totalPages - 3) {
                        pageButtons.push(
                          <span key="ellipsis2" className="text-white/50">...</span>
                        );
                      }
                      
                      // Last page
                      if (showLast) {
                        pageButtons.push(
                          <Button
                            key={totalPages - 1}
                            variant={currentPageIndex === totalPages - 1 ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0 bg-white/5 border-white/10 text-white hover:bg-white/10"
                            onClick={() => goToPage(totalPages - 1)}
                          >
                            {totalPages}
                          </Button>
                        );
                      }
                    }
                    
                    return pageButtons;
                  })()}
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
            
            {/* Jump to range for very large series */}
            {totalEpisodes > 100 && (
              <div className="px-4 py-2 border-b border-white/10 bg-anime-dark/20">
                <p className="text-white/70 text-sm mb-2">Jump to episode range:</p>
                <ScrollArea className="h-10">
                  <div className="flex space-x-2">
                    {Array.from({ length: Math.ceil(totalEpisodes / 100) }, (_, i) => i).map((rangeIndex) => {
                      const startEp = rangeIndex * 100 + 1;
                      const endEp = Math.min(startEp + 99, totalEpisodes);
                      const targetPage = Math.floor((startEp - 1) / EPISODES_PER_PAGE);
                      
                      return (
                        <Button
                          key={rangeIndex}
                          variant="outline" 
                          size="sm"
                          className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-8"
                          onClick={() => goToPage(targetPage)}
                        >
                          {startEp}-{endEp}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            <ScrollArea className="h-[60vh]">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 p-4">
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
