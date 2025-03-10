
import React, { useState } from 'react';
import { VideoSource, getPlayerUrl } from '../services/videoSourceService';
import VideoPlayer from './VideoPlayer';
import { Loader2 } from 'lucide-react';

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
  isLoading = false
}) => {
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(
    sources.length > 0 ? sources[0] : null
  );
  const [embedMode, setEmbedMode] = useState<'direct' | 'iframe'>(
    sources.length > 0 && (sources[0].directUrl || sources[0].url) ? 'direct' : 'iframe'
  );

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

  // For demo purposes, we're using our own VideoPlayer component
  // In a real implementation with embed sources, we'd use iframes
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
              className={`px-3 py-1 text-xs rounded-full ${
                selectedSource?.id === source.id
                  ? 'bg-anime-purple text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              onClick={() => setSelectedSource(source)}
            >
              {source.provider} {source.quality}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoEmbed;
