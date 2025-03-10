
declare module 'plyr' {
  export interface PlyrProps {
    controls?: string[];
    loadSprite?: boolean;
    iconUrl?: string;
    blankVideo?: string;
    autoplay?: boolean;
    seekTime?: number;
    volume?: number;
    muted?: boolean;
    keyboard: { focused: boolean; global: boolean }; // Non-optional properties
    tooltips?: { controls: boolean; seek: boolean };
    speed?: { selected: number; options: number[] };
    quality?: { default: number; options: number[] };
    loop?: { active: boolean };
    // Add other properties as needed
  }

  export default class Plyr {
    constructor(target: HTMLVideoElement | HTMLAudioElement | string, options?: PlyrProps);
    source: any;
    
    // Properties that were being accessed directly
    volume: number;
    currentTime: number;
    
    // Methods
    destroy(): void;
    on(event: string, callback: (event: any) => void): void;
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    restart(): void;
    getCurrentTime(): number;
    setCurrentTime(time: number): void;
    getDuration(): number;
    getVolume(): number;
    setVolume(volume: number): void;
    isMuted(): boolean;
    isPlaying(): boolean;
  }
}
