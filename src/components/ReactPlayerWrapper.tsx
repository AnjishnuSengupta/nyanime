
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { AlertCircle, Loader2, ExternalLink, ServerIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface ReactPlayerWrapperProps {
  url: string;
  title: string;
  isM3U8?: boolean;
  autoPlay?: boolean;
  onError?: () => void;
  onReady?: () => void;
  onProgress?: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void;
  onChangeSource?: () => void;
  sources?: Array<{id: string, quality?: string, url: string, provider: string}>;
}

const ReactPlayerWrapper: React.FC<ReactPlayerWrapperProps> = ({
  url,
  title,
  isM3U8 = false,
  autoPlay = true,
  onError,
  onReady,
  onProgress,
  onChangeSource,
  sources = []
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const maxRetries = 3;

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setRetryCount(0);
    
    // Log the URL we're trying to play
    console.log('ReactPlayerWrapper attempting to play:', url);
  }, [url]);

  const handleReady = () => {
    setIsLoading(false);
    if (onReady) onReady();
    console.log('ReactPlayer ready:', url);
    
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
      setRetryCount(prev => prev + 1);
      
      // Add a small delay before retrying
      setTimeout(() => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            if (player.load) player.load();
            else if (player.play) player.play();
          }
        }
      }, 1000);
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
    
    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        if (player.load) player.load();
        else if (player.play) player.play();
      }
    }
  };

  const handleSourceChange = (sourceId: string) => {
    if (onChangeSource) onChangeSource();
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
              {sources.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="border-anime-purple text-white">
                      <ServerIcon className="h-4 w-4 mr-2" />
                      Change Source
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-black/90 backdrop-blur-sm border-anime-purple/50 text-white">
                    {sources.map(source => (
                      <DropdownMenuItem 
                        key={source.id}
                        onClick={() => handleSourceChange(source.id)}
                      >
                        {source.quality || 'Default'} - {source.provider}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                className="border-anime-purple text-white"
                onClick={() => window.open(url, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Direct Link
              </Button>
            </div>
          </Alert>
        </div>
      ) : (
        <ReactPlayer
          ref={playerRef}
          url={url}
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
              forceHLS: isM3U8,
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
      )}
    </div>
  );
};

export default ReactPlayerWrapper;
