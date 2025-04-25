// Helper utilities for the video player functionality

// Create a proxy URL to handle CORS and other streaming issues
export function createProxyUrl(url: string, isM3U8: boolean = false): string {
  // Choose the appropriate player based on the content type
  if (isM3U8 || url.includes('.m3u8')) {
    return `https://hls-player.vercel.app/?url=${encodeURIComponent(url)}&autoplay=true&referer=https://nyanime.vercel.app`;
  } else {
    return `https://player.vercel.app/?url=${encodeURIComponent(url)}&autoplay=true&referer=https://nyanime.vercel.app`;
  }
}

// Extract quality information from a source URL or quality string
export function extractQuality(quality?: string, url?: string): string {
  if (quality && quality.includes('p')) {
    return quality;
  }
  
  if (quality) {
    return `${quality}p`;
  }
  
  if (url) {
    const qualityMatch = url.match(/(\d+)p/i);
    if (qualityMatch && qualityMatch[1]) {
      return `${qualityMatch[1]}p`;
    }
  }
  
  return 'Auto';
}

// Create headers for bypassing CORS and provider restrictions
export function createStreamHeaders(): Record<string, string> {
  return {
    'Referer': 'https://gogoanimehd.io/',
    'Origin': 'https://gogoanimehd.io',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
  };
}

// Check if a stream URL is likely to be valid
export function isValidStreamUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' || 
      parsed.protocol === 'http:' || 
      url.includes('.m3u8') || 
      url.includes('.mp4')
    );
  } catch (e) {
    return false;
  }
}

// Helper to detect if we're in a browser environment
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

// Function to test if a stream URL is working
export async function testStreamUrl(url: string): Promise<boolean> {
  if (!isBrowser() || !url) return false;
  
  try {
    const response = await fetch(url, { 
      method: 'HEAD', 
      mode: 'no-cors',
      headers: createStreamHeaders()
    });
    
    // For CORS reasons, we might not get a valid status
    // but if we get any response, the URL is probably valid
    return true;
  } catch (e) {
    console.error('Error testing stream URL:', e);
    return false;
  }
}

// Generate a proper Consumet episode ID from anime title and episode number
export function getConsumetEpisodeId(episodeNumber: number, animeTitle: string, provider: string): string {
  // This is a workaround to generate a likely consumet episode ID format
  // Different providers have different ID formats, so this is just a best guess
  const formattedTitle = animeTitle
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '-');
  
  switch(provider) {
    case 'gogoanime':
      return `${formattedTitle}-episode-${episodeNumber}`;
    case 'zoro':
      return `${formattedTitle}-${episodeNumber}`;
    default:
      return `${formattedTitle}-episode-${episodeNumber}`;
  }
}