import React, { useState, useEffect, useRef } from 'react';
import { useAnimePlayer } from '@/hooks/useAnimePlayer';
import { AnimeProvider, PROVIDERS, StreamingServer } from '@/lib/consumet/animeService';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  RefreshCw,
  Film,
  Tv2,
  Loader2,
  AlertTriangle,
  Server
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

const providerNames: Record<string, string> = {
  [PROVIDERS.GOGOANIME]: 'Server 1 (GogoAnime)',
  [PROVIDERS.ZORO]: 'Server 2 (Kaido)',
  [PROVIDERS.ANIMEFOX]: 'Server 3 (AnimeFox)',
  [PROVIDERS.ANIMEPAHE]: 'Server 4 (AnimePahe)'
};

const getProviderName = (provider: string): string => {
  return providerNames[provider] || provider;
};

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
  const [showControls, setShowControls] = useState(false);
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const controlsTimeout = useRef<NodeJS.Timeout>();
  
  const {
    loading,
    error,
    currentSource,
    sources,
    provider,
    availableProviders,
    currentQuality,
    qualities,
    availableServers,
    currentServer,
    changeProvider,
    changeServer,
    changeQuality,
    loadSources,
    updateTime,
    handleError,
    getPlayerUrl
  } = useAnimePlayer(
    undefined, // animeId not needed
    episodeId,
    episodeNumber,
    animeTitle,
    { 
      autoPlay, 
      initialTime, 
      defaultProvider: PROVIDERS.GOGOANIME 
    }
  );

  // Update parent component with current time
  useEffect(() => {
    const interval = setInterval(() => {
      const video = document.querySelector('video');
      if (video && onTimeUpdate) {
        updateTime(video.currentTime);
        onTimeUpdate(video.currentTime);
      }
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, [onTimeUpdate, updateTime]);

  // Handle mouse movement to show controls
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  if (loading) {
    return (
      <div className={`w-full aspect-video bg-black flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-anime-purple" />
          <p className="text-white">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !currentSource) {
    return (
      <div className={`w-full aspect-video bg-black flex items-center justify-center ${className}`}>
        <Alert className="max-w-md bg-anime-dark/60 border-anime-purple text-white">
          <AlertTriangle className="h-4 w-4 text-anime-purple" />
          <AlertTitle>Playback Error</AlertTitle>
          <AlertDescription>
            {error || "Failed to load video sources. Please try another server."}
          </AlertDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="bg-anime-dark/70 border-anime-purple text-white"
              onClick={() => loadSources()}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-anime-dark/70 border-anime-purple text-white"
                >
                  <Server className="h-4 w-4 mr-2" /> Change Server
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-black/90 text-white">
                {availableProviders.map(p => (
                  <DropdownMenuItem 
                    key={p}
                    onClick={() => changeProvider(p)}
                    className={p === provider ? 'bg-anime-purple/20' : ''}
                  >
                    {getProviderName(p)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button
                variant="outline"
                className="bg-anime-dark/70 border-anime-purple text-white"
                onClick={onPreviousEpisode}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous Episode
              </Button>
            )}
            
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button
                variant="outline"
                className="bg-anime-dark/70 border-anime-purple text-white"
                onClick={onNextEpisode}
              >
                Next Episode <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </Alert>
      </div>
    );
  }

  const playerUrl = getPlayerUrl();

  return (
    <div 
      className={`relative w-full aspect-video bg-black ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      <iframe
        src={playerUrl}
        className="w-full h-full"
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        referrerPolicy="origin"
        onError={handleError}
      ></iframe>
      
      {/* Top controls - visible on hover */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white"
              onClick={() => loadSources()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Server selection */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-white bg-black/50"
                >
                  <Server className="h-4 w-4 mr-2" />
                  {getProviderName(provider)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-black/90 text-white backdrop-blur-md">
                {availableProviders.map(p => (
                  <DropdownMenuItem 
                    key={p}
                    onClick={() => changeProvider(p)}
                    className={p === provider ? 'bg-anime-purple/20' : ''}
                  >
                    {getProviderName(p)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Quality selection */}
            {qualities.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white bg-black/50"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {currentQuality || 'Auto'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black/90 text-white backdrop-blur-md">
                  {qualities.map(q => (
                    <DropdownMenuItem 
                      key={q}
                      onClick={() => changeQuality(q)}
                      className={q === currentQuality ? 'bg-anime-purple/20' : ''}
                    >
                      {q}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Server options if available */}
            {availableServers.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white bg-black/50"
                  >
                    <Film className="h-4 w-4 mr-2" />
                    {currentServer || 'Default'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black/90 text-white backdrop-blur-md">
                  {availableServers.map(server => (
                    <DropdownMenuItem 
                      key={server}
                      onClick={() => changeServer(server as StreamingServer)}
                      className={server === currentServer ? 'bg-anime-purple/20' : ''}
                    >
                      {server}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
      
      {/* Bottom controls - visible on hover */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center">
          <div className="flex items-center space-x-2">
            {onPreviousEpisode && episodeNumber > 1 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-white bg-black/50"
                onClick={onPreviousEpisode}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
            
            {onEpisodeSelect && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-white bg-black/50"
                onClick={() => setShowEpisodeList(prev => !prev)}
              >
                <Tv2 className="h-4 w-4 mr-1" />
                Episode {episodeNumber}/{totalEpisodes}
              </Button>
            )}
            
            {onNextEpisode && episodeNumber < totalEpisodes && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-white bg-black/50"
                onClick={onNextEpisode}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
      
      {/* Episode list modal */}
      {showEpisodeList && onEpisodeSelect && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-anime-dark/90 rounded-xl p-4 max-w-2xl max-h-[80vh] w-full overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-semibold">Episodes</h3>
              <Button 
                variant="ghost" 
                className="text-white"
                onClick={() => setShowEpisodeList(false)}
              >
                Close
              </Button>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map(ep => (
                <Button
                  key={ep}
                  variant={ep === episodeNumber ? "default" : "outline"}
                  className={ep === episodeNumber ? "bg-anime-purple" : "border-white/20 text-white"}
                  onClick={() => {
                    onEpisodeSelect(ep);
                    setShowEpisodeList(false);
                  }}
                >
                  {ep}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimePlayer;