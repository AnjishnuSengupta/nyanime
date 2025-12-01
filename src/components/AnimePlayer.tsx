import React, { useState, useEffect } from 'react';
import { getStreamingSources, VideoSource } from '../services/aniwatchApiService';
import aniwatchApi from '../services/aniwatchApiService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import VideoPlayer from './VideoPlayer';

interface AnimePlayerProps {
  /**
   * The Aniwatch episode ID (e.g., "one-punch-man-2nd-season-1861?ep=43267")
   * When provided, this is used directly to fetch streaming sources without re-searching
   * This is the RECOMMENDED way to use this component for accurate episode matching
   */
  aniwatchEpisodeId?: string;
  /**
   * @deprecated Use aniwatchEpisodeId instead for accurate episode matching
   * Only used as fallback when aniwatchEpisodeId is not provided
   */
  episodeId?: string;
  animeTitle?: string;
  episodeNumber?: number;
  totalEpisodes?: number;
  initialTime?: number;
  audioType?: 'sub' | 'dub' | 'raw';
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  onTimeUpdate?: (time: number) => void;
  autoPlay?: boolean;
  className?: string;
}

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  aniwatchEpisodeId,
  episodeId,
  animeTitle,
  episodeNumber = 1,
  totalEpisodes = 1,
  initialTime = 0,
  audioType = 'sub',
  onPreviousEpisode,
  onNextEpisode,
  onEpisodeSelect,
  onTimeUpdate,
  autoPlay = true,
  className = ''
}) => {
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load streaming sources
  useEffect(() => {
    let isMounted = true;
    
    const loadSources = async () => {
      // IMPORTANT: We require aniwatchEpisodeId for accurate episode matching
      // The title-based fallback is unreliable for multi-season anime
      
      if (!aniwatchEpisodeId) {
        // Don't fall back to title search - wait for proper episode ID
        // This prevents playing wrong episodes from different seasons
        if (!animeTitle || !episodeNumber) {
          setIsLoading(false);
          setError('No episode information provided');
        }
        // Keep loading state - VideoPage should provide the episode ID
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        let streamingSources: VideoSource[] = [];
        
        // Use the direct episode ID from Aniwatch
        // This bypasses the search and ensures we get the exact episode
        console.log(`[AnimePlayer] Loading sources for episode ID: ${aniwatchEpisodeId}`);
        
        const streamingData = await getStreamingSources(aniwatchEpisodeId, audioType);
        
        if (streamingData && streamingData.sources && streamingData.sources.length > 0) {
          // Convert to VideoSource format
          streamingSources = aniwatchApi.convertToVideoSources(streamingData);
        }
        
        // Fallback to sub if dub/raw not available
        if (streamingSources.length === 0 && audioType !== 'sub') {
          console.log(`[AnimePlayer] ${audioType} not available, trying sub...`);
          const subData = await getStreamingSources(aniwatchEpisodeId, 'sub');
          if (subData && subData.sources && subData.sources.length > 0) {
            streamingSources = aniwatchApi.convertToVideoSources(subData);
            if (isMounted) {
              setError(`${audioType.toUpperCase()} not available, playing SUB version`);
            }
          }
        }
        
        if (!isMounted) return;
        
        setSources(streamingSources);
        
        if (streamingSources.length === 0) {
          setError('No streaming sources available for this episode. Try a different server.');
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('[AnimePlayer] Error loading sources:', err);
        setError(err instanceof Error ? err.message : 'Failed to load streaming sources');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSources();
    
    return () => {
      isMounted = false;
    };
  }, [aniwatchEpisodeId, animeTitle, episodeNumber, episodeId, audioType]);

  if (isLoading) {
    return (
      <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
        <div className="aspect-video bg-anime-darker flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Loading episode sources...</p>
            <p className="text-sm text-white/70">Using Aniwatch API</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && sources.length === 0) {
    return (
      <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
        <div className="aspect-video bg-anime-darker flex items-center justify-center">
          <Alert className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Episode</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
      <VideoPlayer
        sources={sources}
        title={animeTitle || 'Anime Episode'}
        episodeNumber={episodeNumber}
        totalEpisodes={totalEpisodes}
        onNextEpisode={onNextEpisode}
        onPreviousEpisode={onPreviousEpisode}
        onEpisodeSelect={onEpisodeSelect}
        initialProgress={initialTime}
        autoPlay={autoPlay}
        onTimeUpdate={onTimeUpdate}
        isLoading={false}
        error={sources.length > 0 ? error : null}
      />
    </div>
  );
};

export default AnimePlayer;
