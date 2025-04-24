import { useState, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { 
  getEpisodeSources, 
  getBestSource,
  createProxyUrl,
  PROVIDERS, 
  AnimeProvider, 
  getSourcesFromMultipleProviders 
} from '../services/consumetService';

export interface VideoSource {
  id: string;
  provider: string;
  url: string;
  quality?: string;
  isM3U8?: boolean;
  headers?: Record<string, string>;
}

interface VideoPlayerState {
  sources: VideoSource[];
  isLoading: boolean;
  activeSource: VideoSource | null;
  error: string | null;
  currentTime: number;
}

export const useVideoPlayer = (
  episodeId: string | undefined, 
  animeTitle?: string, 
  episodeNumber?: number
) => {
  const [state, setState] = useState<VideoPlayerState>({
    sources: [],
    isLoading: false,
    activeSource: null,
    error: null,
    currentTime: 0
  });
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load sources when episodeId changes
  useEffect(() => {
    // Clean up previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (!episodeId && (!animeTitle || !episodeNumber)) return;
    
    const loadSources = async () => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      setRetryCount(0);
      
      abortControllerRef.current = new AbortController();
      
      try {
        if (episodeId) {
          console.log(`Loading sources for episode ID: ${episodeId}`);
          await fetchSourcesWithRetry(episodeId);
        } else if (animeTitle && episodeNumber) {
          console.log(`Loading sources for anime: ${animeTitle}, episode: ${episodeNumber}`);
          await fetchSourcesByTitleAndEpisode(animeTitle, episodeNumber);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('Request was aborted');
          return;
        }
        
        console.error("Error loading video sources:", err);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: "Failed to load video sources"
        }));
        toast({
          title: "Error",
          description: "Failed to load video sources. Please try again later.",
          variant: "destructive",
        });
      }
    };
    
    loadSources();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [episodeId, animeTitle, episodeNumber]);

  const fetchSourcesWithRetry = async (episodeId: string) => {
    try {
      // Try providers in order of reliability
      const providers = [
        PROVIDERS.GOGOANIME,
        PROVIDERS.ZORO,
        PROVIDERS.ANIMEFOX
      ];

      let foundSources = false;
      const allSources: VideoSource[] = [];
      
      for (const provider of providers) {
        try {
          console.log(`Trying provider: ${provider}`);
          const sources = await getEpisodeSources(episodeId, provider);
          
          if (sources && sources.sources && sources.sources.length > 0) {
            console.log(`Found ${sources.sources.length} sources from ${provider}`);
            
            // Transform sources to our format
            const transformedSources = sources.sources.map((source, idx) => ({
              id: `${provider}-${idx}`,
              provider: provider,
              url: source.url,
              quality: source.quality || 'unknown',
              isM3U8: source.isM3U8 || source.url.includes('.m3u8'),
              headers: sources.headers
            }));

            allSources.push(...transformedSources);
            foundSources = true;
          }
        } catch (err) {
          console.error(`Error with provider ${provider}:`, err);
        }
      }
      
      if (foundSources) {
        // Sort sources by quality and provider
        const sortedSources = sortSourcesByQuality(allSources);
        
        setState(prev => ({
          ...prev,
          sources: sortedSources,
          activeSource: sortedSources[0] || null,
          isLoading: false
        }));
      } else {
        throw new Error('No sources found from any provider');
      }

    } catch (err) {
      if (retryCount < maxRetries) {
        setRetryCount(prev => prev + 1);
        console.log(`Retry attempt ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchSourcesWithRetry(episodeId);
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: "Failed to find any video sources after multiple attempts"
        }));
        throw err;
      }
    }
  };

  const fetchSourcesByTitleAndEpisode = async (title: string, episode: number) => {
    try {
      const { sources, provider } = await getSourcesFromMultipleProviders(
        title, 
        episode,
        [PROVIDERS.GOGOANIME, PROVIDERS.ZORO, PROVIDERS.ANIMEFOX]
      );
      
      if (sources && sources.sources && sources.sources.length > 0) {
        // Transform sources to our format
        const transformedSources: VideoSource[] = sources.sources.map((source, idx) => ({
          id: `${provider}-${idx}`,
          provider,
          url: source.url,
          quality: source.quality || 'unknown',
          isM3U8: source.isM3U8 || source.url.includes('.m3u8'),
          headers: sources.headers
        }));
        
        // Sort sources by quality and provider
        const sortedSources = sortSourcesByQuality(transformedSources);
        
        setState(prev => ({
          ...prev,
          sources: sortedSources,
          activeSource: sortedSources[0] || null,
          isLoading: false
        }));
        
        toast({
          title: "Sources Loaded",
          description: `Found ${transformedSources.length} sources from ${provider}`,
        });
      } else {
        throw new Error(`No sources found for ${title} episode ${episode}`);
      }
    } catch (error) {
      console.error("Error fetching sources by title and episode:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to find sources for ${title} episode ${episode}`
      }));
      throw error;
    }
  };
  
  // Sort sources by quality (highest first) and provider preference
  const sortSourcesByQuality = (sources: VideoSource[]): VideoSource[] => {
    return [...sources].sort((a, b) => {
      // Extract quality values (assuming format like "720p", "1080p", etc.)
      const getQualityValue = (quality: string | undefined): number => {
        if (!quality) return 0;
        const match = quality.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      
      const qualityA = getQualityValue(a.quality);
      const qualityB = getQualityValue(b.quality);
      
      // If qualities are different, sort by quality (descending)
      if (qualityA !== qualityB) {
        return qualityB - qualityA;
      }
      
      // If qualities are the same, sort by provider preference
      const providerOrder: AnimeProvider[] = [
        PROVIDERS.GOGOANIME,
        PROVIDERS.ZORO,
        PROVIDERS.ANIMEFOX,
        PROVIDERS.ANIMEPAHE,
        PROVIDERS.CRUNCHYROLL
      ];
      
      const indexA = providerOrder.indexOf(a.provider as AnimeProvider);
      const indexB = providerOrder.indexOf(b.provider as AnimeProvider);
      
      return indexA - indexB;
    });
  };

  // Change active source
  const changeSource = (sourceId: string) => {
    const source = state.sources.find(s => s.id === sourceId);
    if (source) {
      setState(prev => ({ ...prev, activeSource: source }));
      
      toast({
        title: "Source Changed",
        description: `Now playing ${source.quality || 'video'} from ${getServerName(source.provider)}`,
      });
      
      return true;
    }
    return false;
  };
  
  // Get friendly name for provider
  const getServerName = (provider: string): string => {
    const serverNames: Record<string, string> = {
      [PROVIDERS.GOGOANIME]: "Server 1",
      [PROVIDERS.ZORO]: "Server 2",
      [PROVIDERS.ANIMEPAHE]: "Server 3",
      [PROVIDERS.ANIMEFOX]: "Server 4",
      [PROVIDERS.CRUNCHYROLL]: "Server 5"
    };
    
    return serverNames[provider] || "Server";
  };
  
  // Update current time
  const updateCurrentTime = (time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  };
  
  // Get a proxy URL for the current active source to avoid CORS issues
  const getProxyUrl = () => {
    if (!state.activeSource) return '';
    
    return createProxyUrl({
      url: state.activeSource.url,
      quality: state.activeSource.quality,
      isM3U8: state.activeSource.isM3U8
    });
  };

  return {
    ...state,
    changeSource,
    getServerName,
    updateCurrentTime,
    getProxyUrl
  };
};