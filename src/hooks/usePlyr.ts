
import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

interface PlyrOptions {
  autoplay?: boolean;
  captions?: { active?: boolean; language?: string; update?: boolean };
  controls?: string[];
  debug?: boolean;
  fullscreen?: { enabled?: boolean; fallback?: boolean; iosNative?: boolean };
  keyboard?: { focused?: boolean; global?: boolean };
  loadSprite?: boolean;
  muted?: boolean;
  ratio?: string;
  iconUrl?: string;
  tooltips?: { controls?: boolean; seek?: boolean };
  seekTime?: number;
  speed?: { selected?: number; options?: number[] };
  volume?: number;
  blankVideo?: string;
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

    const defaultOptions: PlyrOptions = {
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
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
    };

    try {
      playerRef.current = new Plyr(elementRef.current, {
        ...defaultOptions,
        ...options,
      });

      playerRef.current.on('error', (event) => {
        console.error('Plyr error:', event);
      });
      
      // Auto-quality selection
      playerRef.current.on('ready', () => {
        // Set max volume
        if (playerRef.current) {
          playerRef.current.volume = options?.volume || 1;
        }
      });

      // Progress saving
      playerRef.current.on('timeupdate', () => {
        if (playerRef.current && playerRef.current.currentTime > 0) {
          // Could save progress to localStorage here
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
