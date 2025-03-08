
// List of free video hosting providers and their embed patterns
export type VideoProvider = 'mp4upload' | 'vidstreaming' | 'streamtape' | 'doodstream' | 'filemoon';

export interface VideoSource {
  id: string;
  provider: VideoProvider;
  quality?: string;
  embedUrl?: string;
  directUrl?: string;
}

// Map of anime IDs to video sources for each episode
// In a real app, this would be fetched from an API
const animeVideoMap: Record<string, Record<number, VideoSource[]>> = {
  // Jujutsu Kaisen
  '43349': {
    1: [
      {
        id: 'jjk-s1-e1-mp4upload',
        provider: 'mp4upload',
        quality: '1080p',
        embedUrl: 'https://www.mp4upload.com/embed-yblq9q7ct23s.html',
      },
      {
        id: 'jjk-s1-e1-vidstreaming',
        provider: 'vidstreaming',
        quality: '720p',
        embedUrl: 'https://goload.pro/streaming.php?id=MTU5Njk5&title=Jujutsu+Kaisen+Episode+1',
      },
    ],
    2: [
      {
        id: 'jjk-s1-e2-mp4upload',
        provider: 'mp4upload',
        quality: '1080p',
        embedUrl: 'https://www.mp4upload.com/embed-9qyewmgm42bz.html',
      },
    ],
  },
  // Attack on Titan
  '44511': {
    1: [
      {
        id: 'aot-s4-e1-streamtape',
        provider: 'streamtape',
        quality: '1080p',
        embedUrl: 'https://streamtape.com/e/DyDOzDbrXPikyOw',
      },
      {
        id: 'aot-s4-e1-doodstream',
        provider: 'doodstream',
        quality: '720p',
        embedUrl: 'https://dood.wf/e/w9t45lzse9gv',
      },
    ],
  },
  // Default sources for any anime without specific mapping
  'default': {
    1: [
      {
        id: 'default-e1-filemoon',
        provider: 'filemoon',
        quality: '720p',
        embedUrl: 'https://filemoon.sx/e/j7vv8xf3ti02',
      },
      {
        id: 'default-e1-mp4upload',
        provider: 'mp4upload',
        quality: '480p',
        embedUrl: 'https://www.mp4upload.com/embed-ufy9dukgbwnt.html',
      },
    ],
  },
};

// Function to get video sources for an anime episode
export const getVideoSources = (animeId: string, episodeNumber: number): VideoSource[] => {
  if (animeVideoMap[animeId] && animeVideoMap[animeId][episodeNumber]) {
    return animeVideoMap[animeId][episodeNumber];
  }
  
  // Use default sources if specific sources aren't available
  if (animeVideoMap['default'] && animeVideoMap['default'][episodeNumber]) {
    return animeVideoMap['default'][episodeNumber];
  }
  
  // Fall back to episode 1 default sources for any episode
  if (animeVideoMap['default'] && animeVideoMap['default'][1]) {
    return animeVideoMap['default'][1];
  }
  
  // Last resort - return an empty array
  return [];
};

// Function to get appropriate player URL for a video source
// In production, this would go through a proxy
export const getPlayerUrl = (source: VideoSource): string => {
  const { provider, embedUrl } = source;
  const proxyUrl = import.meta.env.VITE_VIDEO_PROXY_URL || '';
  
  if (!embedUrl) {
    return '';
  }
  
  // In a real app with a proxy, we'd use something like:
  // return `${proxyUrl}/${provider}?url=${encodeURIComponent(embedUrl)}`;
  
  return embedUrl;
};

// Helper function to extract direct video URL (in a real app, this would be server-side)
// For the demo, we're just returning example YouTube videos
export const extractDirectVideoUrl = (source: VideoSource): string => {
  // In a real app, this would extract direct video URLs
  // For now, we'll return demo videos
  const demoVideos = [
    "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
  ];
  
  // Simple hash function to pick a consistent video based on source ID
  const hash = source.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const index = hash % demoVideos.length;
  
  return demoVideos[index];
};
