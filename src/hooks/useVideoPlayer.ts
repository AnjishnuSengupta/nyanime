
import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { getEpisodeSources, PROVIDERS, AnimeProvider } from '../services/consumetService';

export interface VideoSource {
  id: string;
  provider: string;
  url: string;
  quality?: string;
  isM3U8?: boolean;
}

interface VideoPlayerState {
  sources: VideoSource[];
  isLoading: boolean;
  activeSource: VideoSource | null;
  error: string | null;
}

export const useVideoPlayer = (episodeId: string) => {
  const [state, setState] = useState<VideoPlayerState>({
    sources: [],
    isLoading: false,
    activeSource: null,
    error: null
  });
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Load sources when episodeId changes
  useEffect(() => {
    if (!episodeId) return;
    
    const loadSources = async () => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      setRetryCount(0);
      
      try {
        console.log(`Loading sources for episode: ${episodeId}`);
        await fetchSourcesWithRetry();
      } catch (err) {
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
  }, [episodeId]);

  const fetchSourcesWithRetry = async () => {
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
              isM3U8: source.url.includes('.m3u8')
            }));

            allSources.push(...transformedSources);
            foundSources = true;
          }
        } catch (err) {
          console.error(`Error with provider ${provider}:`, err);
        }
      }
      
      if (foundSources) {
        setState(prev => ({
          ...prev,
          sources: allSources,
          activeSource: allSources[0] || null,
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
        return fetchSourcesWithRetry();
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

  return {
    ...state,
    changeSource,
    getServerName
  };
};
