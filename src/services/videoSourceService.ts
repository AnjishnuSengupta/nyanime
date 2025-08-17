
import { ANIME } from "@consumet/extensions";
import { v4 as uuidv4 } from 'uuid';
import type { AnimeProvider } from './consumetService';

export interface VideoSource {
  id: string;
  provider: string;
  embedUrl?: string;
  directUrl?: string;
  quality?: string;
  isWorking?: boolean;
}

export interface EpisodeInfo {
  id: string;
  number: number;
  title?: string;
  image?: string;
  description?: string;
  duration?: string;
}

import { 
  searchAnime,
  getAnimeInfo, 
  PROVIDERS, 
  getEpisodeSources, 
  getAvailableServers,
  STREAMING_SERVERS,
  StreamingServer, 
  SubOrDub,
  SUB_OR_DUB,
  searchAndGetEpisodeLinks,
  getSourcesFromMultipleProviders
} from './consumetService';

// Map MAL IDs to proper titles for better searching
const malIdToTitleMap: Record<string, string> = {
  "58567": "Solo Leveling",
  "48316": "Demon Slayer Kimetsu no Yaiba Entertainment District Arc",
  "51046": "Blue Lock",
  "53887": "Oshi no Ko",
  "55644": "Jujutsu Kaisen 2nd Season",
  // Add more mappings as needed
};

// Function to get alternative spellings for an anime title
const getAlternativeTitles = (title: string): string[] => {
  const alternatives: string[] = [];
  
  // Add original title
  alternatives.push(title);
  
  // Common replacements
  if (title.includes('Season')) {
    // Try without "Season X" for sequels
    alternatives.push(title.replace(/Season \d+/i, '').trim());
    // Try with just the number
    const seasonMatch = title.match(/Season (\d+)/i);
    if (seasonMatch && seasonMatch[1]) {
      alternatives.push(title.replace(/Season \d+/i, seasonMatch[1]).trim());
    }
  }
  
  // Special cases - add more as needed
  if (title.includes("Ore dake Level Up na Ken")) {
    alternatives.push("Solo Leveling");
  }
  
  if (title.includes("Kimetsu no Yaiba")) {
    alternatives.push("Demon Slayer");
  }
  
  // Try without anything in parentheses
  if (title.includes('(')) {
    alternatives.push(title.replace(/\([^)]*\)/g, '').trim());
  }
  
  // Try without anything after colon
  if (title.includes(':')) {
    alternatives.push(title.split(':')[0].trim());
  }
  
  // Remove duplicates
  return [...new Set(alternatives)];
};

// Function to fetch episodes for an anime from multiple sources
export const fetchEpisodes = async (animeId: string): Promise<EpisodeInfo[]> => {
  console.log(`Fetching episodes for anime ID: ${animeId}`);
  
  try {
    // Check if we have a mapped title for this anime ID
    const mappedTitle = malIdToTitleMap[animeId];
    console.log(`Mapped title for ${animeId}: ${mappedTitle || 'None found'}`);
    
    // Try to get episodes from Jikan API first (reliable metadata)
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${animeId}/episodes`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          console.log(`Found ${data.data.length} episodes from Jikan`);
          return data.data.map((ep: {mal_id: number; title: string; jpg?: {image_url: string}}) => ({
            id: `${animeId}-episode-${ep.mal_id}`,
            number: ep.mal_id,
            title: ep.title,
            image: ep.jpg?.image_url,
            description: '',
            duration: ''
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching episodes from Jikan:', error);
    }
    
    // Get the anime title from MAL to use for searching
    let animeTitle = "";
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.title) {
          animeTitle = data.data.title;
          console.log(`Got anime title from Jikan: ${animeTitle}`);
        }
      }
    } catch (error) {
      console.error('Error fetching anime details from Jikan:', error);
    }
    
    // If we have a mapped title, use it instead
    if (mappedTitle) {
      animeTitle = mappedTitle;
      console.log(`Using mapped title instead: ${animeTitle}`);
    }
    
    // Get alternative titles for searching
    const titleVariations = getAlternativeTitles(animeTitle);
    console.log(`Title variations to try: ${titleVariations.join(', ')}`);
    
    // If Jikan fails, try Consumet API with multiple providers
    try {
      // Try with multiple providers
      const providers = [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX];
      
      for (const provider of providers) {
        for (const titleVariation of titleVariations) {
          try {
            console.log(`Trying to find anime "${titleVariation}" on ${provider}`);
            
            // First try searching to find the correct ID
            const searchResults = await new ANIME[provider]().search(titleVariation);
            
            if (searchResults && searchResults.length > 0) {
              // Use the first result's ID to get detailed info
              const animeData = searchResults[0];
              console.log(`Found anime "${animeData.title}" (ID: ${animeData.id}) on ${provider}`);
              
              const info = await getAnimeInfo(animeData.id, provider as AnimeProvider);
              
              if (info && info.episodes && info.episodes.length > 0) {
                console.log(`Found ${info.episodes.length} episodes for "${animeData.title}" from ${provider}`);
                
                return info.episodes.map((ep: {id: string; number: number; title?: string; image?: string}) => ({
                  id: ep.id || `${animeId}-episode-${ep.number}`,
                  number: Number(ep.number),
                  title: ep.title || `Episode ${ep.number}`,
                  image: ep.image,
                  description: '',
                  duration: ''
                }));
              }
            }
          } catch (err) {
            console.warn(`Could not find "${titleVariation}" on provider ${provider}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching episodes from Consumet:', error);
    }
    
    // If we couldn't get episodes from any source, generate dummy episodes
    console.log('Generating placeholder episodes');
    return generateDummyEpisodes(animeId, 12);
  } catch (error) {
    console.error('Error in fetchEpisodes:', error);
    return generateDummyEpisodes(animeId, 12);
  }
};

// Helper function to generate dummy episodes
const generateDummyEpisodes = (animeId: string, count: number): EpisodeInfo[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `${animeId}-episode-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`,
    description: '',
    duration: ''
  }));
};

// Create proper direct streaming URL
const createDirectUrl = (url: string, headers?: Record<string, string>): string => {
  // Filter out invalid URLs
  if (!url || !url.startsWith('http')) {
    return '';
  }
  
  // For M3U8 streams or direct MP4 links, return as is
  return url;
};

// Helper function to create proper embed URL for video source
const createEmbedUrl = (sourceUrl: string, isM3U8: boolean, headers?: Record<string, string>): string => {
  // Filter out invalid URLs
  if (!sourceUrl || !sourceUrl.startsWith('http')) {
    return '';
  }
  
  // For HLS streams, use a custom player that supports HLS
  if (isM3U8) {
    // Use direct HLS URL with a custom player that supports HLS
    return `https://hls-player.lovable.app/?url=${encodeURIComponent(sourceUrl)}`;
  }
  
  // For direct MP4 links, use a simple video player
  return `https://player.lovable.app/?url=${encodeURIComponent(sourceUrl)}`;
};

// Function to fetch video sources for an episode
export const fetchVideoSources = async (episodeId: string): Promise<VideoSource[]> => {
  console.log(`Fetching video sources for episode ID: ${episodeId}`);
  
  try {
    const sources: VideoSource[] = [];
    
    // Extract anime ID and episode number from episodeId (format: {animeId}-episode-{episodeNumber})
    const match = episodeId.match(/^(\d+)-episode-(\d+)$/);
    const animeIdFromEpisode = match ? match[1] : null;
    const episodeNumber = match ? parseInt(match[2]) : 1;
    
    if (!animeIdFromEpisode) {
      console.error(`Invalid episode ID format: ${episodeId}`);
      return [];
    }
    
    console.log(`Extracted animeId: ${animeIdFromEpisode}, episode: ${episodeNumber} from episodeId: ${episodeId}`);
    
    // Check if we have a mapped title for this anime ID
    const mappedTitle = malIdToTitleMap[animeIdFromEpisode];
    console.log(`Mapped title for ${animeIdFromEpisode}: ${mappedTitle || 'None found'}`);
    
    // Get the anime title from MAL to use for searching
    let animeTitle = "";
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${animeIdFromEpisode}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.title) {
          animeTitle = data.data.title;
          console.log(`Got anime title from Jikan: ${animeTitle}`);
        }
      }
    } catch (error) {
      console.error('Error fetching anime details from Jikan:', error);
    }
    
    // If we have a mapped title, use it instead
    if (mappedTitle) {
      animeTitle = mappedTitle;
      console.log(`Using mapped title instead: ${animeTitle}`);
    }
    
    // Get alternative titles for searching
    const titleVariations = getAlternativeTitles(animeTitle);
    console.log(`Title variations to try: ${titleVariations.join(', ')}`);
    
    // Try to get sources from multiple providers
    const providers = [
      PROVIDERS.GOGOANIME,
      PROVIDERS.ZORO,
      PROVIDERS.ANIMEFOX
    ];
    
    let foundValidSource = false;
    
    // First approach: Try direct sources from multiple providers using title variations
    for (const titleVariation of titleVariations) {
      if (foundValidSource) break;
      
      try {
        console.log(`Trying to get sources for "${titleVariation}", episode ${episodeNumber} using multiple providers`);
        
        const result = await getSourcesFromMultipleProviders(
          titleVariation,
          episodeNumber,
          providers as AnimeProvider[]
        );
        
        if (result && result.sources && result.sources.sources && result.sources.sources.length > 0) {
          console.log(`Found ${result.sources.sources.length} sources for "${titleVariation}" using provider ${result.provider}`);
          
          result.sources.sources.forEach((source: {url: string; quality?: string; isM3U8?: boolean}) => {
            const sourceId = uuidv4();
            const directUrl = createDirectUrl(source.url, result.sources.headers);
            const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, result.sources.headers);
            
            if (embedUrl) {
              foundValidSource = true;
              sources.push({
                id: sourceId,
                provider: `${result.provider || 'multiple'}-${source.quality || 'default'}`,
                embedUrl: embedUrl,
                directUrl: directUrl,
                quality: source.quality || 'Default',
                isWorking: true
              });
            }
          });
        }
      } catch (error) {
        console.warn(`Failed to get sources for "${titleVariation}" using multiple providers:`, error);
      }
    }
    
    // Second approach: Try each provider individually with more detailed approach
    if (!foundValidSource) {
      for (const provider of providers) {
        if (foundValidSource) break;
        
        for (const titleVariation of titleVariations) {
          if (foundValidSource) break;
          
          try {
            console.log(`Trying to find anime "${titleVariation}" on ${provider}`);
            
            // First try searching to find the correct ID
            const searchResults = await new ANIME[provider]().search(titleVariation);
            
            if (searchResults && searchResults.length > 0) {
              // Use the first result's ID to get detailed info
              const animeData = searchResults[0];
              console.log(`Found anime "${animeData.title}" (ID: ${animeData.id}) on ${provider}`);
              
              // Get anime info to find the episode ID
              const animeInfo = await getAnimeInfo(animeData.id, provider as AnimeProvider);
              
              if (animeInfo && animeInfo.episodes && animeInfo.episodes.length > 0) {
                // Find the specific episode
                const episode = animeInfo.episodes.find((ep: {number: number; id: string}) => Number(ep.number) === episodeNumber);
                
                if (episode) {
                  console.log(`Found episode ID: ${episode.id} for "${animeData.title}", episode ${episodeNumber}`);
                  
                  // Get available servers for this episode
                  const availableServers = await getAvailableServers(episode.id, provider as AnimeProvider);
                  console.log(`Found ${availableServers?.length || 0} servers for ${provider}`);
                  
                  if (availableServers && availableServers.length > 0) {
                    // Try first 3 servers
                    for (const server of availableServers.slice(0, 3)) {
                      try {
                        const result = await getEpisodeSources(
                          episode.id, 
                          provider as AnimeProvider, 
                          server.name.toLowerCase() as StreamingServer
                        );
                        
                        if (result && result.sources && result.sources.length > 0) {
                          console.log(`Found ${result.sources.length} sources from ${provider} using server ${server.name}`);
                          
                          // For each source from this server, create a source object
                          result.sources.forEach((source) => {
                            const sourceId = uuidv4();
                            const directUrl = createDirectUrl(source.url, result.headers);
                            const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, result.headers);
                            
                            if (embedUrl) {
                              foundValidSource = true;
                              sources.push({
                                id: sourceId,
                                provider: `${provider}-${server.name}`,
                                embedUrl: embedUrl,
                                directUrl: directUrl,
                                quality: source.quality || 'Default',
                                isWorking: true
                              });
                            }
                          });
                        }
                      } catch (err) {
                        console.warn(`Could not get sources from ${provider} server ${server.name}:`, err);
                      }
                    }
                  } else {
                    // If no servers are available, try to use the episode data directly
                    const result = await getEpisodeSources(episode.id, provider as AnimeProvider);
                    
                    if (result && result.sources && result.sources.length > 0) {
                      console.log(`Found ${result.sources.length} direct sources from ${provider}`);
                      
                      // For each source, create a source object
                      result.sources.forEach((source) => {
                        const sourceId = uuidv4();
                        const directUrl = createDirectUrl(source.url, result.headers);
                        const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, result.headers);
                        
                        if (embedUrl) {
                          foundValidSource = true;
                          sources.push({
                            id: sourceId,
                            provider: provider,
                            embedUrl: embedUrl,
                            directUrl: directUrl,
                            quality: source.quality || 'Default',
                            isWorking: true
                          });
                        }
                      });
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`Could not get sources for "${titleVariation}" from provider ${provider}:`, err);
          }
        }
      }
    }
    
    // Third approach: Just try search and get episode links directly
    if (sources.length === 0) {
      for (const titleVariation of titleVariations) {
        if (foundValidSource) break;
        
        for (const provider of providers) {
          if (foundValidSource) break;
          
          try {
            console.log(`Trying searchAndGetEpisodeLinks for "${titleVariation}", episode ${episodeNumber} on ${provider}`);
            
            // Search by title and get episode links
            const result = await searchAndGetEpisodeLinks(
              titleVariation, 
              episodeNumber, 
              provider as AnimeProvider
            );
            
            if (result && result.sources && result.sources.sources && result.sources.sources.length > 0) {
              console.log(`Found ${result.sources.sources.length} sources by searching for "${titleVariation}" on ${provider}`);
              
              result.sources.sources.forEach((source: {url: string; quality?: string; isM3U8?: boolean}) => {
                const sourceId = uuidv4();
                const directUrl = createDirectUrl(source.url, result.sources.headers);
                const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, result.sources.headers);
                
                if (embedUrl) {
                  foundValidSource = true;
                  sources.push({
                    id: sourceId,
                    provider: `${provider}-search`,
                    embedUrl: embedUrl,
                    directUrl: directUrl,
                    quality: source.quality || 'Default',
                    isWorking: true
                  });
                }
              });
            }
          } catch (error) {
            console.warn(`searchAndGetEpisodeLinks failed for "${titleVariation}" on ${provider}:`, error);
          }
        }
      }
    }
    
    // Special handling for Solo Leveling (most popular one with issues)
    if (sources.length === 0 && (animeIdFromEpisode === "58567" || titleVariations.includes("Solo Leveling"))) {
      try {
        console.log(`Special handling for Solo Leveling, episode ${episodeNumber}`);
        
        // Hard-coding a fallback approach for Solo Leveling specifically
        const gogoResult = await searchAndGetEpisodeLinks(
          "Solo Leveling", 
          episodeNumber, 
          PROVIDERS.GOGOANIME
        );
        
        if (gogoResult && gogoResult.sources && gogoResult.sources.sources && gogoResult.sources.sources.length > 0) {
          console.log(`Found ${gogoResult.sources.sources.length} sources for Solo Leveling using direct search`);
          
          gogoResult.sources.sources.forEach((source: {url: string; quality?: string; isM3U8?: boolean}) => {
            const sourceId = uuidv4();
            const directUrl = createDirectUrl(source.url, gogoResult.sources.headers);
            const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, gogoResult.sources.headers);
            
            if (embedUrl) {
              sources.push({
                id: sourceId,
                provider: `gogoanime-special`,
                embedUrl: embedUrl,
                directUrl: directUrl,
                quality: source.quality || 'Default',
                isWorking: true
              });
            }
          });
        }
        
        // Try Zoro as well
        const zoroResult = await searchAndGetEpisodeLinks(
          "Solo Leveling", 
          episodeNumber, 
          PROVIDERS.ZORO
        );
        
        if (zoroResult && zoroResult.sources && zoroResult.sources.sources && zoroResult.sources.sources.length > 0) {
          console.log(`Found ${zoroResult.sources.sources.length} sources for Solo Leveling using Zoro direct search`);
          
          zoroResult.sources.sources.forEach((source: {url: string; quality?: string; isM3U8?: boolean}) => {
            const sourceId = uuidv4();
            const directUrl = createDirectUrl(source.url, zoroResult.sources.headers);
            const embedUrl = createEmbedUrl(source.url, !!source.isM3U8, zoroResult.sources.headers);
            
            if (embedUrl) {
              sources.push({
                id: sourceId,
                provider: `zoro-special`,
                embedUrl: embedUrl,
                directUrl: directUrl,
                quality: source.quality || 'Default',
                isWorking: true
              });
            }
          });
        }
      } catch (error) {
        console.error('Error in Solo Leveling special handling:', error);
      }
    }
    
    console.log(`Found ${sources.length} total sources`);
    
    // If we still don't have any sources, add a dummy source for debugging
    if (sources.length === 0) {
      console.log("No sources found after all attempts, adding dummy source for debugging");
      sources.push({
        id: uuidv4(),
        provider: "dummy",
        embedUrl: `https://player.lovable.app/?url=dummy&animeId=${animeIdFromEpisode}&episode=${episodeNumber}`,
        quality: "Default",
        isWorking: false
      });
      
      // Dispatch a streaming issue event
      window.dispatchEvent(new CustomEvent('streaming-issue', {
        detail: { animeId: animeIdFromEpisode, episodeId: episodeId }
      }));
    }
    
    return sources;
  } catch (error) {
    console.error('Error in fetchVideoSources:', error);
    
    // In case of error, return a dummy source
    return [{
      id: uuidv4(),
      provider: "error",
      embedUrl: `https://player.lovable.app/?error=true`,
      quality: "Error",
      isWorking: false
    }];
  }
};
