import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, List, ServerIcon, Loader2, Video, Subtitles, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { VideoSource, AniwatchTrack } from '../services/aniwatchApiService';
import { getProxiedStreamUrlSync } from '../services/streamProxyService';
import Hls from 'hls.js';
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
  const [subtitlesInitialized, setSubtitlesInitialized] = useState(false); // Track if we've auto-selected subtitles
  // Use ref for currentTime to avoid re-renders on every timeupdate (~4x/sec)
  const currentTimeRef = useRef(0);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [hlsInitialized, setHlsInitialized] = useState(false); // Prevent re-initialization
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // HLS.js instance reference
  const hlsRef = useRef<Hls | null>(null);
  // Flag to suppress native video errors while HLS.js is initializing
  const hlsActiveRef = useRef(false);
  // Track the current source URL to detect actual changes
  const currentSourceUrlRef = useRef<string>('');
  // Ref for initialProgress to avoid HLS re-init on prop changes
  const initialProgressRef = useRef(_initialProgress);
  initialProgressRef.current = _initialProgress;
  
  const EPISODES_PER_PAGE = 25;
  const totalPages = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);
  
  // Get available subtitle tracks from current source (exclude thumbnails)
  const availableTracks: AniwatchTrack[] = React.useMemo(() => {
    const currentSource = sources[currentSourceIndex];
    const tracks = currentSource?.tracks || [];
    return tracks.filter(t => {
      const lang = t.lang.toLowerCase();
      // Exclude thumbnail tracks and non-subtitle entries
      return lang !== 'thumbnails' && !t.url.includes('thumbnails');
    });
  }, [sources, currentSourceIndex]);
  
  // Get intro/outro data from current source
  const introData = React.useMemo(() => {
    const currentSource = sources[currentSourceIndex];
    return currentSource?.intro || null;
  }, [sources, currentSourceIndex]);
  
  const outroData = React.useMemo(() => {
    const currentSource = sources[currentSourceIndex];
    return currentSource?.outro || null;
  }, [sources, currentSourceIndex]);
  
  // Auto-select English subtitle when tracks become available
  useEffect(() => {
    if (availableTracks.length > 0 && !subtitlesInitialized) {
      // Find English track (check various formats)
      const englishTrack = availableTracks.find(t => {
        const lang = t.lang.toLowerCase();
        return lang.includes('english') || lang === 'en' || lang === 'eng';
      });
      
      if (englishTrack) {
        setSelectedSubtitle(englishTrack.lang);
        setSubtitlesInitialized(true);
      } else if (availableTracks.length > 0) {
        // If no English, select the first available track
        setSelectedSubtitle(availableTracks[0].lang);
        setSubtitlesInitialized(true);
      }
    }
  }, [availableTracks, subtitlesInitialized]);
  
  // Reset subtitle initialization when source changes
  useEffect(() => {
    setSubtitlesInitialized(false);
  }, [currentSourceIndex]);
  
  // Stable refs for intro/outro to avoid recreating the callback on every render
  const introDataRef = useRef(introData);
  introDataRef.current = introData;
  const outroDataRef = useRef(outroData);
  outroDataRef.current = outroData;

  // Check if we should show skip intro/outro buttons
  // Uses refs so the callback identity never changes
  const updateSkipButtons = useCallback((time: number) => {
    const intro = introDataRef.current;
    const outro = outroDataRef.current;
    if (intro) {
      const shouldShowIntro = time >= intro.start && time < intro.end;
      setShowSkipIntro(prev => prev !== shouldShowIntro ? shouldShowIntro : prev);
    } else {
      setShowSkipIntro(prev => prev ? false : prev);
    }
    
    if (outro) {
      const shouldShowOutro = time >= outro.start && time < outro.end;
      setShowSkipOutro(prev => prev !== shouldShowOutro ? shouldShowOutro : prev);
    } else {
      setShowSkipOutro(prev => prev ? false : prev);
    }
  }, []);
  
  // Apply subtitle track modes
  const applySubtitleMode = useCallback((subtitle: string | null) => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (subtitle === null) {
        track.mode = 'disabled';
      } else if (track.label === subtitle) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  }, []);

  // Listen for textTracks being added (they're registered asynchronously)
  // and re-apply subtitle selection when they become available
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Apply immediately for tracks already present
    applySubtitleMode(selectedSubtitle);

    // Also listen for tracks added after the initial render
    const onAddTrack = () => applySubtitleMode(selectedSubtitle);
    video.textTracks.addEventListener('addtrack', onAddTrack);
    return () => {
      video.textTracks.removeEventListener('addtrack', onAddTrack);
    };
  }, [selectedSubtitle, applySubtitleMode]);
  
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
    // Suppress native video errors while HLS.js is active
    // HLS.js handles its own error recovery
    if (hlsActiveRef.current) {
      console.log('[VideoPlayer] Suppressing native video error (HLS.js is active)');
      return;
    }
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
        title: "Playback Error",
        description: "All sources failed. Please try refreshing or selecting a different server.",
        variant: "destructive",
        duration: 5000,
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
  // Memoize isHls as a stable value to avoid HLS cleanup/re-init on transient re-renders
  const isHls = React.useMemo(() => {
    if (!currentSource) return false;
    return currentSource.type === 'hls' || (currentSource.directUrl || currentSource.embedUrl || currentSource.url || '').includes('.m3u8');
  }, [currentSource?.type, currentSource?.directUrl, currentSource?.embedUrl, currentSource?.url]);

  // Listen for HLS fatal errors and properly handle them
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event?.data as unknown;
      if (!data || typeof data !== 'object') return;
      const payload = data as { type?: string; [k: string]: unknown };
      if (payload.type === 'HLS_FATAL') {
        // Reset HLS active flag so handleSourceError isn't suppressed
        hlsActiveRef.current = false;
        // Clean up broken HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        currentSourceUrlRef.current = '';
        // Try next source
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

  // Handle skip intro
  const handleSkipIntro = useCallback(() => {
    if (videoRef.current && introData) {
      videoRef.current.currentTime = introData.end;
      setShowSkipIntro(false);
      toast({
        title: "Skipped Intro",
        duration: 1500,
      });
    }
  }, [introData]);

  // Handle skip outro (skip to next episode or end)
  const handleSkipOutro = useCallback(() => {
    if (outroData) {
      if (onNextEpisode && episodeNumber < totalEpisodes) {
        onNextEpisode();
        toast({
          title: "Playing Next Episode",
          duration: 1500,
        });
      } else if (videoRef.current) {
        // If no next episode, skip to end
        videoRef.current.currentTime = videoRef.current.duration || outroData.end;
        setShowSkipOutro(false);
      }
    }
  }, [outroData, onNextEpisode, episodeNumber, totalEpisodes]);

  // Get proxied subtitle URL - must be before early returns
  const getProxiedSubtitleUrl = useCallback((url: string) => {
    // Subtitle files also need to be proxied for CORS
    return getProxiedStreamUrlSync(url, {});
  }, []);

  // Raw CDN URL (before proxying)
  const rawStreamUrl = React.useMemo(() => {
    if (!currentSource) return '';
    return currentSource.directUrl || currentSource.embedUrl || currentSource.url || '';
  }, [currentSource]);

  // Primary source URL: use proxy for HLS streams.
  // The proxy runs on the SAME infrastructure as the scraper, so the IP matches
  // the token embedded in the M3U8 URL (tokens are often IP-bound).
  const sourceUrl = React.useMemo(() => {
    if (!currentSource) return '';
    if (getProxyUrl) return getProxyUrl();
    const url = rawStreamUrl;
    if (url && currentSource.type === 'hls' && url.includes('.m3u8')) {
      const headers = currentSource.headers || {};
      return getProxiedStreamUrlSync(url, headers);
    }
    return url;
  }, [currentSource, getProxyUrl, rawStreamUrl]);

  // Track whether we've already tried direct CDN as fallback
  const triedDirectRef = useRef(false);
  // Reset when source changes
  useEffect(() => { triedDirectRef.current = false; }, [sourceUrl]);
  
  // Initialize HLS using useEffect instead of ref callback to prevent Chromium loop issues
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !sourceUrl || !isHls) return;
    
    // Prevent re-initialization with the same source
    if (currentSourceUrlRef.current === sourceUrl && hlsRef.current) {
      console.log('[HLS] Same source, skipping re-initialization');
      return;
    }
    
    console.log('[HLS] Initializing with source:', sourceUrl.substring(0, 80) + '...');
    currentSourceUrlRef.current = sourceUrl;
    
    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    hlsActiveRef.current = false;
    
    // ALWAYS prefer HLS.js when it's supported (Chrome, Firefox, Edge, etc.)
    // Some Chromium browsers/extensions falsely report native HLS support via
    // canPlayType('application/vnd.apple.mpegurl'), but native playback fails
    // with proxied M3U8 because relative URLs aren't resolved correctly.
    // Only fall back to native HLS when HLS.js ISN'T supported (Safari/iOS).
    if (Hls.isSupported()) {
      console.log('[HLS] Using HLS.js (bundled)');
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 1.0,
        lowBufferWatchdogPeriod: 2,
        highBufferWatchdogPeriod: 5,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 10,
        maxFragLookUpTolerance: 0.5,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        enableWorker: true,
        startLevel: -1,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 10000,  // 10s — proxy should respond fast
        manifestLoadingMaxRetry: 2,     // Fewer retries, fast failover to fallback
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
      });
      
      hlsRef.current = hls;
      hlsActiveRef.current = true;
      
      console.log('[HLS] Loading via proxy:', sourceUrl.substring(0, 80) + '...');
      hls.loadSource(sourceUrl);
      hls.attachMedia(videoEl);
      
      // Track fatal recovery attempts to prevent infinite loops
      // IMPORTANT: Do NOT reset on FRAG_LOADED — that creates an infinite loop
      // where recovery→load one frag→reset counter→fail→recovery cycles forever.
      let fatalRecoveryAttempts = 0;
      const MAX_FATAL_RECOVERIES = 3;
      let fragParsingFatals = 0; // Track fragParsingError separately
      
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('[HLS.js] Error:', data.type, data.details);
        
        if (data.fatal) {
          fatalRecoveryAttempts++;
          
          // Track fragParsingError fatals specifically — recoverMediaError()
          // doesn't help when segments themselves are unparseable (HTML, wrong
          // format, etc.), so give up faster for this error type.
          if (data.details === 'fragParsingError') {
            fragParsingFatals++;
          }
          
          console.error(`[HLS.js] Fatal error (recovery ${fatalRecoveryAttempts}/${MAX_FATAL_RECOVERIES}):`, data.details);
          
          // ── Direct CDN fallback for manifestLoadError ──
          // If the proxy fails (CDN blocks data-center IPs), try loading
          // directly from CDN. Some CDNs send Access-Control-Allow-Origin: *
          // and the browser's residential IP + real TLS fingerprint may pass.
          // Trigger on FIRST manifestLoadError — CORS failures are instant,
          // no point waiting for more retries.
          if (
            data.details === 'manifestLoadError' &&
            !triedDirectRef.current &&
            rawStreamUrl &&
            rawStreamUrl.startsWith('http') &&
            rawStreamUrl !== sourceUrl
          ) {
            triedDirectRef.current = true;
            console.log('[HLS.js] Proxy failed — trying direct CDN load:', rawStreamUrl.substring(0, 80));
            
            // Destroy current HLS instance and create a fresh one with direct URL
            hls.destroy();
            hlsRef.current = null;
            
            const directHls = new Hls({
              maxBufferLength: 30,
              maxMaxBufferLength: 120,
              maxBufferSize: 120 * 1000 * 1000,
              maxBufferHole: 1.0,
              lowBufferWatchdogPeriod: 2,
              highBufferWatchdogPeriod: 5,
              nudgeOffset: 0.2,
              nudgeMaxRetry: 10,
              maxFragLookUpTolerance: 0.5,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 10,
              enableWorker: true,
              startLevel: -1,
              fragLoadingTimeOut: 20000,
              fragLoadingMaxRetry: 6,
              fragLoadingRetryDelay: 1000,
              manifestLoadingTimeOut: 10000,
              manifestLoadingMaxRetry: 2,
              levelLoadingTimeOut: 10000,
              levelLoadingMaxRetry: 3,
              // Strip Referer so CDN doesn't reject unfamiliar referers
              fetchSetup: (context, initParams) => {
                initParams.referrerPolicy = 'no-referrer';
                return new Request(context.url, initParams);
              },
            });
            
            hlsRef.current = directHls;
            hlsActiveRef.current = true;
            
            directHls.loadSource(rawStreamUrl);
            directHls.attachMedia(videoEl);
            
            let directFatals = 0;
            directHls.on(Hls.Events.ERROR, (_ev, d) => {
              if (d.fatal) {
                directFatals++;
                console.error(`[HLS.js/direct] Fatal:`, d.details);
                if (directFatals > 2) {
                  console.error('[HLS.js/direct] Direct CDN also failed — no more fallbacks');
                  window.postMessage({ type: 'HLS_FATAL', details: d.details }, '*');
                  return;
                }
                if (d.type === Hls.ErrorTypes.NETWORK_ERROR) directHls.startLoad();
                else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) directHls.recoverMediaError();
                else window.postMessage({ type: 'HLS_FATAL', details: d.details }, '*');
              }
            });
            
            directHls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('[HLS.js/direct] Manifest parsed via direct CDN — playback starting');
              if (initialProgressRef.current > 0) {
                videoEl.currentTime = initialProgressRef.current;
              }
              setHlsInitialized(true);
              videoEl.play().catch(() => {});
            });
            
            return; // Don't continue with normal recovery
          }
          
          if (fatalRecoveryAttempts > MAX_FATAL_RECOVERIES) {
            console.error('[HLS.js] Max recovery attempts reached, giving up');
            window.postMessage({ type: 'HLS_FATAL', details: data.details }, '*');
            return;
          }
          
          // fragParsingError: segment data is bad (HTML error page, wrong codec,
          // etc.) — recoverMediaError just resets the demuxer but the same bad
          // data will be fetched again. Give up after 1 attempt.
          if (data.details === 'fragParsingError' && fragParsingFatals > 1) {
            console.error('[HLS.js] Persistent fragParsingError — segments are unparseable, switching source');
            window.postMessage({ type: 'HLS_FATAL', details: data.details }, '*');
            return;
          }
          
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.log('[HLS.js] Attempting network recovery...');
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.log('[HLS.js] Attempting media recovery...');
            hls.recoverMediaError();
          } else {
            window.postMessage({ type: 'HLS_FATAL', details: data.details }, '*');
          }
        }
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLS.js] Manifest parsed, starting playback');
        if (initialProgressRef.current > 0) {
          videoEl.currentTime = initialProgressRef.current;
        }
        setHlsInitialized(true);
        videoEl.play().catch(() => {});
      });
      
      // Cleanup on unmount or source change
      return () => {
        hlsActiveRef.current = false;
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback: native HLS (Safari / iOS only — HLS.js is NOT supported there)
      console.log('[HLS] Using native HLS (Safari/iOS)');
      videoEl.src = sourceUrl;
      hlsActiveRef.current = true;
      if (initialProgressRef.current > 0) {
        const progress = initialProgressRef.current;
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.currentTime = progress;
        }, { once: true });
      }
      setHlsInitialized(true);
      videoEl.play().catch(() => {});
      return;
    } else {
      console.error('[HLS] Neither HLS.js nor native HLS is supported');
      return;
    }
  }, [sourceUrl, isHls]);
  
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
        <>
          <video
            className="w-full h-full"
            controls
            playsInline
            onTimeUpdate={(e) => {
              const time = e.currentTarget.currentTime;
              currentTimeRef.current = time;
              updateSkipButtons(time);
              if (onTimeUpdate) {
                onTimeUpdate(time);
              }
                }}
                onLoadedMetadata={() => {
                  // Re-apply subtitle mode after metadata is loaded
                  // (tracks may have been reset by the browser)
                  applySubtitleMode(selectedSubtitle);
                }}
                onError={handleSourceError}
                ref={videoRef}
              >
                {/* HLS.js handles source loading via loadSource() — no <source> tag needed.
                    Adding a <source> tag for HLS causes Chrome to fire premature errors
                    before HLS.js can initialize via MediaSource Extensions. */}
                {/* Render subtitle tracks — no 'default' attribute;
                    track.mode is managed by the addtrack listener + applySubtitleMode */}
                {availableTracks.map((track, index) => (
                  <track
                    key={`${track.lang}-${index}`}
                    kind="subtitles"
                    src={getProxiedSubtitleUrl(track.url)}
                    srcLang={track.lang.toLowerCase().slice(0, 2)}
                    label={track.lang}
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
                    <DropdownMenuContent className="bg-anime-dark border-anime-purple/50 max-h-[70vh] overflow-y-auto">
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
              
              {/* Skip Intro Button - shown during intro section */}
              {showSkipIntro && introData && (
                <div className="absolute bottom-20 sm:bottom-24 right-4 z-30 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Button
                    onClick={handleSkipIntro}
                    className="bg-white/90 hover:bg-white text-black font-semibold px-3 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg flex items-center gap-1.5 sm:gap-2 text-xs sm:text-base transition-all hover:scale-105 active:scale-95"
                  >
                    <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>Skip Intro</span>
                  </Button>
                </div>
              )}
              
              {/* Skip Outro / Next Episode Button - shown during outro section */}
              {showSkipOutro && outroData && (
                <div className="absolute bottom-20 sm:bottom-24 right-4 z-30 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Button
                    onClick={handleSkipOutro}
                    className="bg-anime-purple hover:bg-anime-purple/90 text-white font-semibold px-3 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg flex items-center gap-1.5 sm:gap-2 text-xs sm:text-base transition-all hover:scale-105 active:scale-95"
                  >
                    <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>
                      {episodeNumber < totalEpisodes ? 'Next Episode' : 'Skip Outro'}
                    </span>
                  </Button>
                </div>
              )}
            </>
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