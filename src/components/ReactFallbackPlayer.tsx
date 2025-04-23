
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface ReactFallbackPlayerProps {
  url: string;
  title: string;
  autoPlay?: boolean;
  onError?: () => void;
  onReady?: () => void;
  onProgress?: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void;
}

const ReactFallbackPlayer: React.FC<ReactFallbackPlayerProps> = ({
  url,
  title,
  autoPlay = true,
  onError,
  onReady,
  onProgress
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(url);
  const playerRef = useRef<ReactPlayer | null>(null);
  const maxRetries = 5;

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setRetryCount(0);
    setCurrentUrl(url);
    
    // Log the URL we're trying to play
    console.log('ReactFallbackPlayer attempting to play:', url);
  }, [url]);
  
  // Add referrer to URLs to prevent being redirected to static sites
  const addReferrer = (originalUrl: string) => {
    if (originalUrl.includes('?')) {
      return `${originalUrl}&referer=https://anime-app.com`;
    }
    return `${originalUrl}?referer=https://anime-app.com`;
  };
  
  // Try with CORS proxy if regular URL fails
  const tryWithCorsProxy = (originalUrl: string) => {
    // Only apply CORS proxy if it's not already a proxied URL
    if (!originalUrl.includes('cors-proxy') && !originalUrl.includes('corsproxy.io')) {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
      console.log('Trying with CORS proxy:', proxyUrl);
      return proxyUrl;
    }
    return originalUrl;
  };

  const handleReady = () => {
    setIsLoading(false);
    if (onReady) onReady();
    console.log('ReactPlayer ready:', currentUrl);
    
    // Force play if autoplay is enabled
    if (autoPlay && playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player && player.play) {
        player.play().catch(err => {
          console.error('Autoplay failed:', err);
          // User may need to interact with the page first
          toast({
            title: "Autoplay Blocked",
            description: "Click on the player to start playback",
            duration: 5000,
          });
        });
      }
    }
  };

  const handleError = (error: any) => {
    console.error('ReactPlayer error:', error);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying playback (${retryCount + 1}/${maxRetries})...`);
      
      // Try multiple fallback approaches
      if (retryCount === 0) {
        // First try with referer parameter
        const urlWithReferer = addReferrer(url);
        if (urlWithReferer !== url) {
          setCurrentUrl(urlWithReferer);
          setRetryCount(prev => prev + 1);
          return;
        }
      } else if (retryCount === 1) {
        // Second try with CORS proxy
        const proxyUrl = tryWithCorsProxy(url);
        if (proxyUrl !== url) {
          setCurrentUrl(proxyUrl);
          setRetryCount(prev => prev + 1);
          return;
        }
      } else if (retryCount === 2) {
        // Third try: Try with our custom HLS player for m3u8 files
        if (url.toLowerCase().includes('.m3u8')) {
          const hlsPlayerUrl = `https://hls-player.lovable.app/?url=${encodeURIComponent(url)}&referer=https://anime-app.com&autoplay=1`;
          setCurrentUrl(hlsPlayerUrl);
          setRetryCount(prev => prev + 1);
          return;
        }
      } else if (retryCount === 3) {
        // Fourth retry: Try direct iframe embedding if it's an embed URL
        if (url.includes('embed') || url.includes('player')) {
          // Set iframe URL directly
          setCurrentUrl(url);
          setRetryCount(prev => prev + 1);
          return;
        }
      }
      
      // Otherwise increment retry counter and remount player
      setRetryCount(prev => prev + 1);
      
      // Force remount of player
      setCurrentUrl('');
      setTimeout(() => setCurrentUrl(url), 1000);
    } else {
      setIsLoading(false);
      setHasError(true);
      if (onError) onError();
      
      toast({
        title: "Playback Error",
        description: "Unable to play this video source. Please try another source.",
        variant: "destructive",
      });
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setRetryCount(0);
    setIsLoading(true);
    setCurrentUrl(url);
  };

  // Function to determine if the URL is from a specific provider
  const isYoutubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };
  
  const isM3u8Url = (url: string) => {
    return url.toLowerCase().includes('.m3u8');
  };
  
  const isEmbedUrl = (url: string) => {
    return url.includes('embed') || url.includes('player') || url.includes('iframe');
  };

  // Determine if we should use iframe for this URL
  const shouldUseIframe = () => {
    return isEmbedUrl(currentUrl) || currentUrl.includes('hls-player.lovable.app');
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-anime-purple" />
            <p className="text-white">Loading {title}...</p>
          </div>
        </div>
      )}
      
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
            <AlertCircle className="h-4 w-4 text-anime-purple" />
            <AlertTitle>Playback Failed</AlertTitle>
            <AlertDescription className="mb-3">
              We couldn't play this video source. Please try another source or try again later.
            </AlertDescription>
            <div className="flex gap-2">
              <Button 
                variant="default" 
                className="bg-anime-purple hover:bg-anime-purple/80"
                onClick={handleRetry}
              >
                Try Again
              </Button>
              {!isYoutubeUrl(url) && (
                <Button
                  variant="outline"
                  className="border-anime-purple text-white"
                  onClick={() => window.open(url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Direct Link
                </Button>
              )}
            </div>
          </Alert>
        </div>
      ) : shouldUseIframe() ? (
        // Use iframe for embed URLs or HLS player
        <iframe
          src={currentUrl}
          className="absolute top-0 left-0 w-full h-full border-0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          onLoad={() => setIsLoading(false)}
          referrerPolicy="origin"
        />
      ) : currentUrl ? (
        <ReactPlayer
          ref={playerRef}
          url={currentUrl}
          width="100%"
          height="100%"
          playing={autoPlay}
          controls={true}
          playsinline={true}
          onReady={handleReady}
          onError={handleError}
          onProgress={onProgress}
          onPlay={() => setIsLoading(false)}
          onBuffer={() => setIsLoading(true)}
          onBufferEnd={() => setIsLoading(false)}
          config={{
            file: {
              forceVideo: true,
              attributes: {
                crossOrigin: "anonymous",
                referrerPolicy: "origin"
              },
              // For m3u8 files, use hls.js
              forceFLV: false,
              forceHLS: isM3u8Url(currentUrl),
              hlsOptions: {
                maxBufferLength: 60,
                maxMaxBufferLength: 600,
                enableWorker: true
              }
            },
            youtube: {
              playerVars: {
                modestbranding: 1,
                rel: 0
              }
            }
          }}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      ) : null}
    </div>
  );
};

export default ReactFallbackPlayer;
