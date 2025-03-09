// Video provider types and interfaces
export type VideoProvider = 'mp4upload' | 'vidstreaming' | 'streamtape' | 'doodstream' | 'filemoon' | 'gogoanime';

export interface VideoSource {
  id: string;
  provider: VideoProvider;
  quality?: string;
  embedUrl?: string;
  directUrl?: string;
  url?: string; // For direct URLs from Consumet API
}

export interface EpisodeInfo {
  id: string;
  number: number;
  title: string;
  url?: string;
}

// Function to fetch episodes for an anime from Consumet API
export const fetchEpisodes = async (animeId: string): Promise<EpisodeInfo[]> => {
  try {
    console.log(`Fetching episodes for anime ID: ${animeId}`);
    const response = await fetch(`https://api.consumet.org/anime/gogoanime/info/${animeId}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Episodes data:', data);
    
    // Return the episodes array, or empty array if not available
    return data.episodes || [];
  } catch (error) {
    console.error('Error fetching episodes:', error);
    // Fallback to our mock data when API fails
    return fallbackEpisodes(animeId);
  }
};

// Function to fetch video sources for an episode from Consumet API
export const fetchVideoSources = async (episodeId: string): Promise<VideoSource[]> => {
  try {
    console.log(`Fetching video sources for episode ID: ${episodeId}`);
    const response = await fetch(`https://api.consumet.org/anime/gogoanime/watch/${episodeId}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Video sources data:', data);
    
    // Transform the API response to match our VideoSource interface
    return (data.sources || []).map((source: any, index: number) => ({
      id: `${episodeId}-${source.quality}-${index}`,
      provider: 'gogoanime' as VideoProvider,
      quality: source.quality,
      directUrl: source.url,
      url: source.url
    }));
  } catch (error) {
    console.error('Error fetching video sources:', error);
    // Fallback to our mock data when API fails
    return fallbackVideoSources(episodeId);
  }
};

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

// Fallback episodes for when the API fails
const fallbackEpisodes = (animeId: string): EpisodeInfo[] => {
  // For demo purposes, generate 12 episodes
  return Array.from({ length: 12 }, (_, i) => ({
    id: `${animeId}-episode-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`
  }));
};

// Fallback video sources for when the API fails
const fallbackVideoSources = (episodeId: string): VideoSource[] => {
  // Demo videos as fallback
  const demoVideos = [
    "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
  ];
  
  // Simple hash function to pick a consistent video based on episode ID
  const hash = episodeId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const index = hash % demoVideos.length;
  
  return [
    {
      id: `${episodeId}-1080p`,
      provider: 'gogoanime',
      quality: '1080p',
      directUrl: demoVideos[index]
    },
    {
      id: `${episodeId}-720p`,
      provider: 'gogoanime',
      quality: '720p',
      directUrl: demoVideos[(index + 1) % demoVideos.length]
    },
    {
      id: `${episodeId}-480p`,
      provider: 'gogoanime',
      quality: '480p',
      directUrl: demoVideos[(index + 2) % demoVideos.length]
    }
  ];
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

// Helper function to extract direct video URL
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
