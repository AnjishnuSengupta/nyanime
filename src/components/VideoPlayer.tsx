import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, List, ServerIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import ReactPlayerWrapper from './ReactPlayerWrapper';
import { VideoSource } from '../hooks/useVideoPlayer';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  getServerName: (provider: string) => string;
  isLoading?: boolean;
  error?: string | null;
  getProxyUrl?: () => string;
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
  autoPlay = true,
  onTimeUpdate,
  getServerName,
  isLoading = false,
  error = null,
  getProxyUrl
}) => {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [isEpisodeListOpen, setIsEpisodeListOpen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(Math.floor((episodeNumber - 1) / 25));
  const [playProgress, setPlayProgress] = useState(initialProgress);
  const playerRef = useRef<any>(null);
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);

  // Sort sources by provider and quality
  const sortedSources = Array.isArray(sources) ? [...sources] : [];
  
  // Effect to set the current page index when episode number changes
  useEffect(() => {
    setCurrentPageIndex(Math.floor((episodeNumber - 1) / EPISODES_PER_PAGE));
  }, [episodeNumber]);

  const getCurrentSource = () => {
    if (!sortedSources.length) return null;
    return sortedSources[currentSourceIndex];
  };

  const handleSourceChange = (index: number) => {
    if (index >= 0 && index < sortedSources.length) {
      setCurrentSourceIndex(index);
      toast({
        title: "Source Changed",
        description: `Using ${sortedSources[index].quality || 'default'} quality from ${getServerName(sortedSources[index].provider)}`,
        duration: 3000,
      });
    }
  };

  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    setPlayProgress(state.playedSeconds);
    
    if (onTimeUpdate && state.playedSeconds > 0) {
      // Only update every 5 seconds to avoid excessive updates
      if (Math.floor(state.playedSeconds) % 5 === 0) {
        onTimeUpdate(state.playedSeconds);
      }
    }
  };

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

  const currentSource = getCurrentSource();
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-anime-purple" />
          <p className="text-white text-lg">Loading video sources...</p>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (error || (!currentSource && sortedSources.length === 0)) {
    return (
      <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video flex items-center justify-center">
        <Alert className="max-w-lg bg-anime-dark/60 border-anime-purple text-white">
          <AlertTitle className="text-lg">Video Unavailable</AlertTitle>
          <AlertDescription className="text-md">
            {error || "No video sources available for this episode. Please try another server or episode."}
          </AlertDescription>
          <div className="mt-4">
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button 
                variant="outline"
                className="mr-2 border-anime-purple text-white"
                onClick={onPreviousEpisode}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous Episode
              </Button>
            )}
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button 
                variant="outline"
                className="border-anime-purple text-white"
                onClick={onNextEpisode}
              >
                Next Episode <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </Alert>
      </div>
    );
  }

  // Get source URL either from direct source or proxy URL function
  const getSourceUrl = () => {
    if (!currentSource) return '';
    
    if (getProxyUrl) {
      return getProxyUrl();
    }
    
    return currentSource.url;
  };

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      <ReactPlayerWrapper 
        url={getSourceUrl()}
        title={`${title} - Episode ${episodeNumber}`}
        isM3U8={currentSource?.isM3U8}
        autoPlay={autoPlay}
        onProgress={handleProgress}
        playerRef={playerRef}
        sources={sortedSources.map(s => ({
          id: s.id,
          quality: s.quality,
          provider: getServerName(s.provider),
          url: s.url
        }))}
        headers={currentSource?.headers}
        onChangeSource={() => {
          // Go to next source when current one fails
          const nextIndex = (currentSourceIndex + 1) % sortedSources.length;
          handleSourceChange(nextIndex);
        }}
      />
      
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full h-8 px-3"
                  >
                    <ServerIcon className="h-4 w-4 mr-1" />
                    {getServerName(currentSource?.provider || '')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="bg-black/90 backdrop-blur-sm border-anime-purple/50 text-white"
                  align="end"
                >
                  {sortedSources.map((source, index) => (
                    <DropdownMenuItem
                      key={source.id}
                      className={`text-white hover:bg-white/10 ${index === currentSourceIndex ? 'bg-anime-purple/20' : ''}`}
                      onClick={() => handleSourceChange(index)}
                    >
                      {source.quality || 'Default'} - {getServerName(source.provider)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      // Show all pages if total is less than 5
                      pageNum = i;
                    } else if (currentPageIndex < 3) {
                      // At the beginning
                      pageNum = i;
                    } else if (currentPageIndex > totalPages - 4) {
                      // At the end
                      pageNum = totalPages - 5 + i;
                    } else {
                      // In the middle
                      pageNum = currentPageIndex - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPageIndex === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`w-8 h-8 p-0 ${
                          currentPageIndex === pageNum 
                            ? 'bg-anime-purple' 
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                        }`}
                        onClick={() => goToPage(pageNum)}
                      >
                        {pageNum + 1}
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