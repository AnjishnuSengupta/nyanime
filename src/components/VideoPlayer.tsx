import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, List, ServerIcon, Loader2, Video, Subtitles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { VideoSource, AniwatchTrack } from '../services/aniwatchApiService';
import { getProxiedStreamUrlSync } from '../services/streamProxyService';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface VideoPlayerProps {
  sources: VideoSource[];
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
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
  onNextEpisode,
  onPreviousEpisode,
  onEpisodeSelect,
  initialProgress: _initialProgress = 0,
  autoPlay: _autoPlay = true,
  onTimeUpdate,
  isLoading = false,
  error = null,
  getProxyUrl
}) => {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [isEpisodeListOpen, setIsEpisodeListOpen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(Math.floor((episodeNumber - 1) / 25));
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null); // null = off, string = language
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // HLS.js instance reference - type defined inline in initHlsPlayer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);
  
  // Get available subtitle tracks from current source
  const availableTracks: AniwatchTrack[] = React.useMemo(() => {
    const currentSource = sources[currentSourceIndex];
    return currentSource?.tracks || [];
  }, [sources, currentSourceIndex]);
  
  // Auto-select English subtitle if available
  useEffect(() => {
    if (availableTracks.length > 0 && selectedSubtitle === null) {
      const englishTrack = availableTracks.find(t => 
        t.lang.toLowerCase().includes('english') || t.lang.toLowerCase() === 'en'
      );
      if (englishTrack) {
        setSelectedSubtitle(englishTrack.lang);
      }
    }
  }, [availableTracks, selectedSubtitle]);
  
  // Initial progress handled by HLS player itself
  // useEffect(() => {
  //   if (initialProgress > 0 && playerRef.current && !hasSetInitialTime) {
  //     // HLS player handles this internally via localStorage
  //     setHasSetInitialTime(true);
  //   }
  // }, [initialProgress, hasSetInitialTime]);
  
  // Episode changes are handled by the HLS player iframe
  
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
      setCurrentSourceIndex(nextIndex);
      toast({
        title: "Auto-switching Source",
        description: `Source failed. Trying ${sortedSources[nextIndex].quality || 'next'} quality source...`,
        duration: 3000,
      });
    } else {
      toast({
        title: "Loading...",
        description: "Please refresh the browser or wait a moment and try again. The backend server may be waking up (Render free tier).",
        variant: "destructive",
        duration: 8000,
      });
    }
  }, [currentSourceIndex, sortedSources]);

  // Keep this for future use if needed
  const _handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    if (onTimeUpdate && state.playedSeconds > 0) {
      // Update every 10 seconds for better progress tracking
      if (Math.floor(state.playedSeconds) % 10 === 0) {
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

  // Listen for HLS fatal errors from the iframe and auto-switch to next server
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event?.data as unknown;
      if (!data || typeof data !== 'object') return;
      const payload = data as { type?: string; [k: string]: unknown };
      if (payload.type === 'HLS_FATAL') {
        // Don't use embed fallback (shows ads), try next source instead
        handleSourceError();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentSourceIndex, sortedSources.length, currentSource, handleSourceError]);

  // Handle subtitle selection - must be before early returns
  const handleSubtitleChange = useCallback((lang: string | null) => {
    setSelectedSubtitle(lang);
    
    // Update video text tracks
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (lang === null) {
          track.mode = 'disabled';
        } else if (track.language === lang || track.label === lang) {
          track.mode = 'showing';
        } else {
          track.mode = 'disabled';
        }
      }
    }
    
    toast({
      title: lang ? "Subtitles Enabled" : "Subtitles Disabled",
      description: lang ? `Switched to ${lang}` : "Subtitles turned off",
      duration: 2000,
    });
  }, []);

  // Initialize HLS player - must be before early returns
  const initHlsPlayer = useCallback((videoEl: HTMLVideoElement, sourceUrl: string) => {
    if (!videoEl) return;
    
    videoRef.current = videoEl;
    
    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Check for native HLS support (Safari)
    if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = sourceUrl;
      // Set initial position for Safari if provided
      if (_initialProgress > 0) {
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.currentTime = _initialProgress;
        }, { once: true });
      }
      return;
    }
    
    // Use HLS.js for other browsers
    interface HlsType {
      isSupported(): boolean;
      Events: { ERROR: string; MANIFEST_PARSED: string };
      ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
      new (config: Record<string, unknown>): {
        loadSource(url: string): void;
        attachMedia(el: HTMLVideoElement): void;
        on(event: string, cb: (event: string, data: Record<string, unknown>) => void): void;
        startLoad(): void;
        recoverMediaError(): void;
        destroy(): void;
      };
    }
    
    const initHls = (Hls: HlsType) => {
      if (!Hls.isSupported()) return;
      
      const hls = new Hls({
        // Improved settings for better stability
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000, // 60 MB
        maxBufferHole: 0.5,
        lowBufferWatchdogPeriod: 0.5,
        highBufferWatchdogPeriod: 3,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.25,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        enableWorker: true,
        startLevel: -1, // Auto quality
        // Error recovery settings
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 4,
        xhrSetup: (_xhr: XMLHttpRequest) => {
          // Proxy handles headers
        },
      });
      
      hlsRef.current = hls;
      hls.loadSource(sourceUrl);
      hls.attachMedia(videoEl);
      
      hls.on(Hls.Events.ERROR, (_event: string, data: Record<string, unknown>) => {
        console.warn('[HLS.js] Error:', data.type, data.details);
        
        if (data.fatal) {
          console.error('[HLS.js] Fatal error:', data);
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover from network error
              console.log('[HLS.js] Attempting network recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Try to recover from media error
              console.log('[HLS.js] Attempting media recovery...');
              hls.recoverMediaError();
              break;
            default:
              // Cannot recover, switch source
              handleSourceError();
              break;
          }
        }
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Set initial position if provided (for resume functionality)
        if (_initialProgress > 0) {
          videoEl.currentTime = _initialProgress;
        }
        
        videoEl.play().catch(() => {
          // Autoplay blocked, user needs to interact
        });
      });
    };
    
    // Check if HLS.js is already loaded
    if (typeof window !== 'undefined' && 'Hls' in window) {
      initHls((window as { Hls: HlsType }).Hls);
    } else {
      // Load HLS.js dynamically
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.12';
      script.onload = () => {
        initHls((window as unknown as { Hls: HlsType }).Hls);
      };
      document.head.appendChild(script);
    }
  }, [_initialProgress, handleSourceError]);

  // Cleanup HLS on unmount - must be before early returns
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Get proxied subtitle URL - must be before early returns
  const getProxiedSubtitleUrl = useCallback((url: string) => {
    // Subtitle files also need to be proxied for CORS
    return getProxiedStreamUrlSync(url, {});
  }, []);

  // Get source URL with proxy support for HLS streams
  const getSourceUrl = useCallback(() => {
    if (!currentSource) {
      return '';
    }
    
    // If custom proxy URL getter is provided, use it
    if (getProxyUrl) {
      return getProxyUrl();
    }
    
    const sourceUrl = currentSource.directUrl || currentSource.embedUrl || currentSource.url || '';
    
    // CRITICAL FIX: For HLS streams, proxy through our server or external CORS proxy
    // This handles both server deployments (with Express proxy) and static hosting
    if (sourceUrl && currentSource.type === 'hls' && sourceUrl.includes('.m3u8')) {
      // Use the stream proxy service which automatically detects the best proxy method
      const headers = currentSource.headers || {};
      return getProxiedStreamUrlSync(sourceUrl, headers);
    }
    
    return sourceUrl;
  }, [currentSource, getProxyUrl]);
  
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

  return (
    <div className="relative w-full bg-black overflow-hidden rounded-xl aspect-video group">
      {isHls ? (
        // Use native HTML5 video with HLS.js for M3U8 streams
        (() => {
          const sourceUrl = getSourceUrl();
          
          return (
            <>
              <video
                key={`${sourceUrl}-${currentSourceIndex}`}
                className="w-full h-full"
                controls
                autoPlay
                playsInline
                crossOrigin="anonymous"
                onTimeUpdate={(e) => {
                  if (onTimeUpdate) {
                    onTimeUpdate(e.currentTarget.currentTime);
                  }
                }}
                onError={handleSourceError}
                ref={(videoEl) => {
                  if (videoEl) {
                    initHlsPlayer(videoEl, sourceUrl);
                  }
                }}
              >
                <source src={sourceUrl} type="application/x-mpegURL" />
                {/* Render subtitle tracks */}
                {availableTracks.map((track, index) => (
                  <track
                    key={`${track.lang}-${index}`}
                    kind="subtitles"
                    src={getProxiedSubtitleUrl(track.url)}
                    srcLang={track.lang.toLowerCase().slice(0, 2)}
                    label={track.lang}
                    default={selectedSubtitle === track.lang}
                  />
                ))}
                Your browser does not support the video tag.
              </video>
              
              {/* Subtitle selector overlay */}
              {availableTracks.length > 0 && (
                <div className="absolute bottom-16 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="bg-black/70 hover:bg-black/90 text-white"
                      >
                        <Subtitles className="h-4 w-4 mr-1" />
                        {selectedSubtitle || 'Off'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-anime-dark border-anime-purple/50 max-h-64 overflow-y-auto">
                      <DropdownMenuLabel className="text-white">Subtitles</DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem
                        className={`text-white/70 hover:text-white hover:bg-white/10 cursor-pointer ${selectedSubtitle === null ? 'bg-anime-purple/20' : ''}`}
                        onClick={() => handleSubtitleChange(null)}
                      >
                        Off
                      </DropdownMenuItem>
                      {availableTracks.map((track, index) => (
                        <DropdownMenuItem
                          key={`sub-${track.lang}-${index}`}
                          className={`text-white/70 hover:text-white hover:bg-white/10 cursor-pointer ${selectedSubtitle === track.lang ? 'bg-anime-purple/20' : ''}`}
                          onClick={() => handleSubtitleChange(track.lang)}
                        >
                          {track.lang}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </>
          );
        })()
      ) : (
        <div className="flex items-center justify-center h-full bg-black/90">
          <div className="text-center p-6">
            <Video className="w-16 h-16 mx-auto mb-4 text-anime-purple" />
            <p className="text-white text-lg mb-2">Unable to load video player</p>
            <p className="text-gray-400 text-sm">Please try selecting a different source or episode</p>
          </div>
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