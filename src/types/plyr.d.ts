
declare module "plyr" {
  export interface PlyrProps {
    autoplay?: boolean;
    captions?: { active?: boolean; language?: string; update?: boolean };
    controls?: string[];
    debug?: boolean;
    fullscreen?: { enabled?: boolean; fallback?: boolean; iosNative?: boolean };
    keyboard: { focused: boolean; global: boolean }; // Required property
    tooltips?: { controls?: boolean; seek?: boolean };
    loadSprite?: boolean;
    muted?: boolean;
    ratio?: string;
    iconUrl?: string;
    seekTime?: number;
    volume?: number;
    speed?: { selected?: number; options?: number[] };
    quality?: { default?: number; options?: number[] };
    loop?: { active?: boolean };
    storage?: { enabled?: boolean; key?: string };
    // Add other properties as needed
  }

  export default class Plyr {
    constructor(target: HTMLVideoElement | HTMLAudioElement | string, options?: PlyrProps);
    source: any;
    
    // Properties
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
