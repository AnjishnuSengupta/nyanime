
import { useEffect, useRef } from 'react';
import Plyr, { PlyrProps } from 'plyr';
import 'plyr/dist/plyr.css';

export const usePlyr = (options?: PlyrProps) => {
  const playerRef = useRef<Plyr>();
  const elementRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    if (playerRef.current) {
      playerRef.current.destroy();
    }

    const defaultOptions: PlyrProps = {
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
