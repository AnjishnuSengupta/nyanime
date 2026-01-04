import { useState, useEffect, useCallback } from 'react';
import { getStreamingDataForEpisode, VideoSource } from '../services/aniwatchApiService';
import { 
  AnimeProvider, 
  PROVIDERS, 
  StreamingServer,
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
      let videoSources: VideoSource[] = [];
      
      if (animeTitle && episodeNumber) {
        // Get streaming data using the new Aniwatch API service
        const streamingData = await getStreamingDataForEpisode(
          animeTitle,
          episodeNumber,
          'sub'
        );
        
        if (streamingData && streamingData.length > 0) {
          videoSources = streamingData;
        }
      } else {
        setState(prev => ({ ...prev, error: 'Anime title and episode number are required for streaming' }));
        return;
      }

      if (!videoSources || videoSources.length === 0) {
        throw new Error('No sources found for this episode');
      }

      // Convert VideoSource[] to Source[] format for compatibility
      const convertedSources: Source[] = videoSources.map(vs => ({
        url: vs.directUrl || vs.embedUrl || vs.url || '',
        quality: vs.quality || 'auto',
        isM3U8: vs.type === 'hls' || (vs.directUrl?.includes('.m3u8') || vs.embedUrl?.includes('.m3u8') || vs.url?.includes('.m3u8')) || false,
        headers: vs.headers // Preserve headers for streaming access
      }));

      // Extract available qualities
      const qualities = convertedSources
        .filter(source => source.quality && source.quality !== 'auto')
        .map(source => source.quality as string)
        .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

      // Get best source (prefer 1080p, then 720p, then first available)
      const bestSource = 
        convertedSources.find(s => s.quality === '1080p') || 
        convertedSources.find(s => s.quality === '720p') || 
        convertedSources[0];

      setState(prev => ({
        ...prev,
        loading: false,
        error: null,
        sources: convertedSources,
        currentSource: bestSource,
        qualities,
        currentQuality: bestSource.quality || 'auto',
        subtitles: [] // Subtitles will be handled later
      }));
    } catch (error) {
      console.error('Error loading sources:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Please refresh the browser or wait a moment. The backend server may be starting up.' 
      }));
    }
  }, [episodeId, animeTitle, episodeNumber]);

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