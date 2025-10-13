import React, { useState, useEffect } from 'react';
import { getStreamingDataForEpisode, VideoSource } from '../services/aniwatchApiService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import VideoPlayer from './VideoPlayer';

interface AnimePlayerProps {
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

  // Load streaming sources using our updated service
  useEffect(() => {
    let isMounted = true;
    
    const loadSources = async () => {
      if (!animeTitle || !episodeNumber) {
        console.log('❌ Missing required data:', { animeTitle, episodeNumber });
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`🎬 AnimePlayer: Loading sources for: ${animeTitle} Episode ${episodeNumber} (${audioType})`);
        
        // Use the new Aniwatch API service with audio type
        const streamingSources = await getStreamingDataForEpisode(animeTitle, episodeNumber, audioType);
        
        if (!isMounted) return; // Prevent state update if component unmounted
        
        console.log(`✅ AnimePlayer: Loaded ${streamingSources.length} sources for ${animeTitle} Episode ${episodeNumber} (${audioType})`);
        console.log('📋 Sources:', streamingSources.map(s => ({ url: s.url, quality: s.quality, type: s.type })));
        setSources(streamingSources);
        
        if (streamingSources.length === 0) {
          // Try fallback to sub if dub/raw fails
          if (audioType !== 'sub') {
            console.log(`⚠️ No ${audioType} sources found, trying sub...`);
            const subSources = await getStreamingDataForEpisode(animeTitle, episodeNumber, 'sub');
            if (subSources.length > 0) {
              setSources(subSources);
              setError(`${audioType} not available, playing subtitled version`);
            } else {
              setError('No streaming sources available for this episode');
            }
          } else {
            setError('No streaming sources available for this episode');
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('❌ AnimePlayer: Failed to load streaming sources:', err);
        setError(err instanceof Error ? err.message : 'Failed to load streaming sources');
      } finally {
        if (isMounted) {
          console.log('🔄 AnimePlayer: Setting isLoading to false');
          setIsLoading(false);
        }
      }
    };

    loadSources();
    
    return () => {
      isMounted = false;
    };
  }, [animeTitle, episodeNumber, episodeId, audioType]);

  console.log('🎯 AnimePlayer render:', { isLoading, error, sourcesCount: sources.length });

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
