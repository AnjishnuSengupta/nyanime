import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface VideoSource {
  id: string;
  quality: string;
  provider: string;
  url: string;
}

interface ReactPlayerWrapperProps {
  url: string;
  title: string;
  isM3U8?: boolean;
  autoPlay?: boolean;
  onProgress?: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void;
  playerRef?: React.MutableRefObject<ReactPlayer | null>;
  sources?: VideoSource[];
  headers?: Record<string, string>;
  onChangeSource?: () => void;
}

const ReactPlayerWrapper: React.FC<ReactPlayerWrapperProps> = ({
  url,
  title,
  isM3U8 = false,
  autoPlay = true,
  onProgress,
  playerRef,
  sources = [],
  headers = {},
  onChangeSource
}) => {
  console.log('🎥 ReactPlayerWrapper render - URL:', url, 'isM3U8:', isM3U8);
  
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const internalPlayerRef = useRef<ReactPlayer | null>(null);
  
  // Use provided ref or internal ref
  const actualPlayerRef = playerRef || internalPlayerRef;

  useEffect(() => {
    console.log('🔄 ReactPlayerWrapper: URL changed to:', url);
    setIsLoading(true);
    setHasError(false);
    setRetryCount(0);
    
    // If no URL, set error immediately
    if (!url) {
      console.log('❌ ReactPlayerWrapper: No URL provided');
      setIsLoading(false);
      setHasError(true);
    }
  }, [url]);

  const handleReady = () => {
    console.log('ReactPlayer ready:', url);
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = (error: Error | string | unknown) => {
    console.error('ReactPlayer error:', error);
    setIsLoading(false);
    setHasError(true);
    
    // Try to switch to next source if available
    if (retryCount < 2 && onChangeSource) {
      console.log('Retrying with next source...');
      setRetryCount(prev => prev + 1);
      onChangeSource();
    }
  };

  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    if (onProgress) {
      onProgress(state);
    }
  };

  // Configure player config with headers for HLS streams
  const playerConfig = {
    file: {
      attributes: {
        crossOrigin: 'anonymous',
      },
      hlsOptions: {
        xhrSetup: function(xhr: XMLHttpRequest, url: string) {
          // Apply headers for HLS requests
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          }
        }
      }
    }
  };

  if (hasError || !url) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        <Alert className="max-w-md bg-red-900/20 border-red-500">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-white">
            {!url ? 'No video URL available' : 'Failed to load video.'} 
            {sources.length > 1 && onChangeSource && (
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-2"
                onClick={onChangeSource}
              >
                Try Next Source
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-white" />
          <p className="text-white">Loading video...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-black">
      <ReactPlayer
        ref={actualPlayerRef}
        url={url}
        width="100%"
        height="100%"
        playing={autoPlay}
        controls={true}
        onReady={handleReady}
        onError={handleError}
        onProgress={handleProgress}
        config={playerConfig}
        style={{
          backgroundColor: 'black'
        }}
      />
    </div>
  );
};

export default ReactPlayerWrapper;
