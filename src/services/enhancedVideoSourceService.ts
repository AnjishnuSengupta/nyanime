// Enhanced Video Source Service - Integrates Aniwatch API with existing system
// This service provides video streaming sources using the Aniwatch API backend

import { 
  findAniwatchAnimeByTitle,
  getAniwatchEpisodesWithRetry,
  getAniwatchStreamingSourcesWithFallback,
  AniwatchAnime,
  AniwatchEpisode,
  AniwatchStreamingData,
  getBestStreamingSource
} from './aniwatchService';

export interface VideoSource {
  id: string;
  provider: string;
  embedUrl?: string;
  directUrl?: string;
  quality?: string;
  isWorking?: boolean;
  headers?: Record<string, string>;
  isM3U8?: boolean;
}

export interface EpisodeInfo {
  id: string;
  number: number;
  title?: string;
  image?: string;
  description?: string;
  duration?: string;
  aniwatchId?: string; // Store Aniwatch episode ID for streaming
}

export interface StreamingSourceResult {
  sources: VideoSource[];
  subtitles?: Array<{
    lang: string;
    url: string;
  }>;
  headers?: Record<string, string>;
}

// Cache for anime mappings to avoid repeated searches
const animeCache = new Map<string, AniwatchAnime>();

// Helper function to clean anime title for better matching
const cleanAnimeTitle = (title: string): string[] => {
  const variations: string[] = [];
  
  // Add original title
  variations.push(title);
  
  // Remove common suffixes and prefixes
  const cleanedTitle = title
    .replace(/\(TV\)/gi, '')
    .replace(/\(OVA\)/gi, '')
    .replace(/\(Movie\)/gi, '')
    .replace(/\(Special\)/gi, '')
    .replace(/Season \d+/gi, '')
    .replace(/Part \d+/gi, '')
    .replace(/\d+nd Season/gi, '')
    .replace(/\d+rd Season/gi, '')
    .replace(/\d+th Season/gi, '')
    .replace(/: \w+/g, '') // Remove subtitle after colon
    .replace(/\s+/g, ' ')
    .trim();
  
  if (cleanedTitle !== title) {
    variations.push(cleanedTitle);
  }
  
  // Handle specific anime title mappings
  const titleMappings: Record<string, string[]> = {
    "Kimetsu no Yaiba": ["Demon Slayer", "Kimetsu no Yaiba"],
    "Shingeki no Kyojin": ["Attack on Titan", "Shingeki no Kyojin"],
    "Boku no Hero Academia": ["My Hero Academia", "Boku no Hero Academia"],
    "Ore dake Level Up na Ken": ["Solo Leveling", "Ore dake Level Up na Ken"],
    "Jujutsu Kaisen": ["Jujutsu Kaisen", "Sorcery Fight"],
    "Dr. Stone": ["Dr. Stone", "Dr Stone"],
    "One Piece": ["One Piece"],
    "Naruto": ["Naruto"],
    "Bleach": ["Bleach"],
  };
  
  // Check if this title has specific mappings
  for (const [key, mappings] of Object.entries(titleMappings)) {
    if (title.toLowerCase().includes(key.toLowerCase())) {
      variations.push(...mappings);
      break;
    }
  }
  
  // Remove duplicates and return
  return [...new Set(variations)];
};

// Find Aniwatch anime by MAL anime data
const findAniwatchAnimeForMALAnime = async (malAnimeId: string, animeTitle: string): Promise<AniwatchAnime | null> => {
  // Check cache first
  const cacheKey = `${malAnimeId}-${animeTitle}`;
  if (animeCache.has(cacheKey)) {
    console.log(`Found cached Aniwatch anime for ${animeTitle}`);
    return animeCache.get(cacheKey)!;
  }
  
  console.log(`Searching for Aniwatch anime: ${animeTitle} (MAL ID: ${malAnimeId})`);
  
  // Try different title variations
  const titleVariations = cleanAnimeTitle(animeTitle);
  
  for (const titleVariation of titleVariations) {
    try {
      const aniwatchAnime = await findAniwatchAnimeByTitle(titleVariation);
      if (aniwatchAnime) {
        console.log(`Found Aniwatch anime: ${aniwatchAnime.name} (${aniwatchAnime.id}) for title variation: ${titleVariation}`);
        
        // Cache the result
        animeCache.set(cacheKey, aniwatchAnime);
        return aniwatchAnime;
      }
    } catch (error) {
      console.error(`Error searching for title variation "${titleVariation}":`, error);
    }
  }
  
  console.log(`No Aniwatch anime found for: ${animeTitle}`);
  return null;
};

// Fetch episodes using Aniwatch API
export const fetchEpisodesFromAniwatch = async (malAnimeId: string, animeTitle: string): Promise<EpisodeInfo[]> => {
  try {
    console.log(`Fetching episodes for: ${animeTitle} (MAL ID: ${malAnimeId})`);
    
    // Find the corresponding Aniwatch anime
    const aniwatchAnime = await findAniwatchAnimeForMALAnime(malAnimeId, animeTitle);
    
    if (!aniwatchAnime) {
      console.log(`No Aniwatch anime found for: ${animeTitle}`);
      return [];
    }
    
    // Get episodes from Aniwatch API
    const aniwatchEpisodes = await getAniwatchEpisodesWithRetry(aniwatchAnime.id);
    
    if (aniwatchEpisodes.length === 0) {
      console.log(`No episodes found for Aniwatch anime: ${aniwatchAnime.name}`);
      return [];
    }
    
    console.log(`Found ${aniwatchEpisodes.length} episodes for: ${aniwatchAnime.name}`);
    
    // Transform Aniwatch episodes to our format
    const episodeInfos: EpisodeInfo[] = aniwatchEpisodes.map((episode: AniwatchEpisode) => ({
      id: `${malAnimeId}-episode-${episode.number}`,
      number: episode.number,
      title: episode.title || `Episode ${episode.number}`,
      image: aniwatchAnime.poster, // Use anime poster as fallback
      description: episode.isFiller ? "Filler Episode" : "",
      duration: "24:00", // Default duration
      aniwatchId: episode.episodeId // Store Aniwatch episode ID for streaming
    }));
    
    return episodeInfos;
    
  } catch (error) {
    console.error(`Error fetching episodes from Aniwatch for ${animeTitle}:`, error);
    return [];
  }
};

// Fetch video sources using Aniwatch API
export const fetchVideoSourcesFromAniwatch = async (
  malAnimeId: string,
  animeTitle: string,
  episodeNumber: number,
  preferredCategory: "sub" | "dub" | "raw" = "sub"
): Promise<StreamingSourceResult> => {
  try {
    console.log(`Fetching video sources for: ${animeTitle}, Episode ${episodeNumber}`);
    
    // Find the corresponding Aniwatch anime
    const aniwatchAnime = await findAniwatchAnimeForMALAnime(malAnimeId, animeTitle);
    
    if (!aniwatchAnime) {
      console.log(`No Aniwatch anime found for: ${animeTitle}`);
      return { sources: [] };
    }
    
    // Get episodes to find the specific episode ID
    const aniwatchEpisodes = await getAniwatchEpisodesWithRetry(aniwatchAnime.id);
    const targetEpisode = aniwatchEpisodes.find(ep => ep.number === episodeNumber);
    
    if (!targetEpisode) {
      console.log(`Episode ${episodeNumber} not found for: ${aniwatchAnime.name}`);
      return { sources: [] };
    }
    
    console.log(`Found episode: ${targetEpisode.title} (${targetEpisode.episodeId})`);
    
    // Get streaming sources
    const streamingData = await getAniwatchStreamingSourcesWithFallback(
      targetEpisode.episodeId,
      preferredCategory
    );
    
    if (!streamingData || streamingData.sources.length === 0) {
      console.log(`No streaming sources found for episode: ${targetEpisode.episodeId}`);
      return { sources: [] };
    }
    
    console.log(`Found ${streamingData.sources.length} streaming sources`);
    
    // Transform Aniwatch sources to our format
    const videoSources: VideoSource[] = streamingData.sources.map((source, index) => ({
      id: `aniwatch-${targetEpisode.episodeId}-${index}`,
      provider: "aniwatch",
      directUrl: source.url,
      quality: source.quality || "auto",
      isWorking: true,
      headers: streamingData.headers,
      isM3U8: source.isM3U8 || false
    }));
    
    // Get the best quality source
    const bestSource = getBestStreamingSource(streamingData.sources);
    if (bestSource) {
      console.log(`Best source quality: ${bestSource.quality || 'auto'}, M3U8: ${bestSource.isM3U8}`);
    }
    
    return {
      sources: videoSources,
      subtitles: streamingData.subtitles,
      headers: streamingData.headers
    };
    
  } catch (error) {
    console.error(`Error fetching video sources from Aniwatch for ${animeTitle}, Episode ${episodeNumber}:`, error);
    return { sources: [] };
  }
};

// Enhanced episode fetching that tries Aniwatch first, then falls back to other methods
export const fetchEpisodes = async (malAnimeId: string, animeTitle?: string): Promise<EpisodeInfo[]> => {
  console.log(`Fetching episodes for MAL ID: ${malAnimeId}, Title: ${animeTitle}`);
  
  // If we have a title, try Aniwatch API first
  if (animeTitle) {
    try {
      const aniwatchEpisodes = await fetchEpisodesFromAniwatch(malAnimeId, animeTitle);
      if (aniwatchEpisodes.length > 0) {
        console.log(`Successfully fetched ${aniwatchEpisodes.length} episodes from Aniwatch`);
        return aniwatchEpisodes;
      }
    } catch (error) {
      console.error(`Error fetching from Aniwatch, will try fallback methods:`, error);
    }
  }
  
  // Fallback: Try to get basic episode info from MAL/Jikan
  try {
    console.log(`Falling back to Jikan API for episode list`);
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malAnimeId}/episodes`);
    if (response.ok) {
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        console.log(`Found ${data.data.length} episodes from Jikan`);
        return data.data.map((ep: any) => ({
          id: `${malAnimeId}-episode-${ep.mal_id}`,
          number: ep.mal_id,
          title: ep.title || `Episode ${ep.mal_id}`,
          image: ep.jpg?.image_url,
          description: '',
          duration: '24:00'
        }));
      }
    }
  } catch (error) {
    console.error('Error fetching episodes from Jikan:', error);
  }
  
  // Last resort: Generate episodes based on anime info
  try {
    console.log(`Generating episodes based on anime info`);
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malAnimeId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.data && data.data.episodes) {
        const episodeCount = data.data.episodes;
        console.log(`Generating ${episodeCount} episodes`);
        
        const episodes: EpisodeInfo[] = [];
        for (let i = 1; i <= episodeCount; i++) {
          episodes.push({
            id: `${malAnimeId}-episode-${i}`,
            number: i,
            title: `Episode ${i}`,
            duration: '24:00'
          });
        }
        return episodes;
      }
    }
  } catch (error) {
    console.error('Error generating episodes:', error);
  }
  
  console.log(`No episodes found for MAL ID: ${malAnimeId}`);
  return [];
};

// Enhanced video source fetching that prioritizes Aniwatch
export const fetchVideoSources = async (
  malAnimeId: string,
  episodeNumber: number,
  animeTitle?: string
): Promise<VideoSource[]> => {
  console.log(`Fetching video sources for MAL ID: ${malAnimeId}, Episode: ${episodeNumber}, Title: ${animeTitle}`);
  
  // If we have a title, try Aniwatch API first
  if (animeTitle) {
    try {
      const streamingResult = await fetchVideoSourcesFromAniwatch(malAnimeId, animeTitle, episodeNumber, "sub");
      if (streamingResult.sources.length > 0) {
        console.log(`Successfully fetched ${streamingResult.sources.length} video sources from Aniwatch`);
        return streamingResult.sources;
      }
    } catch (error) {
      console.error(`Error fetching video sources from Aniwatch:`, error);
    }
  }
  
  console.log(`No video sources found for MAL ID: ${malAnimeId}, Episode: ${episodeNumber}`);
  return [];
};

// Helper function to get streaming data with all details
export const getStreamingDataForEpisode = async (
  malAnimeId: string,
  episodeNumber: number,
  animeTitle: string,
  preferredCategory: "sub" | "dub" | "raw" = "sub"
): Promise<StreamingSourceResult | null> => {
  try {
    return await fetchVideoSourcesFromAniwatch(malAnimeId, animeTitle, episodeNumber, preferredCategory);
  } catch (error) {
    console.error(`Error getting streaming data:`, error);
    return null;
  }
};

// Clear cache function (useful for debugging)
export const clearAnimeCache = (): void => {
  animeCache.clear();
  console.log('Anime cache cleared');
};
