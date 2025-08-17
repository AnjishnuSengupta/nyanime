import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { ChevronLeft, ChevronRight, List, ServerIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import ReactPlayerWrapper from './ReactPlayerWrapper';
import { VideoSource } from '../services/updatedAniwatchService';
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
  isLoading = false,
  error = null,
  getProxyUrl
}) => {
  console.log('🎬 VideoPlayer render - Props:', { 
    sourcesLength: sources?.length, 
    isLoading, 
    error, 
    title, 
    episodeNumber 
  });
  
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [isEpisodeListOpen, setIsEpisodeListOpen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(Math.floor((episodeNumber - 1) / 25));
  const [playProgress, setPlayProgress] = useState(initialProgress);
  const [useEmbedFallback, setUseEmbedFallback] = useState(false);
  const playerRef = useRef<ReactPlayer | null>(null);
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);

  // Sort sources by provider and quality
  const sortedSources = React.useMemo(() => (Array.isArray(sources) ? [...sources] : []), [sources]);
  
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
        description: `Using ${sortedSources[index].quality || 'default'} quality`,
        duration: 3000,
      });
    }
  };

  // Automatic source switching when current source fails
  const handleSourceError = React.useCallback(() => {
    const nextIndex = currentSourceIndex + 1;
    if (nextIndex < sortedSources.length) {
      console.log(`🔄 Source failed, switching to source ${nextIndex + 1}/${sortedSources.length}`);
      setCurrentSourceIndex(nextIndex);
      toast({
        title: "Auto-switching Source",
        description: `Source failed. Trying ${sortedSources[nextIndex].quality || 'next'} quality source...`,
        duration: 3000,
      });
    } else {
      toast({
        title: "All Sources Failed",
        description: "All available video sources have failed to load",
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [currentSourceIndex, sortedSources]);

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
  const isHls = currentSource?.type === 'hls' || (currentSource?.directUrl || currentSource?.embedUrl || currentSource?.url || '').includes('.m3u8');

  // Listen for HLS fatal errors from the iframe and auto-switch source
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event?.data as unknown;
      if (!data || typeof data !== 'object') return;
      const payload = data as { type?: string; [k: string]: unknown };
      if (payload.type === 'HLS_FATAL') {
        console.warn('📡 HLS fatal error received from iframe:', data);
        const referer = currentSource?.headers?.Referer || currentSource?.headers?.referer;
        if (referer && typeof referer === 'string') {
          // Try provider's own embed page as fallback
          setUseEmbedFallback(true);
        } else {
          // Otherwise auto-switch to next source
          handleSourceError();
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentSourceIndex, sortedSources.length, currentSource, handleSourceError]);

  // Reset embed fallback when source changes
  useEffect(() => {
    setUseEmbedFallback(false);
  }, [currentSourceIndex]);
  
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
    if (!currentSource) {
      console.log('🚨 VideoPlayer: No current source available');
      return '';
    }
    
    console.log('🎬 VideoPlayer: Current source:', currentSource);
    
    if (getProxyUrl) {
      const proxyUrl = getProxyUrl();
      console.log('🔗 VideoPlayer: Using proxy URL:', proxyUrl);
      return proxyUrl;
    }
    
    const finalUrl = currentSource.directUrl || currentSource.embedUrl || currentSource.url || '';
    console.log('🎯 VideoPlayer: Final video URL:', finalUrl);
    return finalUrl;
  };

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      {isHls ? (
        // Use local HLS iframe player to avoid client-side restricted Referer headers
        (() => {
          const referer = currentSource?.headers?.Referer || currentSource?.headers?.referer;
          if (useEmbedFallback && typeof referer === 'string') {
            // Provider embed fallback
            const embedSrc = referer;
            return (
              <iframe
                title={`${title} - Episode ${episodeNumber} (Embed)`}
                src={embedSrc}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer-when-downgrade"
              />
            );
          }
          const rawUrl = getSourceUrl();
          // Merge optional cookie from localStorage for Cloudflare/WAF protected hosts
          let mergedHeaders: Record<string, string> | undefined = currentSource?.headers ? { ...currentSource.headers } : undefined;
          try {
            const storedCookie = localStorage.getItem('nyanime.hlsCookie');
            if (storedCookie && typeof storedCookie === 'string' && storedCookie.trim()) {
              mergedHeaders = { ...(mergedHeaders || {}), Cookie: storedCookie.trim() };
              console.log('🍪 Injecting user-provided Cookie into HLS proxy headers');
            }
          } catch {/* ignore storage errors */}
          const headersB64 = mergedHeaders ? btoa(JSON.stringify(mergedHeaders)) : '';
          const proxied = `${window.location.origin}/stream?url=${encodeURIComponent(rawUrl)}${headersB64 ? `&h=${encodeURIComponent(headersB64)}` : ''}`;
          const iframeSrc = `${window.location.origin}/hls-player.html?url=${encodeURIComponent(proxied)}&autoplay=1&proxy=0`;
          return (
            <iframe
              title={`${title} - Episode ${episodeNumber}`}
              src={iframeSrc}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; picture-in-picture"
            />
          );
        })()
      ) : (
        <ReactPlayerWrapper 
          url={getSourceUrl()}
          title={`${title} - Episode ${episodeNumber}`}
          isM3U8={false}
          autoPlay={autoPlay}
          onProgress={handleProgress}
          playerRef={playerRef}
          sources={sortedSources.map((s, index) => ({
            id: `source-${index}`,
            quality: s.quality,
            provider: 'Aniwatch',
            url: s.directUrl || s.embedUrl || s.url || ''
          }))}
          headers={currentSource?.headers}
          onChangeSource={handleSourceError}
        />
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full h-8 px-3"
                  >
                    <ServerIcon className="h-4 w-4 mr-1" />
                    {currentSource?.type === 'hls' ? 'HLS Stream' : 'MP4 Stream'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="bg-black/90 backdrop-blur-sm border-anime-purple/50 text-white"
                  align="end"
                >
                  {sortedSources.map((source, index) => (
                    <DropdownMenuItem
                      key={`source-${index}`}
                      className={`text-white hover:bg-white/10 ${index === currentSourceIndex ? 'bg-anime-purple/20' : ''}`}
                      onClick={() => handleSourceChange(index)}
                    >
                      {source.quality || 'Default'} - {source.type === 'hls' ? 'HLS' : 'MP4'}
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