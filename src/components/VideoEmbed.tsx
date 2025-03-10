
import React, { useState, useEffect } from 'react';
import { VideoSource, getPlayerUrl, fetchVideoSources } from '../services/videoSourceService';
import VideoPlayer from './VideoPlayer';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface VideoEmbedProps {
  sources: VideoSource[];
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail?: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  initialProgress?: number;
  autoPlay?: boolean;
  isLoading?: boolean;
}

const VideoEmbed: React.FC<VideoEmbedProps> = ({
  sources: initialSources,
  title,
  episodeNumber,
  totalEpisodes,
  thumbnail,
  onNextEpisode,
  onPreviousEpisode,
  onEpisodeSelect,
  initialProgress = 0,
  autoPlay = false,
  isLoading = false
}) => {
  const [sources, setSources] = useState<VideoSource[]>(initialSources);
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(
    initialSources.length > 0 ? initialSources[0] : null
  );
  const [embedMode, setEmbedMode] = useState<'direct' | 'iframe'>(
    initialSources.length > 0 && (initialSources[0].directUrl || initialSources[0].url) ? 'direct' : 'iframe'
  );
  const [isValidating, setIsValidating] = useState(false);
  const [validSources, setValidSources] = useState<Record<string, boolean>>({});

  // When initial sources change, update the component state
  useEffect(() => {
    if (initialSources.length > 0) {
      setSources(initialSources);
      setSelectedSource(initialSources[0]);
      setEmbedMode(
        initialSources[0].directUrl || initialSources[0].url ? 'direct' : 'iframe'
      );
    }
  }, [initialSources]);

  // Validate video sources by checking if they're accessible
  const validateVideoSource = async (source: VideoSource) => {
    if (validSources[source.id] !== undefined) {
      return validSources[source.id];
    }

    try {
      setIsValidating(true);
      
      // If there's a direct URL, check if it's accessible
      if (source.directUrl || source.url) {
        const videoUrl = source.directUrl || source.url || '';
        const response = await fetch(videoUrl, { method: 'HEAD' });
        
        const isValid = response.ok;
        setValidSources(prev => ({ ...prev, [source.id]: isValid }));
        
        return isValid;
      }
      
      // For embed URLs, we'll assume they're valid
      if (source.embedUrl) {
        setValidSources(prev => ({ ...prev, [source.id]: true }));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error validating video source:', error);
      setValidSources(prev => ({ ...prev, [source.id]: false }));
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Select a source and validate it
  const handleSourceSelect = async (source: VideoSource) => {
    setSelectedSource(source);
    setEmbedMode(source.directUrl || source.url ? 'direct' : 'iframe');
    
    // Validate the source if not already validated
    if (validSources[source.id] === undefined) {
      const isValid = await validateVideoSource(source);
      
      if (!isValid) {
        toast({
          title: "Source unavailable",
          description: "This video source might be unavailable. Try another source.",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="aspect-video bg-anime-dark flex items-center justify-center rounded-xl">
        <div className="text-white text-center p-4 flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <h3 className="text-xl font-bold">Loading video sources...</h3>
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="aspect-video bg-anime-dark flex items-center justify-center rounded-xl">
        <div className="text-white text-center p-4">
          <h3 className="text-xl font-bold mb-2">No video sources available</h3>
          <p className="text-sm text-white/70">
            We couldn't find any video sources for this episode. Please try another episode or check back later.
          </p>
        </div>
      </div>
    );
  }

  // Get the appropriate video URL (either directUrl or url from Consumet API)
  const getVideoUrl = (source: VideoSource): string | undefined => {
    return source.directUrl || source.url;
  };

  return (
    <div className="w-full">
      {selectedSource && (
        <>
          {embedMode === 'direct' && getVideoUrl(selectedSource) ? (
            <VideoPlayer
              src={getVideoUrl(selectedSource) || ''}
              title={title}
              episodeNumber={episodeNumber}
              totalEpisodes={totalEpisodes}
              thumbnail={thumbnail}
              onNextEpisode={onNextEpisode}
              onPreviousEpisode={onPreviousEpisode}
              onEpisodeSelect={onEpisodeSelect}
              initialProgress={initialProgress}
              autoPlay={autoPlay}
            />
          ) : selectedSource.embedUrl ? (
            <div className="relative aspect-video rounded-xl overflow-hidden">
              <iframe
                src={getPlayerUrl(selectedSource)}
                className="absolute top-0 left-0 w-full h-full"
                allowFullScreen
                frameBorder="0"
                title={`${title} - Episode ${episodeNumber}`}
                sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation"
              />
            </div>
          ) : (
            <div className="aspect-video bg-anime-dark flex items-center justify-center rounded-xl">
              <p className="text-white">Video source not available</p>
            </div>
          )}
        </>
      )}

      {sources.length > 1 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-white/70 text-sm">Sources:</span>
          {sources.map((source) => (
            <button
              key={source.id}
              className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 ${
                selectedSource?.id === source.id
                  ? 'bg-anime-purple text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              onClick={() => handleSourceSelect(source)}
            >
              {source.provider} {source.quality}
              {validSources[source.id] === true && (
                <CheckCircle2 className="h-3 w-3 text-green-400" />
              )}
              {validSources[source.id] === false && (
                <AlertCircle className="h-3 w-3 text-red-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoEmbed;
