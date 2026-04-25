import React, { useState, useEffect, useCallback } from 'react';
import { getStreamingSources, VideoSource } from '../services/aniwatchApiService';
import aniwatchApi from '../services/aniwatchApiService';
import { Loader2, AlertTriangle, Server } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  audioType?: 'sub' | 'dub';
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  onTimeUpdate?: (time: number) => void;
  autoPlay?: boolean;
  className?: string;
}

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  aniwatchEpisodeId,
  _episodeId,
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
  const [servers, setServers] = useState<{ linkId: string; name: string }[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(undefined);
  const [retryState, setRetryState] = useState<{ episodeId?: string; count: number }>({
    episodeId: aniwatchEpisodeId,
    count: 0,
  });
  const sourceRetryCount = retryState.episodeId === aniwatchEpisodeId ? retryState.count : 0;
  // AbortController to cancel in-flight source requests when episode changes
  const abortRef = React.useRef<AbortController | null>(null);

  // Re-fetch sources when CDN blocks all proxy attempts.
  // The server generates fresh CDN tokens each time, which may land on
  // a different CDN edge or arrive during an unblocked window.
  const handleSourcesFailed = useCallback(() => {
    if (sourceRetryCount >= 2) {
      setError('CDN is blocking playback. Please try again in a few minutes or use a different browser.');
      return;
    }
    setRetryState((prev) => {
      const currentCount = prev.episodeId === aniwatchEpisodeId ? prev.count : 0;
      return {
        episodeId: aniwatchEpisodeId,
        count: currentCount + 1,
      };
    });
  }, [sourceRetryCount, aniwatchEpisodeId]);

  // Load streaming sources from Aniwatch API
  useEffect(() => {
    // Abort any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let isMounted = true;
    
    const loadSources = async () => {
      // IMPORTANT: We require aniwatchEpisodeId for accurate episode matching
      // The title-based fallback is unreliable for multi-season anime
      
      if (!aniwatchEpisodeId) {
        setIsLoading(false);
        setError('No episode information provided');
        return;
      }

      setIsLoading(true);
      setError(null);
      setSources([]); // Clear stale sources immediately
      
      try {
        let streamingSources: VideoSource[] = [];
        
        // For AnimeKAI episodes, fetch servers list and handle selection
        let currentServerParam: string | undefined = selectedServerId;
        if (aniwatchEpisodeId.includes('animekai::')) {
          try {
            const serverData = await aniwatchApi.getEpisodeServers(aniwatchEpisodeId);
            if (serverData) {
              const serverList = audioType === 'dub' ? serverData.dub : serverData.sub;
              if (serverList.length > 0) {
                setServers(serverList.map(s => ({ linkId: s.linkId, name: s.name })));
                // Use selected server if available, otherwise default to first
                if (!currentServerParam) {
                  currentServerParam = serverList[0].linkId || String(serverList[0].serverId);
                  setSelectedServerId(currentServerParam);
                }
              }
            }
          } catch (err) {
            console.warn('[AnimePlayer] Could not fetch servers, will use default', err);
          }
        }
        
        const streamingData = await getStreamingSources(aniwatchEpisodeId, audioType, currentServerParam, sourceRetryCount > 0, controller.signal);
        
        if (streamingData && streamingData.sources && streamingData.sources.length > 0) {
          // Convert to VideoSource format
          streamingSources = aniwatchApi.convertToVideoSources(streamingData);
        }
        
        // Fallback to sub if dub/raw not available
        if (streamingSources.length === 0 && audioType !== 'sub') {
          const subData = await getStreamingSources(aniwatchEpisodeId, 'sub', currentServerParam, false, controller.signal);
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
        
        setIsLoading(false);
      } catch (err) {
        if (!isMounted) return;
        // Don't show error if request was intentionally aborted (episode changed)
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[AnimePlayer] Error loading sources:', err);
        setError('Failed to load streaming sources. Please try refreshing or selecting a different server.');
        setIsLoading(false);
      }
    };

    loadSources();
    
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [aniwatchEpisodeId, audioType, sourceRetryCount, selectedServerId]);

  if (isLoading && sources.length === 0) {
    return (
      <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
        <div className="aspect-video bg-anime-darker flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>{sourceRetryCount > 0 ? `Retrying with fresh CDN tokens (attempt ${sourceRetryCount + 1}/3)...` : 'Loading episode sources...'}</p>
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
      {servers.length > 1 && (
        <div className="flex items-center justify-end p-2 bg-anime-darker border-b border-white/5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10 h-8 px-3 rounded-lg">
                <Server className="h-3 w-3 mr-2" />
                Server: {servers.find(s => s.linkId === selectedServerId)?.name || 'Default'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-anime-dark border-anime-purple/50 text-white">
              <DropdownMenuLabel>Select Server</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              {servers.map((server) => (
                <DropdownMenuItem
                  key={server.linkId}
                  className={`cursor-pointer ${selectedServerId === server.linkId ? 'bg-anime-purple/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  onClick={() => setSelectedServerId(server.linkId)}
                >
                  {server.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
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
         isLoading={isLoading}
        error={sources.length > 0 ? error : null}
        onSourcesFailed={handleSourcesFailed}
      />
    </div>
  );
};

export default AnimePlayer;
