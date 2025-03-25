
import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Settings, Maximize, 
         SkipForward, ChevronLeft, ChevronRight, List, AlertCircle } from 'lucide-react';
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
import { VideoSource } from '../services/videoSourceService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [isIframe, setIsIframe] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);

  // Sort sources by priority (working sources first, then by provider)
  const sortedSources = [...sources].sort((a, b) => {
    // First prioritize working sources
    if (a.isWorking === true && b.isWorking !== true) return -1;
    if (a.isWorking !== true && b.isWorking === true) return 1;
    
    // Special handling for Solo Leveling
    if (title.includes("Solo Leveling") || title.includes("Ore dake Level Up")) {
      if (a.provider.includes('zoro') || a.provider.includes('special')) return -1;
      if (b.provider.includes('zoro') || b.provider.includes('special')) return 1;
    }
    
    // Then prioritize by provider type
    const providerPriority: Record<string, number> = {
      'special': 1,
      'zoro': 2,
      'gogoanime': 3,
      'hls': 4,
      'vidsrc': 5,
      'animefox': 6,
      'vidstreaming': 7,
      'mp4upload': 8,
      'streamtape': 9,
      'doodstream': 10,
      'filemoon': 11,
      'backup': 12,
      'embed': 13,
      'search': 3, // Same priority as provider
      'multiple': 3, // Same priority as provider
      'dummy': 99,
      'error': 100
    };
    
    const getProviderBase = (provider: string) => {
      for (const key of Object.keys(providerPriority)) {
        if (provider.toLowerCase().includes(key.toLowerCase())) {
          return key;
        }
      }
      return 'other';
    };
    
    const aPriority = providerPriority[getProviderBase(a.provider)] || 50;
    const bPriority = providerPriority[getProviderBase(b.provider)] || 50;
    
    return aPriority - bPriority;
  });

  const getCurrentSource = () => {
    if (!sortedSources.length) return null;
    return sortedSources[currentSourceIndex];
  };

  const getCurrentSourceUrl = () => {
    const source = getCurrentSource();
    return source?.directUrl || '';
  };

  const getCurrentEmbedUrl = () => {
    const source = getCurrentSource();
    return source?.embedUrl || '';
  };
  
  const getCurrentSourceType = () => {
    const source = getCurrentSource();
    if (!source) return 'unknown';
    
    if (source.provider.includes('error') || source.provider.includes('dummy')) {
      return 'error';
    }
    return source.isWorking === false ? 'potentially-broken' : 'normal';
  };

  // Check if current source needs iframe embedding
  useEffect(() => {
    const source = getCurrentSource();
    setIsIframe(!!source?.embedUrl && !source?.directUrl);
    
    // Reset error state when changing sources
    setLoadError(false);
  }, [currentSourceIndex, sources]);

  // Handle source change for direct video
  useEffect(() => {
    if (!isIframe && sortedSources.length > 0 && playerRef.current) {
      const video = elementRef.current;
      if (video) {
        const currentTime = video.currentTime;
        const isPaused = video.paused;
        const directUrl = getCurrentSourceUrl();
        
        if (directUrl) {
          video.src = directUrl;
          video.load();
          
          // Preserve playback position and state
          video.addEventListener('loadedmetadata', function onLoad() {
            video.currentTime = currentTime;
            if (!isPaused) video.play();
            video.removeEventListener('loadedmetadata', onLoad);
          });
          
          // Handle video errors
          const handleError = () => {
            console.error('Video failed to load:', directUrl);
            setLoadError(true);
            
            // Try next source if available
            if (currentSourceIndex < sortedSources.length - 1) {
              setCurrentSourceIndex(currentSourceIndex + 1);
              toast({
                title: "Video Source Error",
                description: "Trying another source automatically",
                variant: "destructive",
              });
            }
          };
          
          video.addEventListener('error', handleError);
          
          return () => {
            video.removeEventListener('error', handleError);
          };
        }
      }
    }
  }, [currentSourceIndex, playerRef, elementRef, isIframe]);

  // Handle iframe load errors
  useEffect(() => {
    if (isIframe && getCurrentSourceType() === 'error') {
      setLoadError(true);
    }
  }, [isIframe, currentSourceIndex]);

  useEffect(() => {
    const video = elementRef.current;
    if (!video || !initialProgress || isIframe) return;
    
    video.currentTime = initialProgress;
  }, [initialProgress, elementRef, isIframe]);

  useEffect(() => {
    if (playerRef?.current && onTimeUpdate && !isIframe) {
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
  }, [playerRef, onTimeUpdate, addEventListener, removeEventListener, isIframe]);

  // Auto-retry logic for iframe loading
  useEffect(() => {
    if (loadError && isIframe && retryCount < 2) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        
        // Try next source
        if (currentSourceIndex < sortedSources.length - 1) {
          setCurrentSourceIndex(prev => prev + 1);
          setLoadError(false);
          toast({
            title: "Trying Another Source",
            description: "Automatically switching to another server",
            duration: 3000,
          });
        }
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [loadError, isIframe, retryCount, currentSourceIndex, sortedSources.length]);
  
  // Custom event listener for iframe communication
  useEffect(() => {
    const handleIframeError = (e: MessageEvent) => {
      if (e.data && e.data.type === 'player-error') {
        console.log('Received player error from iframe:', e.data);
        setLoadError(true);
        
        // Try next source
        if (currentSourceIndex < sortedSources.length - 1) {
          setCurrentSourceIndex(prev => prev + 1);
          setLoadError(false);
        }
      }
    };
    
    window.addEventListener('message', handleIframeError);
    return () => window.removeEventListener('message', handleIframeError);
  }, [currentSourceIndex, sortedSources.length]);

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
      setLoadError(false);
      toast({
        title: "Server Changed",
        description: `Switched to ${sortedSources[newIndex].quality || sortedSources[newIndex].provider} server`,
        duration: 3000,
      });
    }
  };
  
  const handleRetry = () => {
    // Reset error state
    setLoadError(false);
    
    // Force reload the current source
    if (isIframe) {
      // For iframes, we need to reset the source index to trigger a re-render
      const currentIdx = currentSourceIndex;
      setCurrentSourceIndex(-1);
      setTimeout(() => {
        setCurrentSourceIndex(currentIdx);
      }, 100);
    } else if (elementRef.current) {
      // For video elements, we can just reload
      const video = elementRef.current;
      const currentTime = video.currentTime;
      video.load();
      video.currentTime = currentTime;
      if (autoPlay) video.play();
    }
    
    toast({
      title: "Retrying Source",
      description: "Attempting to reload the current video source",
      duration: 3000,
    });
  };

  // Show error state if all sources are exhausted and nothing works
  const showFatalError = loadError && currentSourceIndex === sortedSources.length - 1 && retryCount >= 2;

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      {isIframe ? (
        <iframe 
          src={getCurrentEmbedUrl()}
          className="w-full h-full border-0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      ) : (
        <video
          ref={elementRef}
          poster={thumbnail}
          className="w-full h-full"
          crossOrigin="anonymous"
        >
          <source src={getCurrentSourceUrl()} type="video/mp4" />
        </video>
      )}
      
      {/* Error overlay */}
      {(loadError || showFatalError) && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 z-30">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h3 className="text-white text-xl font-bold mb-2">Playback Error</h3>
          <p className="text-white/70 text-center mb-6 max-w-md">
            {showFatalError 
              ? "We couldn't play this episode with any available source. This anime may not be available right now."
              : "This video source couldn't be loaded. Please try another server or retry."}
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="border-white/20 text-white hover:bg-white/10"
              onClick={handleRetry}
            >
              Retry
            </Button>
            
            {sortedSources.length > 1 && currentSourceIndex < sortedSources.length - 1 && (
              <Button 
                variant="default"
                className="bg-anime-purple hover:bg-anime-purple/90"
                onClick={() => {
                  setCurrentSourceIndex(prev => prev + 1);
                  setLoadError(false);
                }}
              >
                Try Next Server
              </Button>
            )}
            
            {onEpisodeSelect && (
              <Button
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={toggleEpisodeList}
              >
                Choose Episode
              </Button>
            )}
          </div>
          
          {/* Server selection when error occurs */}
          {sortedSources.length > 1 && (
            <div className="mt-6">
              <p className="text-white/50 text-sm mb-2">Or select another server:</p>
              <Select
                value={String(currentSourceIndex)}
                onValueChange={handleServerChange}
              >
                <SelectTrigger className="w-[200px] bg-black/50 border-white/20 text-white">
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
                        {source.quality || `${source.provider} ${index + 1}`}
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
        </div>
      )}
      
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
                          {source.quality || `${source.provider} ${index + 1}`}
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
      
      {/* Warning for potentially broken sources */}
      {getCurrentSourceType() === 'potentially-broken' && !loadError && (
        <div className="absolute bottom-14 left-0 right-0 px-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Alert variant="default" className="bg-orange-500/20 border-orange-400 backdrop-blur-sm text-xs py-1">
            <AlertCircle className="h-3 w-3 mr-2" />
            <AlertDescription>
              This source may not work reliably. If you encounter issues, try another server.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
