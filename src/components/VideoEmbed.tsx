
import React, { useState, useEffect } from 'react';
import { VideoSource, fetchVideoSources } from '../services/videoSourceService';
import VideoPlayer from './VideoPlayer';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

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
  const [loadingAdditionalSources, setLoadingAdditionalSources] = useState(false);

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

  // Load additional sources if initial ones fail
  const handleLoadAdditionalSources = async () => {
    if (sources.length === 0 || !selectedSource) return;
    
    setLoadingAdditionalSources(true);
    try {
      const episodeId = selectedSource.id.split('-')[0];
      const additionalSources = await fetchVideoSources(episodeId);
      
      // Filter out duplicates
      const existingIds = new Set(sources.map(s => s.id));
      const newSources = additionalSources.filter(s => !existingIds.has(s.id));
      
      if (newSources.length > 0) {
        const combined = [...sources, ...newSources];
        setSources(combined);
        toast({
          title: "Additional sources loaded",
          description: `Found ${newSources.length} new sources.`,
        });
      } else {
        toast({
          title: "No additional sources",
          description: "Couldn't find any new video sources.",
        });
      }
    } catch (error) {
      console.error('Error loading additional sources:', error);
      toast({
        title: "Error",
        description: "Failed to load additional sources.",
        variant: "destructive",
      });
    } finally {
      setLoadingAdditionalSources(false);
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
          <p className="text-sm text-white/70 mb-4">
            We couldn't find any video sources for this episode. Please try another episode or check back later.
          </p>
          <Button 
            onClick={handleLoadAdditionalSources}
            disabled={loadingAdditionalSources}
            className="bg-anime-purple hover:bg-anime-purple/90"
          >
            {loadingAdditionalSources ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Search Additional Sources
              </>
            )}
          </Button>
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
                src={selectedSource.embedUrl}
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

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white/70 text-sm">Sources:</span>
          {sources.slice(0, 5).map((source) => (
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
          
          {sources.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:bg-white/10 text-xs h-6 px-2"
              onClick={() => {
                const dialog = document.getElementById('sources-dialog') as HTMLDialogElement;
                if (dialog) dialog.showModal();
              }}
            >
              +{sources.length - 5} more
            </Button>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          className="text-white/70 hover:bg-white/10 text-xs h-6 px-2"
          onClick={handleLoadAdditionalSources}
          disabled={loadingAdditionalSources}
        >
          {loadingAdditionalSources ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ExternalLink className="h-3 w-3" />
          )}
          <span className="ml-1">More</span>
        </Button>
      </div>
      
      {/* Modal for all sources when there are many */}
      <dialog id="sources-dialog" className="bg-anime-dark rounded-xl p-0 text-white backdrop:bg-black/80">
        <div className="p-4 max-w-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">All Video Sources</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:bg-white/10"
              onClick={() => {
                const dialog = document.getElementById('sources-dialog') as HTMLDialogElement;
                if (dialog) dialog.close();
              }}
            >
              Close
            </Button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto p-2">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`px-3 py-2 text-xs rounded-md flex items-center justify-between gap-1 ${
                  selectedSource?.id === source.id
                    ? 'bg-anime-purple text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                onClick={() => {
                  handleSourceSelect(source);
                  const dialog = document.getElementById('sources-dialog') as HTMLDialogElement;
                  if (dialog) dialog.close();
                }}
              >
                <span>{source.provider} {source.quality}</span>
                {validSources[source.id] === true && (
                  <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
                )}
                {validSources[source.id] === false && (
                  <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
};

export default VideoEmbed;
