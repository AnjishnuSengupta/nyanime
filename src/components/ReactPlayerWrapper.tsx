import React, { useRef, useState, useEffect } from 'react';
import ReactPlayer from 'react-player';
import Hls from 'hls.js';
import { Loader2 } from 'lucide-react';

interface ReactPlayerWrapperProps {
  url: string;
  title?: string;
  isM3U8?: boolean;
  autoPlay?: boolean;
  onProgress?: (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => void;
  playerRef?: React.MutableRefObject<any>;
  sources?: Array<{
    id: string;
    quality: string | undefined;
    provider: string;
    url: string;
  }>;
  headers?: Record<string, string>;
  onChangeSource?: () => void;
}

const ReactPlayerWrapper: React.FC<ReactPlayerWrapperProps> = ({
  url,
  title,
  isM3U8,
  autoPlay = false,
  onProgress,
  playerRef: externalPlayerRef,
  sources,
  headers,
  onChangeSource
}) => {
  const internalPlayerRef = useRef<ReactPlayer | null>(null);
  const playerRef = externalPlayerRef || internalPlayerRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [hlsLoaded, setHlsLoaded] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  
  // Clean up HLS instance when component unmounts
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);
  
  // Reset error state when URL changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
    
    // Clean up previous HLS instance if URL changes
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      setHlsLoaded(false);
    }
  }, [url]);
  
  // HLS custom implementation for M3U8 files
  useEffect(() => {
    if (!isM3U8 || !url || hlsLoaded) return;
    
    const videoElement = containerRef.current?.querySelector('video');
    if (!videoElement) return;
    
    if (Hls.isSupported()) {
      try {
        const hls = new Hls({
          xhrSetup: (xhr, hlsUrl) => {
            if (headers) {
              Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
              });
            }
            // Add referer header to bypass provider restrictions
            xhr.setRequestHeader('Referer', 'https://gogoanimehd.io/');
          }
        });
        
        hls.loadSource(url);
        hls.attachMedia(videoElement);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (autoPlay) {
            videoElement.play().catch(err => console.error('Error auto-playing:', err));
          }
          setHlsLoaded(true);
          setIsLoading(false);
        });
        
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error('HLS fatal error:', data);
            setHasError(true);
            
            // Try to recover
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                // If all else fails, try changing source
                if (onChangeSource) {
                  onChangeSource();
                }
                break;
            }
          }
        });
        
        hlsRef.current = hls;
      } catch (error) {
        console.error('Error setting up HLS:', error);
        setHasError(true);
        if (onChangeSource) {
          onChangeSource();
        }
      }
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari, which has native HLS support
      videoElement.src = url;
      videoElement.addEventListener('loadedmetadata', () => {
        if (autoPlay) {
          videoElement.play().catch(err => console.error('Error auto-playing:', err));
        }
        setHlsLoaded(true);
        setIsLoading(false);
      });
      
      videoElement.addEventListener('error', () => {
        console.error('Error with native HLS playback');
        setHasError(true);
        if (onChangeSource) {
          onChangeSource();
        }
      });
    }
  }, [url, isM3U8, autoPlay, headers]);

  const handleReady = () => {
    setIsLoading(false);
  };

  const handleError = (error: any) => {
    console.error('React Player Error:', error);
    setHasError(true);
    
    // Try another source if available
    if (onChangeSource) {
      onChangeSource();
    }
  };

  // For non-HLS videos
  const playerConfig = {
    file: {
      forceVideo: true,
      attributes: {
        crossOrigin: "anonymous",
      },
      tracks: [],
      hlsOptions: {
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          }
          xhr.setRequestHeader('Referer', 'https://gogoanimehd.io/');
        }
      }
    }
  };

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-center">
            <Loader2 className="h-10 w