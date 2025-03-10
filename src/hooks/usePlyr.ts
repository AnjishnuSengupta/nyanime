
import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

export const usePlyr = (options?: Plyr.Options) => {
  const playerRef = useRef<Plyr>();
  const elementRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const defaultOptions: Plyr.Options = {
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
    };

    playerRef.current = new Plyr(elementRef.current, {
      ...defaultOptions,
      ...options,
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [options]);

  return { playerRef, elementRef };
};
