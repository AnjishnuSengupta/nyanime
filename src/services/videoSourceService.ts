// Video provider types and interfaces
export type VideoProvider = 'mp4upload' | 'vidstreaming' | 'streamtape' | 'doodstream' | 'filemoon' | 'gogoanime' | 'zoro' | 'animepahe';

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

// Function to fetch episodes for an anime from multiple sources
export const fetchEpisodes = async (animeId: string): Promise<EpisodeInfo[]> => {
  const sources = [
    {
      name: 'gogoanime',
      url: `${import.meta.env.VITE_GOGOANIME_API_KEY || 'https://api.consumet.org/anime/gogoanime'}/info/${animeId}`
    },
    {
      name: 'zoro',
      url: `${import.meta.env.VITE_ZORO_API_KEY || 'https://api.consumet.org/anime/zoro'}/info?id=${animeId}`
    }
  ];

  console.log(`Fetching episodes for anime ID: ${animeId} from multiple sources`);
  
  for (const source of sources) {
    try {
      const corsProxy = import.meta.env.VITE_CORS_PROXY_URL || '';
      const url = corsProxy ? `${corsProxy}${source.url}` : source.url;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`API error from ${source.name}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Episodes data from ${source.name}:`, data);
      
      if (data.episodes && data.episodes.length > 0) {
        return data.episodes;
      }
    } catch (error) {
      console.error(`Error fetching episodes from ${source.name}:`, error);
    }
  }
  
  // If all API calls fail, return fallback episodes
  return fallbackEpisodes(animeId);
};

// Function to fetch video sources for an episode from multiple providers
export const fetchVideoSources = async (episodeId: string): Promise<VideoSource[]> => {
  const sources = [
    {
      name: 'gogoanime',
      url: `${import.meta.env.VITE_GOGOANIME_API_KEY || 'https://api.consumet.org/anime/gogoanime'}/watch/${episodeId}`
    },
    {
      name: 'zoro',
      url: `${import.meta.env.VITE_ZORO_API_KEY || 'https://api.consumet.org/anime/zoro'}/watch?episodeId=${episodeId}`
    },
    {
      name: 'animepahe',
      url: `${import.meta.env.VITE_ANIMEPAHE_API_KEY || 'https://api.consumet.org/anime/animepahe'}/watch/${episodeId}`
    }
  ];

  console.log(`Fetching video sources for episode ID: ${episodeId} from multiple sources`);
  
  for (const source of sources) {
    try {
      const corsProxy = import.meta.env.VITE_CORS_PROXY_URL || '';
      const url = corsProxy ? `${corsProxy}${source.url}` : source.url;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`API error from ${source.name}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Video sources data from ${source.name}:`, data);
      
      if (data.sources && data.sources.length > 0) {
        // Transform the API response to match our VideoSource interface
        return data.sources.map((source: any, index: number) => ({
          id: `${episodeId}-${source.quality || 'default'}-${index}`,
          provider: source.name || source.provider || source.server || source.isM3U8 ? 'hls' : 'mp4' as VideoProvider,
          quality: source.quality || source.label || source.resolution || 'auto',
          directUrl: source.url,
          url: source.url
        }));
      }
    } catch (error) {
      console.error(`Error fetching video sources from ${source.name}:`, error);
    }
  }
  
  // If all API calls fail, return fallback sources
  return fallbackVideoSources(episodeId);
};

// Fallback episodes for when the API fails - handle large anime series
const fallbackEpisodes = (animeId: string): EpisodeInfo[] => {
  // For long-running anime, create more episodes
  const episodeCount = longRunningAnime.includes(animeId) ? 100 : 12;
  
  return Array.from({ length: episodeCount }, (_, i) => ({
    id: `${animeId}-episode-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`
  }));
};

// List of anime IDs known to have many episodes
const longRunningAnime = ['21', '20', '1735', '11061', '269', '1', '12'];

// Demo videos as fallback
const demoVideos = [
  "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
];

// Fallback video sources for when the API fails
const fallbackVideoSources = (episodeId: string): VideoSource[] => {
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
