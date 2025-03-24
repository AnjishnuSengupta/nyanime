
import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { VideoSource } from '../services/videoSourceService';

interface VideoEmbedProps {
  sources: VideoSource[];
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  initialProgress?: number;
  autoPlay?: boolean;
  isLoading?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
}

const VideoEmbed: React.FC<VideoEmbedProps> = ({
  sources,
  title,
  episodeNumber,
  totalEpisodes,
  thumbnail,
  onNextEpisode,
  onPreviousEpisode,
  onEpisodeSelect,
  initialProgress = 0,
  autoPlay = false,
  isLoading = false,
  onTimeUpdate
}) => {
  const hasDirectSources = sources.some(source => source.directUrl);
  const hasEmbedSources = sources.some(source => source.embedUrl);
  const [embedVisible, setEmbedVisible] = useState(!hasDirectSources && hasEmbedSources);
  const [activeEmbedIndex, setActiveEmbedIndex] = useState(0);

  // Get the best embed source (prioritize working ones)
  const embedSources = sources
    .filter(source => source.embedUrl)
    .sort((a, b) => {
      if (a.isWorking === true && b.isWorking !== true) return -1;
      if (a.isWorking !== true && b.isWorking === true) return 1;
      return 0;
    });

  // Effect to switch to direct player if possible
  useEffect(() => {
    setEmbedVisible(!hasDirectSources && hasEmbedSources);
  }, [hasDirectSources, hasEmbedSources, sources]);

  // Get direct video URL from the first available source
  const getDirectSources = () => {
    return sources.filter(source => source.directUrl);
  };

  const getCurrentEmbedSource = () => {
    if (embedSources.length === 0) return null;
    return embedSources[activeEmbedIndex];
  };

  const handleEmbedSourceChange = (index: number) => {
    if (index >= 0 && index < embedSources.length) {
      setActiveEmbedIndex(index);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-anime-purple" />
          <p className="text-white">Loading video sources...</p>
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
          <AlertCircle className="h-4 w-4 text-anime-purple" />
          <AlertTitle>No Video Sources Available</AlertTitle>
          <AlertDescription>
            We couldn't find any video sources for this episode.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (embedVisible) {
    const currentEmbed = getCurrentEmbedSource();
    if (!currentEmbed) return null;

    return (
      <div className="w-full aspect-video bg-anime-dark rounded-xl overflow-hidden">
        <div className="relative w-full h-full">
          <iframe
            src={currentEmbed.embedUrl}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
          ></iframe>
          {embedSources.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
              <div className="flex flex-wrap gap-2">
                {embedSources.map((source, index) => (
                  <Button
                    key={source.id}
                    size="sm"
                    variant={index === activeEmbedIndex ? "default" : "outline"}
                    className={index === activeEmbedIndex ? "bg-anime-purple" : "bg-black/50 border-white/20"}
                    onClick={() => handleEmbedSourceChange(index)}
                  >
                    {source.quality || `Source ${index + 1}`}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {hasDirectSources && (
            <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
              <Button
                size="sm"
                variant="outline"
                className="bg-black/50 text-white border-white/20"
                onClick={() => setEmbedVisible(false)}
              >
                Switch to Direct Player
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const directSources = getDirectSources();
  
  return (
    <div className="w-full">
      <VideoPlayer
        sources={directSources}
        title={title}
        episodeNumber={episodeNumber}
        totalEpisodes={totalEpisodes}
        thumbnail={thumbnail}
        onNextEpisode={onNextEpisode}
        onPreviousEpisode={onPreviousEpisode}
        onEpisodeSelect={onEpisodeSelect}
        initialProgress={initialProgress}
        autoPlay={autoPlay}
        onTimeUpdate={onTimeUpdate}
      />
      
      {hasEmbedSources && (
        <div className="mt-2 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="text-white/80 border-white/20 text-xs"
            onClick={() => setEmbedVisible(true)}
          >
            Switch to Embed Player
          </Button>
        </div>
      )}
    </div>
  );
};

export default VideoEmbed;
