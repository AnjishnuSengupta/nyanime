import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, ServerIcon, RefreshCcw } from 'lucide-react';
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
  getAvailableServers,
  searchAndGetEpisodeLinks
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
  animeTitle?: string;
  currentProvider?: AnimeProvider;
  onProviderChange?: (provider: AnimeProvider) => void;
  fallbackMode?: boolean;
  onRefresh?: () => void;
}

// Map providers to generic server names
const providerToServerName: Record<string, string> = {
  [PROVIDERS.GOGOANIME]: "Server 1",
  [PROVIDERS.ZORO]: "Server 2",
  [PROVIDERS.ANIMEPAHE]: "Server 3",
  [PROVIDERS.ANIMEFOX]: "Server 4",
  [PROVIDERS.CRUNCHYROLL]: "Server 5"
};

// Get server name from provider
const getServerName = (provider: string): string => {
  return providerToServerName[provider] || "Server";
};

// Get provider from server name
const getProviderFromServerName = (serverName: string): AnimeProvider => {
  const entry = Object.entries(providerToServerName).find(([_, value]) => value === serverName);
  return (entry ? entry[0] : PROVIDERS.GOGOANIME) as AnimeProvider;
};

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
  isLoading: externalIsLoading = false,
  onTimeUpdate,
  episodeId,
  animeTitle,
  currentProvider = PROVIDERS.GOGOANIME,
  onProviderChange,
  fallbackMode = false,
  onRefresh
}) => {
  const [activeEmbedIndex, setActiveEmbedIndex] = useState(0);
  const [activeProvider, setActiveProvider] = useState<AnimeProvider>(currentProvider || PROVIDERS.GOGOANIME);
  const [activeServer, setActiveServer] = useState<StreamingServer | undefined>(undefined);
  const [availableServers, setAvailableServers] = useState<string[]>([]);
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingError, setStreamingError] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const isLoading = externalIsLoading || loadingSource;

  // Update active provider when currentProvider prop changes
  useEffect(() => {
    if (currentProvider && currentProvider !== activeProvider) {
      setActiveProvider(currentProvider);
    }
  }, [currentProvider]);

  // Cancel previous requests when component unmounts or when dependencies change
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, []);

  // Effect to load sources from proper method depending on available data
  useEffect(() => {
    if (sources.length > 0 && !fallbackMode) {
      // Use the provided sources if available and not in fallback mode
      const currentSource = sources[activeEmbedIndex];
      if (currentSource && currentSource.embedUrl) {
        setEmbedUrl(currentSource.embedUrl);
        setErrorMessage(null);
        setStreamingError(false);
      } else {
        setErrorMessage("Selected source has no embed URL");
      }
    } else if (episodeId && fallbackMode) {
      // Use direct consumet method if in fallback mode with episode ID
      loadSourcesFromConsumet(episodeId);
    } else if (animeTitle && fallbackMode) {
      // Use search-based fallback if we have the anime title
      loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
    } else {
      setErrorMessage("No video sources available");
    }
  }, [sources, activeEmbedIndex, episodeId, animeTitle, fallbackMode, activeProvider, activeServer]);

  // Load available servers when provider changes or when component mounts
  useEffect(() => {
    if (episodeId && (fallbackMode || sources.length === 0)) {
      loadAvailableServers(episodeId);
    }
  }, [activeProvider, episodeId, fallbackMode]);

  const loadSourcesFromConsumet = async (episodeId: string) => {
    // Cancel previous request if any
    if (abortController) {
      abortController.abort();
    }
    
    const newController = new AbortController();
    setAbortController(newController);
    
    setLoadingSource(true);
    setErrorMessage(null);
    setStreamingError(false);
    
    try {
      toast({
        title: "Loading Sources",
        description: `Finding sources from ${getServerName(activeProvider)}...`,
        duration: 3000,
      });

      // Direct episode source method
      const sourceData = await getEpisodeSources(episodeId, activeProvider, activeServer);
      
      // Check if the request was aborted
      if (newController.signal.aborted) {
        console.log('Request was aborted');
        return;
      }
      
      if (sourceData && sourceData.sources && sourceData.sources.length > 0) {
        // Get the best quality source
        const bestSource = sourceData.sources.find(src => src.quality === '1080p') || 
                           sourceData.sources.find(src => src.quality === '720p') ||
                           sourceData.sources[0];
        
        // Create a custom player URL with referer parameter
        let playerUrl;
        if (bestSource.isM3U8) {
          playerUrl = `https://hls-player.vercel.app/?url=${encodeURIComponent(bestSource.url)}&referer=https://nyanime.vercel.app`;
        } else {
          playerUrl = `https://player.vercel.app/?url=${encodeURIComponent(bestSource.url)}&referer=https://nyanime.vercel.app`;
        }
        
        setEmbedUrl(playerUrl);
        
        toast({
          title: "Source Loaded",
          description: `Loaded ${bestSource.quality || 'video'} source from ${getServerName(activeProvider)}`,
        });
      } else {
        setErrorMessage(`No sources found from ${getServerName(activeProvider)}`);
        
        // Try the title-based method as a fallback if we have the title
        if (animeTitle) {
          await loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
        } else {
          toast({
            title: "No Sources Found",
            description: `Could not find sources for this episode from ${getServerName(activeProvider)}`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      if (newController.signal.aborted) return;
      
      console.error('Error loading sources from Consumet:', error);
      setErrorMessage(`Error loading sources from ${getServerName(activeProvider)}`);
      
      // Try the title-based method as a fallback if we have the title
      if (animeTitle) {
        await loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
      } else {
        toast({
          title: "Error",
          description: "Failed to load video sources. Please try another server.",
          variant: "destructive",
        });
      }
    } finally {
      if (!newController.signal.aborted) {
        setLoadingSource(false);
      }
    }
  };

  const loadSourcesByTitleAndEpisode = async (title: string, episode: number) => {
    setLoadingSource(true);
    setErrorMessage(null);
    setStreamingError(false);
    
    try {
      toast({
        title: "Searching for Sources",
        description: `Looking for "${title}" episode ${episode}...`,
        duration: 3000,
      });
      
      const { sources, provider } = await searchAndGetEpisodeLinks(title, episode, activeProvider);
      
      if (sources && sources.sources && sources.sources.length > 0) {
        const bestSource = sources.sources.find(src => src.quality === '1080p') || 
                          sources.sources.find(src => src.quality === '720p') ||
                          sources.sources[0];
        
        // Create a custom player URL with referer parameter
        let playerUrl;
        if (bestSource.isM3U8) {
          playerUrl = `https://hls-player.vercel.app/?url=${encodeURIComponent(bestSource.url)}&referer=https://nyanime.vercel.app`;
        } else {
          playerUrl = `https://player.vercel.app/?url=${encodeURIComponent(bestSource.url)}&referer=https://nyanime.vercel.app`;
        }
        
        setEmbedUrl(playerUrl);
        
        toast({
          title: "Source Found",
          description: `Found ${bestSource.quality || 'video'} source for "${title}" episode ${episode}`,
        });
      } else {
        setErrorMessage(`No sources found for "${title}" episode ${episode} from ${getServerName(activeProvider)}`);
        toast({
          title: "No Sources Found",
          description: `Try a different server for "${title}" episode ${episode}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error searching for episode sources:', error);
      setErrorMessage(`Error finding sources for "${title}" episode ${episode}`);
      toast({
        title: "Error",
        description: "Failed to find episode sources. Try another server.",
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
    
    if (onProviderChange) {
      onProviderChange(provider);
    }

    if (fallbackMode) {
      if (episodeId) {
        loadSourcesFromConsumet(episodeId);
      } else if (animeTitle) {
        loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
      }
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
    
    if (fallbackMode) {
      if (episodeId) {
        loadSourcesFromConsumet(episodeId);
      } else if (animeTitle) {
        loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
      }
    }
  };

  const handleEmbedSourceChange = (index: number) => {
    if (index >= 0 && index < sources.length) {
      setActiveEmbedIndex(index);
    }
  };

  const handleStreamingError = () => {
    setStreamingError(true);
  };

  const refreshPlayer = () => {
    setStreamingError(false);
    
    if (onRefresh) {
      onRefresh();
      return;
    }
    
    if (fallbackMode) {
      if (episodeId) {
        loadSourcesFromConsumet(episodeId);
      } else if (animeTitle) {
        loadSourcesByTitleAndEpisode(animeTitle, episodeNumber);
      }
    } else if (sources.length > 0) {
      // Try the next source
      const nextIndex = (activeEmbedIndex + 1) % sources.length;
      handleEmbedSourceChange(nextIndex);
    }
  };

  // Group sources by provider for better display
  const groupSourcesByProvider = () => {
    const grouped: {[key: string]: VideoSource[]} = {};
    
    sources.forEach(source => {
      const originalProvider = source.provider;
      const provider = originalProvider.split('-')[0] as AnimeProvider;
      const serverName = getServerName(provider);
      const display = source.quality || `${serverName} Quality`;
      const key = `${serverName}-${display}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      
      grouped[key].push(source);
    });
    
    return grouped;
  };

  const groupedEmbedSources = groupSourcesByProvider();

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

  if (streamingError) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
          <AlertCircle className="h-4 w-4 text-anime-purple" />
          <AlertTitle>Streaming Issue Detected</AlertTitle>
          <AlertDescription>
            We're having trouble loading this video. Try a different server or anime.
          </AlertDescription>
          <div className="mt-4 flex flex-col gap-2">
            <Button 
              variant="outline"
              className="border-anime-purple/50 text-white"
              onClick={refreshPlayer}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh App
            </Button>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleProviderChange(PROVIDERS.GOGOANIME)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 1
              </Button>
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleProviderChange(PROVIDERS.ZORO)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 2
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if ((sources.length === 0 && !embedUrl && !animeTitle && !episodeId) || errorMessage) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
        <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
          <AlertCircle className="h-4 w-4 text-anime-purple" />
          <AlertTitle>No Video Sources Available</AlertTitle>
          <AlertDescription>
            {errorMessage || "We couldn't find any video sources for this episode. Please try another provider or server."}
          </AlertDescription>
          <div className="mt-4 flex flex-col gap-2">
            <Button 
              variant="outline"
              className="border-anime-purple/50 text-white"
              onClick={refreshPlayer}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh Player
            </Button>
            
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleProviderChange(PROVIDERS.GOGOANIME)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 1
              </Button>
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleProviderChange(PROVIDERS.ZORO)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 2
              </Button>
            </div>
            
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={onPreviousEpisode}
              >
                Previous Episode
              </Button>
            )}
            
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={onNextEpisode}
              >
                Next Episode
              </Button>
            )}
          </div>
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
            referrerPolicy="origin"
            onError={handleStreamingError}
          ></iframe>
        ) : sources.length > 0 && sources[activeEmbedIndex]?.embedUrl ? (
          <iframe
            src={sources[activeEmbedIndex].embedUrl + (autoPlay ? '&autoplay=1' : '')}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="origin"
            onError={handleStreamingError}
          ></iframe>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
              <AlertCircle className="h-4 w-4 text-anime-purple" />
              <AlertTitle>Loading Sources</AlertTitle>
              <AlertDescription>
                Please select a server to load video.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {/* Provider selection dropdown - rename to Server selection */}
        <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="sm" 
                className="bg-anime-purple"
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                {getServerName(activeProvider)}
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
                  {getServerName(provider)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Server selection dropdown - rename to Source selection */}
        <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="sm" 
                className="bg-anime-purple"
                disabled={availableServers.length === 0 && sources.length === 0}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                {activeServer || 'Default Source'}
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
                          {source.quality || `Source ${sourceIndex + 1}`}
                          {source.isWorking === true && (
                            <span className="ml-2 text-green-500 text-xs">✓</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <DropdownMenuItem className="text-white/50" disabled>
                    No sources available
                  </DropdownMenuItem>
                )
              )}
              
              <div className="h-px bg-anime-purple/30 mx-1 my-1"></div>
              <DropdownMenuItem
                className="text-white hover:bg-white/10"
                onClick={refreshPlayer}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Refresh Sources
              </DropdownMenuItem>
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