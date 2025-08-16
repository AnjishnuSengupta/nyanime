import React, { useState, useEffect } from 'react';
import { getStreamingDataForEpisode, VideoSource } from '../services/updatedAniwatchService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import VideoPlayer from './VideoPlayer';

interface AnimePlayerProps {
  episodeId?: string;
  animeTitle?: string;
  episodeNumber?: number;
  totalEpisodes?: number;
  initialTime?: number;
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  onTimeUpdate?: (time: number) => void;
  autoPlay?: boolean;
  className?: string;
}

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  episodeId,
  animeTitle,
  episodeNumber = 1,
  totalEpisodes = 1,
  initialTime = 0,
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

  // Load streaming sources using our updated service
  useEffect(() => {
    const loadSources = async () => {
      if (!animeTitle || !episodeNumber) {
        console.log('❌ Missing required data:', { animeTitle, episodeNumber });
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`🎬 AnimePlayer: Loading sources for: ${animeTitle} Episode ${episodeNumber}`);
        
        // Use a default MAL ID for now (this should come from props in a real implementation)
        const malId = parseInt(episodeId || '1');
        const streamingSources = await getStreamingDataForEpisode(malId, animeTitle, episodeNumber);
        
        console.log(`✅ AnimePlayer: Loaded ${streamingSources.length} sources for ${animeTitle} Episode ${episodeNumber}`);
        console.log('📋 Sources:', streamingSources.map(s => ({ url: s.url, quality: s.quality, type: s.type })));
        setSources(streamingSources);
        
        if (streamingSources.length === 0) {
          setError('No streaming sources available for this episode');
        }
      } catch (err) {
        console.error('❌ AnimePlayer: Failed to load streaming sources:', err);
        setError(err instanceof Error ? err.message : 'Failed to load streaming sources');
      } finally {
        console.log('🔄 AnimePlayer: Setting isLoading to false');
        setIsLoading(false);
      }
    };

    loadSources();
  }, [animeTitle, episodeNumber, episodeId]);

  console.log('🎯 AnimePlayer render:', { isLoading, error, sourcesCount: sources.length });

  if (isLoading) {
    return (
      <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
        <div className="aspect-video bg-anime-darker flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Loading episode sources...</p>
            <p className="text-sm text-white/70">Using Updated Aniwatch Service</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
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
        error={error}
      />
    </div>
  );
};

export default AnimePlayer;
