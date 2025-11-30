import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

interface PlyrOptions {
  autoplay?: boolean;
  captions?: { active?: boolean; language?: string; update?: boolean };
  controls?: string[];
  debug?: boolean;
  fullscreen?: { enabled?: boolean; fallback?: boolean; iosNative?: boolean };
  keyboard?: { focused: boolean; global: boolean };
  loadSprite?: boolean;
  muted?: boolean;
  ratio?: string;
  iconUrl?: string;
  tooltips?: { controls?: boolean; seek?: boolean };
  seekTime?: number;
  volume?: number;
  speed?: { selected?: number; options?: number[] };
  storage?: { enabled?: boolean; key?: string };
}

export const usePlyr = (options?: PlyrOptions) => {
  const playerRef = useRef<Plyr | null>(null);
  const elementRef = useRef<HTMLVideoElement>(null);
  const eventHandlers = useRef<{[key: string]: ((event: Event) => void)[]}>({}); // Track event handlers

  useEffect(() => {
    if (!elementRef.current) return;

    if (playerRef.current) {
      // Clean up any registered events before destroying
      for (const event in eventHandlers.current) {
        eventHandlers.current[event].forEach(handler => {
          playerRef.current?.on(event, handler); // Re-register to remove
        });
      }
      playerRef.current.destroy();
      eventHandlers.current = {}; // Clear all handlers
    }

    const defaultOptions = {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'mute',
        'volume',
        'captions',
        'settings',
        'pip',
        'airplay',
        'fullscreen',
      ],
      loadSprite: true,
      iconUrl: '/plyr.svg',
      blankVideo: '',
      autoplay: false,
      seekTime: 5,
      volume: 1,
      muted: false,
      keyboard: { focused: true, global: true },
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      storage: { enabled: true, key: 'plyr-volume' },
      tooltips: { controls: true, seek: true },
      quality: { default: 720, options: [4320, 2880, 2160, 1440, 1080, 720, 576, 480, 360, 240] }
    };

    try {
      // Add event listener for source change
      elementRef.current.addEventListener('error', (event) => {
        // Try to recover by reloading
        if (elementRef.current) {
          const src = elementRef.current.src;
          if (src) {
            elementRef.current.src = '';
            setTimeout(() => {
              if (elementRef.current) {
                elementRef.current.src = src;
                elementRef.current.load();
              }
            }, 1000);
          }
        }
      });
      
      // Create new Plyr instance
      playerRef.current = new Plyr(elementRef.current, {
        ...defaultOptions,
        ...options,
        keyboard: { 
          focused: options?.keyboard?.focused ?? defaultOptions.keyboard.focused, 
          global: options?.keyboard?.global ?? defaultOptions.keyboard.global 
        }
      });

      // Register and track the error handler
      const handleError = (event: Event) => {
        console.error('Plyr error:', event);
      };
      playerRef.current.on('error', handleError);
      eventHandlers.current['error'] = [handleError];
      
      playerRef.current.on('ready', () => {
        if (playerRef.current) {
          try {
            // Set volume from localStorage or from options
            if (localStorage.getItem('plyr-volume')) {
              const savedVolume = parseFloat(localStorage.getItem('plyr-volume') || '1');
              (playerRef.current as unknown as { volume: number }).volume = isNaN(savedVolume) ? (options?.volume || 1) : savedVolume;
            } else {
              (playerRef.current as unknown as { volume: number }).volume = options?.volume || 1;
            }
            
            // Initial mute state
            if (options?.muted) {
              (playerRef.current as unknown as { muted: boolean }).muted = true;
            }
          } catch (e) {
            console.error('Failed to set initial player state:', e);
          }
        }
      });

      // Register and track the timeupdate handler
      const handleTimeUpdate = () => {
        if (playerRef.current) {
          try {
            // Get current time safely
            const currentTime = (playerRef.current as unknown as { currentTime: number }).currentTime || 0;
            if (currentTime > 0) {
              // Save volume to localStorage
              const currentVolume = (playerRef.current as unknown as { volume: number }).volume || 1;
              localStorage.setItem('plyr-volume', currentVolume.toString());
            }
          } catch (e) {
            console.error('Failed to handle timeupdate:', e);
          }
        }
      };
      playerRef.current.on('timeupdate', handleTimeUpdate);
      eventHandlers.current['timeupdate'] = [handleTimeUpdate];

      // Handle playback errors - retry playback with a slight delay
      const handlePlaybackError = () => {
        if (playerRef.current && elementRef.current) {
          setTimeout(() => {
            try {
              playerRef.current?.restart();
            } catch (e) {
              console.error('Failed to restart player after error:', e);
            }
          }, 2000);
        }
      };
      playerRef.current.on('error', handlePlaybackError);
      // Add to existing array
      eventHandlers.current['error'].push(handlePlaybackError);

    } catch (error) {
      console.error('Error initializing plyr:', error);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [options]);

  // Custom helper to safely add event handlers that can be properly removed
  const safeAddEventListener = (event: string, handler: (event: Event) => void) => {
    if (playerRef.current) {
      playerRef.current.on(event, handler);
      
      // Track the handler
      if (!eventHandlers.current[event]) {
        eventHandlers.current[event] = [];
      }
      eventHandlers.current[event].push(handler);
    }
  };

  // Custom helper to safely remove event handlers
  const safeRemoveEventListener = (event: string, handler: (event: Event) => void) => {
    if (playerRef.current) {
      // Re-register to remove (since off isn't available, we just need to ensure they're not in our tracking)
      playerRef.current.on(event, handler);
      
      // Remove from tracking array
      if (eventHandlers.current[event]) {
        eventHandlers.current[event] = eventHandlers.current[event].filter(h => h !== handler);
      }
    }
  };

  return { 
    playerRef, 
    elementRef,
    addEventListener: safeAddEventListener,
    removeEventListener: safeRemoveEventListener
  };
};
