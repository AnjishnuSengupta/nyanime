
import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, ServerIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { 
  PROVIDERS, 
  STREAMING_SERVERS, 
  AnimeProvider, 
  StreamingServer,
  getEpisodeSources,
  getAvailableServers
} from '../services/consumetService';

// Define interfaces for the component props
export interface VideoSource {
  id: string;
  provider: string;
  embedUrl?: string;
  directUrl?: string;
  quality?: string;
  isWorking?: boolean;
}

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
  episodeId?: string;
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
  onTimeUpdate,
  episodeId
}) => {
  const [activeEmbedIndex, setActiveEmbedIndex] = useState(0);
  const [activeProvider, setActiveProvider] = useState<AnimeProvider>(PROVIDERS.GOGOANIME);
  const [activeServer, setActiveServer] = useState<StreamingServer | undefined>(undefined);
  const [availableServers, setAvailableServers] = useState<string[]>([]);
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Effect to load sources or use fallback
  useEffect(() => {
    if (sources.length > 0) {
      // Use the provided sources if available
      const currentSource = sources[activeEmbedIndex];
      if (currentSource && currentSource.embedUrl) {
        setEmbedUrl(currentSource.embedUrl);
        setErrorMessage(null);
      } else {
        setErrorMessage("Selected source has no embed URL");
      }
    } else if (episodeId) {
      // Fetch sources directly from Consumet if episodeId is provided
      loadSourcesFromConsumet(episodeId);
    } else {
      setErrorMessage("No video sources available");
    }
  }, [sources, activeEmbedIndex, episodeId]);

  // Load available servers when provider changes or when component mounts
  useEffect(() => {
    if (episodeId) {
      loadAvailableServers(episodeId);
    }
  }, [activeProvider, episodeId]);

  const loadSourcesFromConsumet = async (episodeId: string) => {
    setLoadingSource(true);
    setErrorMessage(null);
    try {
      const sourceData = await getEpisodeSources(episodeId, activeProvider, activeServer);
      if (sourceData && sourceData.sources && sourceData.sources.length > 0) {
        // Extract the URL with the highest quality or the first one if no quality is specified
        const bestSource = sourceData.sources.find(src => src.quality === '1080p') || 
                          sourceData.sources.find(src => src.quality === '720p') ||
                          sourceData.sources[0];
        
        // Create a custom player URL
        if (bestSource.isM3U8) {
          setEmbedUrl(`https://hls-player.lovable.app/?url=${encodeURIComponent(bestSource.url)}`);
        } else {
          setEmbedUrl(`https://player.lovable.app/?url=${encodeURIComponent(bestSource.url)}`);
        }
        
        toast({
          title: "Source Loaded",
          description: `Loaded ${bestSource.quality || 'video'} source from ${activeProvider}`,
        });
      } else {
        setErrorMessage(`No sources found from ${activeProvider}`);
        toast({
          title: "No Sources Found",
          description: `Could not find sources for this episode from ${activeProvider}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error loading sources from Consumet:', error);
      setErrorMessage(`Error loading sources from ${activeProvider}`);
      toast({
        title: "Error",
        description: "Failed to load video sources. Please try another server.",
        variant: "destructive",
      });
    } finally {
      setLoadingSource(false);
    }
  };

  const loadAvailableServers = async (episodeId: string) => {
    try {
      const servers = await getAvailableServers(episodeId, activeProvider);
      if (servers && servers.length > 0) {
        setAvailableServers(servers.map(server => server.name));
        
        // Set the first server as active if none is selected
        if (!activeServer && servers[0]?.name) {
          const serverName = servers[0].name.toLowerCase();
          // Map the server name to STREAMING_SERVERS if possible
          const matchedServer = Object.values(STREAMING_SERVERS).find(
            val => serverName.includes(val)
          );
          if (matchedServer) {
            setActiveServer(matchedServer);
          }
        }
      } else {
        setAvailableServers([]);
      }
    } catch (error) {
      console.error('Error loading available servers:', error);
      setAvailableServers([]);
    }
  };

  const handleProviderChange = (provider: AnimeProvider) => {
    setActiveProvider(provider);
    setActiveServer(undefined);
    if (episodeId) {
      loadSourcesFromConsumet(episodeId);
    }
  };

  const handleServerChange = (server: string) => {
    // Try to map the server name to a StreamingServer type
    const serverName = server.toLowerCase();
    const matchedServer = Object.entries(STREAMING_SERVERS).find(
      ([_, val]) => serverName.includes(val)
    );
    
    if (matchedServer) {
      setActiveServer(matchedServer[1] as StreamingServer);
    } else {
      setActiveServer(undefined);
    }
    
    if (episodeId) {
      loadSourcesFromConsumet(episodeId);
    }
  };

  const handleEmbedSourceChange = (index: number) => {
    if (index >= 0 && index < sources.length) {
      setActiveEmbedIndex(index);
    }
  };

  // Group sources by provider for better display
  const groupSourcesByProvider = () => {
    const grouped: {[key: string]: VideoSource[]} = {};
    
    sources.forEach(source => {
      const provider = source.provider;
      const display = source.quality || `${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
      const key = `${provider}-${display}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      
      grouped[key].push(source);
    });
    
    return grouped;
  };

  const groupedEmbedSources = groupSourcesByProvider();

  if (isLoading || loadingSource) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-anime-purple" />
          <p className="text-white">Loading video sources...</p>
        </div>
      </div>
    );
  }

  if ((sources.length === 0 && !embedUrl && !episodeId) || errorMessage) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
          <AlertCircle className="h-4 w-4 text-anime-purple" />
          <AlertTitle>No Video Sources Available</AlertTitle>
          <AlertDescription>
            {errorMessage || "We couldn't find any video sources for this episode. Please try another provider or server."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-anime-dark rounded-xl overflow-hidden">
      <div className="relative w-full h-full">
        {embedUrl ? (
          <iframe
            src={embedUrl + (autoPlay ? '&autoplay=1' : '')}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
          ></iframe>
        ) : sources.length > 0 && sources[activeEmbedIndex]?.embedUrl ? (
          <iframe
            src={sources[activeEmbedIndex].embedUrl + (autoPlay ? '&autoplay=1' : '')}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
          ></iframe>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
              <AlertCircle className="h-4 w-4 text-anime-purple" />
              <AlertTitle>Loading Sources</AlertTitle>
              <AlertDescription>
                Please select a provider and server to load video.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {/* Provider selection dropdown */}
        <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="sm" 
                className="bg-anime-purple"
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                {activeProvider}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              className="bg-black/90 backdrop-blur-sm border-anime-purple/50 text-white"
              align="start"
            >
              {Object.values(PROVIDERS).map((provider) => (
                <DropdownMenuItem
                  key={provider}
                  className={`${activeProvider === provider 
                    ? 'bg-anime-purple/20 text-anime-purple' 
                    : 'text-white hover:bg-white/10'}`}
                  onClick={() => handleProviderChange(provider as AnimeProvider)}
                >
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Server selection dropdown */}
        <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="sm" 
                className="bg-anime-purple"
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                {activeServer || 'Default Server'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              className="bg-black/90 backdrop-blur-sm border-anime-purple/50 text-white"
              align="end"
            >
              {availableServers.length > 0 ? (
                availableServers.map((server) => (
                  <DropdownMenuItem
                    key={server}
                    className="text-white hover:bg-white/10"
                    onClick={() => handleServerChange(server)}
                  >
                    {server}
                  </DropdownMenuItem>
                ))
              ) : (
                sources.length > 0 ? (
                  Object.entries(groupedEmbedSources).map(([key, sources], groupIndex) => (
                    <React.Fragment key={key}>
                      {groupIndex > 0 && (
                        <div className="h-px bg-anime-purple/30 mx-1 my-1"></div>
                      )}
                      {sources.map((source, sourceIndex) => (
                        <DropdownMenuItem
                          key={source.id}
                          className={`${activeEmbedIndex === sources.indexOf(source) 
                            ? 'bg-anime-purple/20 text-anime-purple' 
                            : 'text-white hover:bg-white/10'}`}
                          onClick={() => handleEmbedSourceChange(sources.indexOf(source))}
                        >
                          {source.quality || `${source.provider.charAt(0).toUpperCase() + source.provider.slice(1)} Server ${sourceIndex + 1}`}
                          {source.isWorking === true && (
                            <span className="ml-2 text-green-500 text-xs">✓</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <DropdownMenuItem className="text-white/50" disabled>
                    No servers available
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Episode navigation */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
          <div className="flex gap-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button 
                variant="ghost" 
                className="text-white bg-white/10 hover:bg-white/20"
                onClick={onPreviousEpisode}
              >
                Previous
              </Button>
            )}
            
            {onEpisodeSelect && (
              <Button 
                variant="outline" 
                className="text-white bg-white/10 border-white/20 hover:bg-white/20"
                onClick={() => onEpisodeSelect(episodeNumber)}
              >
                Episode {episodeNumber}/{totalEpisodes}
              </Button>
            )}
            
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button 
                variant="ghost" 
                className="text-white bg-white/10 hover:bg-white/20"
                onClick={onNextEpisode}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEmbed;
