
import { useState, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { getEpisodeSources, PROVIDERS, AnimeProvider } from '../services/consumetService';

export interface VideoSource {
  id: string;
  provider: string;
  directUrl?: string;
  embedUrl?: string;
  quality?: string;
  isWorking?: boolean;
}

export const useVideoPlayer = (episodeId: string) => {
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<VideoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Load sources when episodeId changes
  useEffect(() => {
    if (!episodeId) return;
    
    const loadSources = async () => {
      setIsLoading(true);
      setError(null);
      retryCountRef.current = 0;
      
      try {
        console.log(`Loading sources for episode: ${episodeId}`);
        await fetchSourcesWithRetry();
      } catch (err) {
        console.error("Error loading video sources:", err);
        setError("Error loading video sources");
        toast({
          title: "Error",
          description: "Failed to load video sources. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSources();
  }, [episodeId]);

  const fetchSourcesWithRetry = async () => {
    try {
      // Try different providers in order of reliability
      const providers = [
        PROVIDERS.GOGOANIME,
        PROVIDERS.ZORO,
        PROVIDERS.ANIMEFOX,
        PROVIDERS.ANIMEPAHE
      ];

      let foundSources = false;
      
      for (const provider of providers) {
        try {
          console.log(`Trying provider: ${provider}`);
          const sources = await getEpisodeSources(episodeId, provider);
          
          if (sources && sources.sources && sources.sources.length > 0) {
            console.log(`Found ${sources.sources.length} sources from ${provider}`);
            
            // Transform sources to our format
            const transformedSources = sources.sources.map((source, idx) => {
              const isM3U8 = source.url.includes('.m3u8');
              return {
                id: `${provider}-${idx}`,
                provider: provider,
                directUrl: source.url,
                embedUrl: isM3U8 
                  ? `https://hls-player.lovable.app/?url=${encodeURIComponent(source.url)}`
                  : `https://player.lovable.app/?url=${encodeURIComponent(source.url)}`,
                quality: source.quality || (isM3U8 ? 'HLS' : 'MP4'),
                isWorking: true
              };
            });

            setSources(prevSources => [...prevSources, ...transformedSources]);
            if (!activeSource) {
              setActiveSource(transformedSources[0]);
            }
            
            foundSources = true;
            break; // Stop trying other providers if we found sources
          }
        } catch (err) {
          console.error(`Error with provider ${provider}:`, err);
        }
      }

      if (!foundSources) {
        throw new Error('No sources found from any provider');
      }

    } catch (err) {
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`Retry attempt ${retryCountRef.current}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchSourcesWithRetry();
      } else {
        throw err;
      }
    }
  };

  // Change active source
  const changeSource = (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId);
    if (source) {
      setActiveSource(source);
      
      toast({
        title: "Source Changed",
        description: `Now playing ${source.quality || 'video'} from ${source.provider}`,
      });
      
      return true;
    }
    return false;
  };

  return {
    sources,
    isLoading,
    activeSource,
    error,
    changeSource
  };
};
