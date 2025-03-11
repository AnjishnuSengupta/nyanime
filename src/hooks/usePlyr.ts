
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

  useEffect(() => {
    if (!elementRef.current) return;

    if (playerRef.current) {
      playerRef.current.destroy();
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
    };

    try {
      // Create new Plyr instance
      playerRef.current = new Plyr(elementRef.current, {
        ...defaultOptions,
        ...options,
        keyboard: { 
          focused: options?.keyboard?.focused ?? defaultOptions.keyboard.focused, 
          global: options?.keyboard?.global ?? defaultOptions.keyboard.global 
        }
      });

      playerRef.current.on('error', (event) => {
        console.error('Plyr error:', event);
      });
      
      playerRef.current.on('ready', () => {
        if (playerRef.current) {
          // Set the volume safely
          try {
            if ('volume' in playerRef.current) {
              (playerRef.current as any).volume = options?.volume || 1;
            }
          } catch (e) {
            console.error('Failed to set volume:', e);
          }
        }
      });

      playerRef.current.on('timeupdate', () => {
        if (playerRef.current) {
          try {
            // Get current time safely
            const currentTime = (playerRef.current as any).currentTime || 0;
            if (currentTime > 0) {
              // Could save progress to localStorage here
            }
          } catch (e) {
            console.error('Failed to get currentTime:', e);
          }
        }
      });

    } catch (error) {
      console.error('Error initializing plyr:', error);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [options]);

  return { playerRef, elementRef };
};
