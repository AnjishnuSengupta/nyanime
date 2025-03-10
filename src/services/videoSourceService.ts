// Video provider types and interfaces
export type VideoProvider = 'mp4upload' | 'vidstreaming' | 'streamtape' | 'doodstream' | 'filemoon' | 'gogoanime' | 'zoro' | 'animepahe' | 'hls';

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
  image?: string;
}

// Function to fetch episodes for an anime from multiple sources
export const fetchEpisodes = async (animeId: string): Promise<EpisodeInfo[]> => {
  const sources = [
    {
      name: 'gogoanime',
      url: `${import.meta.env.VITE_GOGOANIME_API_KEY}/info/${animeId}`
    },
    {
      name: 'animepahe',
      url: `${import.meta.env.VITE_ANIMEPAHE_API_KEY}/info?id=${animeId}`
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
        // Transform the episodes to include images when available
        return data.episodes.map((ep: any) => ({
          id: ep.id,
          number: ep.number || parseInt(ep.id.split('-').pop() || '1'),
          title: ep.title || `Episode ${ep.number || parseInt(ep.id.split('-').pop() || '1')}`,
          url: ep.url || '',
          image: ep.image || ''
        }));
      }
    } catch (error) {
      console.error(`Error fetching episodes from ${source.name}:`, error);
    }
  }
  
  // If all API calls fail, generate fallback episodes based on anime type
  return getLongRunningAnimeEpisodes(animeId);
};

// Function to fetch video sources for an episode from multiple providers
export const fetchVideoSources = async (episodeId: string): Promise<VideoSource[]> => {
  const sources = [
    {
      name: 'gogoanime',
      url: `${import.meta.env.VITE_GOGOANIME_API_KEY}/watch/${episodeId}`
    },
    {
      name: 'animepahe',
      url: `${import.meta.env.VITE_ANIMEPAHE_API_KEY}/watch?episodeId=${episodeId}`
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
          provider: determineProvider(source),
          quality: source.quality || source.label || source.resolution || 'auto',
          directUrl: source.url,
          url: source.url
        }));
      }
    } catch (error) {
      console.error(`Error fetching video sources from ${source.name}:`, error);
    }
  }
  
  // If all API calls fail, return fallback sources based on episode and anime ID
  return getSpecificVideoSources(episodeId);
};

// Helper function to determine provider from source object
const determineProvider = (source: any): VideoProvider => {
  if (source.name) return source.name as VideoProvider;
  if (source.provider) return source.provider as VideoProvider;
  if (source.server) return source.server as VideoProvider;
  if (source.isM3U8) return 'hls';
  return 'mp4upload'; // Default fallback
};

// Get appropriate number of episodes based on anime type
const getLongRunningAnimeEpisodes = (animeId: string): EpisodeInfo[] => {
  // Check if this is a long-running anime series
  const episodeCount = longRunningAnime.includes(animeId) ? 
    getEpisodeCountForLongRunningAnime(animeId) : 12;
  
  return Array.from({ length: episodeCount }, (_, i) => ({
    id: `${animeId}-episode-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`,
    image: `https://via.placeholder.com/480x270.png?text=Episode+${i + 1}`
  }));
};

// Get episode count for long-running anime series
const getEpisodeCountForLongRunningAnime = (animeId: string): number => {
  const episodeCounts: Record<string, number> = {
    '21': 1080, // One Piece
    '20': 750,  // Naruto + Shippuden
    '1735': 367, // Gintama
    '11061': 366, // Hunter x Hunter
    '269': 500,  // Bleach
    '1': 150,   // Cowboy Bebop + Movies
    '12': 200,  // Dragon Ball
    '16498': 100, // Attack on Titan
    '1535': 37,  // Death Note
    '43': 64,    // Ghost in the Shell
    '431': 220,  // Detective Conan
    '18679': 200, // Fairy Tail
    '30276': 170, // One Punch Man
    '38000': 86,  // Demon Slayer
    '31964': 88   // My Hero Academia
  };
  
  return episodeCounts[animeId] || 100;
};

// List of anime IDs known to have many episodes
const longRunningAnime = [
  '21', '20', '1735', '11061', '269', '1', '12', 
  '16498', '1535', '43', '431', '18679', '30276', '38000', '31964'
];

// Higher quality demo videos for fallback
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

// Get specific video sources based on episode ID
const getSpecificVideoSources = (episodeId: string): VideoSource[] => {
  const animeId = episodeId.split('-')[0];
  const episodeNumber = parseInt(episodeId.split('-').pop() || '1');
  
  // Check if we have specific sources for this anime/episode combination
  if (animeVideoMap[animeId] && animeVideoMap[animeId][episodeNumber]) {
    return animeVideoMap[animeId][episodeNumber];
  }
  
  // Otherwise, generate consistent fallback videos
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

// Anime video map with predefined sources for specific animes/episodes
const animeVideoMap: Record<string, Record<number, VideoSource[]>> = {
  // One Piece specific video sources
  '21': {
    1: [
      {
        id: 'one-piece-ep1-1080p',
        provider: 'gogoanime',
        quality: '1080p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
      }
    ],
    2: [
      {
        id: 'one-piece-ep2-1080p',
        provider: 'gogoanime',
        quality: '1080p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
      }
    ]
  },
  // Attack on Titan specific video sources
  '16498': {
    1: [
      {
        id: 'aot-ep1-1080p',
        provider: 'gogoanime',
        quality: '1080p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
      }
    ]
  },
  // Death Note specific video sources
  '1535': {
    1: [
      {
        id: 'death-note-ep1-1080p',
        provider: 'gogoanime',
        quality: '1080p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
      }
    ]
  },
  // Default fallback videos
  'default': {
    1: [
      {
        id: 'default-1080p',
        provider: 'gogoanime',
        quality: '1080p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
      },
      {
        id: 'default-720p',
        provider: 'gogoanime',
        quality: '720p',
        directUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      }
    ]
  }
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
  return source.directUrl || source.url || '';
};
