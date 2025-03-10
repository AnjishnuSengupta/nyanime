
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
    keyboard?: { focused: boolean; global: boolean };
    tooltips?: { controls: boolean; seek: boolean };
    speed?: { selected: number; options: number[] };
    quality?: { default: number; options: number[] };
    loop?: { active: boolean };
  }

  export default class Plyr {
    constructor(target: HTMLElement, options?: PlyrProps);
    source: any;
    destroy(): void;
    on(event: string, callback: (event: any) => void): void;
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    restart(): void;
    seek(time: number): void;
    forward(time: number): void;
    rewind(time: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getVolume(): number;
    isMuted(): boolean;
    isPlaying(): boolean;
  }
}
