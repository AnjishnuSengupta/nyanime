import { useState, useEffect, useCallback } from 'react';
import animeService, { 
  AnimeProvider, 
  PROVIDERS, 
  StreamingServer,
  EpisodeSources,
  Source,
  AnimeInfo
} from '@/lib/consumet/animeService';

interface PlayerState {
  loading: boolean;
  error: string | null;
  sources: Source[];
  currentSource: Source | null;
  currentTime: number;
  provider: AnimeProvider;
  availableProviders: AnimeProvider[];
  availableServers: string[];
  currentServer?: StreamingServer;
  currentQuality: string;
  qualities: string[];
  anime: AnimeInfo | null;
  subtitles: { label: string; src: string }[];
}

interface PlayerOptions {
  autoPlay?: boolean;
  defaultProvider?: AnimeProvider;
  defaultServer?: StreamingServer;
  initialTime?: number;
}

export function useAnimePlayer(
  animeId?: string,
  episodeId?: string,
  episodeNumber?: number,
  animeTitle?: string,
  options?: PlayerOptions
) {
  const [state, setState] = useState<PlayerState>({
    loading: false,
    error: null,
    sources: [],
    currentSource: null,
    currentTime: options?.initialTime || 0,
    provider: options?.defaultProvider || PROVIDERS.GOGOANIME,
    availableProviders: [
      PROVIDERS.GOGOANIME, 
      PROVIDERS.ZORO,
      PROVIDERS.ANIMEFOX,
      PROVIDERS.ANIMEPAHE
    ],
    availableServers: [],
    currentServer: options?.defaultServer,
    currentQuality: 'auto',
    qualities: [],
    anime: null,
    subtitles: []
  });

  const loadSources = useCallback(async () => {
    if ((!episodeId && (!animeTitle || !episodeNumber))) {
      setState(prev => ({ ...prev, error: 'Missing episode information' }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      let sources: EpisodeSources;
      let anime: AnimeInfo | null = null;
      
      if (episodeId) {
        // Direct episode ID method
        sources = await animeService.getEpisodeSources(
          episodeId, 
          state.provider,
          state.currentServer
        );
        
        // Also try to load available servers
        const servers = await animeService.getServers(episodeId, state.provider);
        const serverNames = servers.map(server => server.name);
        
        setState(prev => ({ ...prev, availableServers: serverNames }));
      } else if (animeTitle) {
        // Search by title and episode method
        const result = await animeService.getSourcesByTitleAndEpisode(
          animeTitle,
          episodeNumber || 1,
          state.provider,
          state.currentServer
        );
        
        sources = result.sources;
        anime = result.anime;
      } else {
        throw new Error('Either episodeId or animeTitle+episodeNumber are required');
      }

      if (!sources.sources || sources.sources.length === 0) {
        throw new Error(`No sources found for this episode with provider ${state.provider}`);
      }

      // Extract available qualities
      const qualities = sources.sources
        .filter(source => source.quality)
        .map(source => source.quality as string)
        .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

      // Get best source (prefer 1080p, then 720p, then first available)
      const bestSource = 
        sources.sources.find(s => s.quality === '1080p') || 
        sources.sources.find(s => s.quality === '720p') || 
        sources.sources[0];

      // Extract subtitles if available
      const subtitles = sources.subtitles 
        ? sources.subtitles.map(sub => ({
            label: sub.language,
            src: sub.url
          }))
        : [];
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: null,
        sources: sources.sources,
        currentSource: bestSource,
        qualities,
        currentQuality: bestSource.quality || 'auto',
        anime,
        subtitles
      }));
    } catch (error) {
      console.error('Error loading sources:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to load video sources' 
      }));
    }
  }, [episodeId, animeTitle, episodeNumber, state.provider, state.currentServer]);

  // Load sources when component mounts or dependencies change
  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Change provider
  const changeProvider = useCallback((provider: AnimeProvider) => {
    setState(prev => ({ ...prev, provider, currentServer: undefined }));
    // Trigger reload of sources with new provider
    setTimeout(loadSources, 0);
  }, [loadSources]);

  // Change server
  const changeServer = useCallback((server: StreamingServer) => {
    setState(prev => ({ ...prev, currentServer: server }));
    // Trigger reload of sources with new server
    setTimeout(loadSources, 0);
  }, [loadSources]);

  // Change quality
  const changeQuality = useCallback((quality: string) => {
    const source = state.sources.find(s => s.quality === quality);
    if (source) {
      setState(prev => ({ 
        ...prev, 
        currentSource: source,
        currentQuality: quality
      }));
    }
  }, [state.sources]);

  // Update current time
  const updateTime = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  // Handle player errors
  const handleError = useCallback(() => {
    // If error happens with current source, try next source
    const currentIndex = state.sources.findIndex(s => 
      s.url === state.currentSource?.url
    );
    
    if (currentIndex >= 0 && currentIndex < state.sources.length - 1) {
      const nextSource = state.sources[currentIndex + 1];
      setState(prev => ({
        ...prev,
        currentSource: nextSource,
        currentQuality: nextSource.quality || 'auto'
      }));
    } else {
      // If we've tried all sources in current provider, suggest changing provider
      setState(prev => ({
        ...prev,
        error: `Playback failed with ${state.provider}. Try another provider.`
      }));
    }
  }, [state.sources, state.currentSource, state.provider]);

  // Get proxy URL for player to avoid CORS issues
  const getPlayerUrl = useCallback((source: Source | null) => {
    if (!source) return '';
    
    if (source.isM3U8) {
      return `https://hls-player.vercel.app/?url=${encodeURIComponent(source.url)}&autoplay=true&referer=https://nyanime.vercel.app`;
    }
    return `https://player.vercel.app/?url=${encodeURIComponent(source.url)}&autoplay=true&referer=https://nyanime.vercel.app`;
  }, []);

  return {
    ...state,
    loadSources,
    changeProvider,
    changeServer,
    changeQuality,
    updateTime,
    handleError,
    getPlayerUrl: () => getPlayerUrl(state.currentSource)
  };
}