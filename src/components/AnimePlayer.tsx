import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VideoSource, AniwatchTrack } from '../services/aniwatchApiService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import VideoPlayer from './VideoPlayer';


interface AnimePlayerProps {
  /**
   * The Aniwatch episode ID (e.g., "one-punch-man-2nd-season-1861?ep=43267")
   * When provided, this is used directly to fetch streaming sources without re-searching.
   */
  aniwatchEpisodeId?: string;
  /** @deprecated Use aniwatchEpisodeId instead */
  episodeId?: string;
  /** AniList numeric ID — used for fetching jimaku.cc subtitles */
  anilistId?: number;
  animeTitleEn?: string;
  animeTitleRo?: string;
  episodeNumber?: number;
  totalEpisodes?: number;
  initialTime?: number;
  audioType?: 'sub' | 'dub';
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  onEpisodeSelect?: (episodeNumber: number) => void;
  onTimeUpdate?: (time: number, duration: number) => void;
  onSourcesLoaded?: (sources: VideoSource[]) => void;
  activeSourceIndex?: number;
  onSourceChange?: (index: number) => void;
  autoPlay?: boolean;
  className?: string;
  preferredProvider?: string;
}

interface TorrentInfo {
  magnetLink: string;
  torrentUrl: string;
  title: string;
  seeders: number;
  sizeMb: number;
  fileName: string;
}


/** Infer a basic MIME type from the file extension. */
/**
 * Normalise raw track objects from AniFlix or jimaku.cc into the AniwatchTrack shape
 * that VideoPlayer expects: { lang: string, url: string }.
 * Filters out thumbnail-only tracks.
 */
function normaliseTracks(raw: Array<{ lang?: string; label?: string; url?: string; file?: string }>): AniwatchTrack[] {
  return (Array.isArray(raw) ? raw : [])
    .map(t => ({ lang: t.lang || t.label || 'English', url: t.url || t.file || '' }))
    .filter(t => t.url && !t.url.includes('thumbnails') && t.lang.toLowerCase() !== 'thumbnails');
}

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  aniwatchEpisodeId,
  episodeId: _episodeId,
  anilistId,
  animeTitleEn,
  animeTitleRo,
  episodeNumber = 1,
  totalEpisodes = 1,
  initialTime = 0,
  audioType = 'sub',
  onPreviousEpisode,
  onNextEpisode,
  onEpisodeSelect,
  onTimeUpdate,
  onSourcesLoaded,
  activeSourceIndex,
  onSourceChange,
  autoPlay = true,
  className = '',
  preferredProvider: _preferredProvider
}) => {
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AbortController to cancel in-flight requests when episode changes
  const abortRef = useRef<AbortController | null>(null);

  // Bubble sources upward whenever they change
  useEffect(() => {
    onSourcesLoaded?.(sources);
  }, [sources, onSourcesLoaded]);

  // Handle all sources failing — try AniFlix as direct fallback
  const handleSourcesFailed = useCallback(async () => {
    if (!anilistId || !episodeNumber) {
      setError('No streaming sources available. Please refresh.');
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      

      const epRes = await fetch(`${baseUrl}/api/anime/${anilistId}/episodes?audio=${audioType}`);
      if (!epRes.ok) throw new Error('Episode list failed');
      const epData = await epRes.json();
      const episodes = epData.episodes || [];

      const match = episodes.find(e => e.number === Number(episodeNumber)) || episodes[Number(episodeNumber) - 1];
      if (!match?.id) throw new Error('Episode not found in AniFlix');

      // match.id is already a full path like "watch/ally/20/sub/allmanga-1"
      const watchRes = await fetch(`${baseUrl}/api/aniflix/${match.id}`);
      if (!watchRes.ok) throw new Error('Watch fetch failed');
      const watchData = await watchRes.json();

      // Server normalizes the response: sources[].url (mapped from .file), subtitleTracks
      let rawUrl: string | null = null;
      const streamHeaders: Record<string, string> = {};

      if (Array.isArray(watchData.sources) && watchData.sources.length > 0) {
        const src = watchData.sources.find((s: { isM3U8?: boolean; url?: string; headers?: Record<string, string> }) => s.isM3U8) || watchData.sources[0];
        rawUrl = src.url || null;
        if (src.headers) {
          Object.assign(streamHeaders, src.headers);
        }
      } else if (watchData.url && typeof watchData.url === 'string') {
        rawUrl = watchData.url;
        Object.assign(streamHeaders, watchData.headers || {});
      }

      if (!rawUrl) throw new Error('No URL in AniFlix response');

      const hParam = Object.keys(streamHeaders).length > 0 ? btoa(JSON.stringify(streamHeaders)) : '';
      const proxiedUrl = hParam
        ? `${baseUrl}/stream?url=${encodeURIComponent(rawUrl)}&h=${hParam}`
        : `${baseUrl}/stream?url=${encodeURIComponent(rawUrl)}`;

      const aniflixTracks = normaliseTracks(watchData.subtitleTracks || []);

      setSources([{
        url: proxiedUrl,
        quality: 'Server 1 (Retry)',
        type: 'hls',
        isM3U8: true,
        tracks: aniflixTracks,
      }]);
      setError(null);
    } catch {
      setError('All streaming options exhausted. Please try a different episode or refresh.');
    }
  }, [anilistId, episodeNumber, audioType]);

  // Hybrid source resolution: AniFlix FIRST (immediate), then torrent search in parallel
  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let isMounted = true;

    const loadSources = async () => {
      setIsLoading(true);
      setError(null);
      setSources([]);

      if (!animeTitleEn && !animeTitleRo) {
        // Titles not loaded yet — wait for the effect to re-run with populated titles
        console.log('[AnimePlayer] Waiting for anime title data before fetching sources...');
        setIsLoading(true);
        return;
      }

      const isMovie = totalEpisodes === 1 && (animeTitleEn?.toLowerCase().includes('movie') || animeTitleRo?.toLowerCase().includes('movie'));

      try {
        const baseUrl = import.meta.env.VITE_API_URL || '';
        
        let retryCount = 0;
        const maxRetries = 5;
        let hasValidSources = false;
        let combinedSources: VideoSource[] = [];

        // Retry loop for backend orchestration
        while (retryCount < maxRetries && !hasValidSources && isMounted && !controller.signal.aborted) {
          if (retryCount > 0) {
            console.log(`[AnimePlayer] Sources empty, retrying (${retryCount}/${maxRetries})... waiting 3s`);
            await new Promise(r => setTimeout(r, 3000));
          }
          
          if (!isMounted || controller.signal.aborted) break;

          const params = new URLSearchParams({
            titleEn: animeTitleEn || '',
            titleRo: animeTitleRo || '',
            episode: String(episodeNumber),
            audio: audioType,
            isMovie: String(isMovie),
          });

          const url = `${baseUrl}/api/anime/${anilistId}/playback?${params.toString()}`;
          const res = await fetch(url, { signal: controller.signal });
          
          if (!res.ok) {
            if (res.status === 404) {
               console.log('[AnimePlayer] Playback orchestrator returned 404 — episode not available. Skipping retries.');
               break;
            }
            retryCount++;
            continue;
          }
          
          const data = await res.json();
          if (Array.isArray(data.sources) && data.sources.length > 0) {
            hasValidSources = true;
            // Map the backend source format to VideoSource format
            combinedSources = data.sources.map((s: any) => {
              // Ensure url uses absolute baseUrl
              const fullUrl = s.url.startsWith('/') ? `${baseUrl}${s.url}` : s.url;
              return {
                url: fullUrl,
                embedUrl: s.embedUrl ? (s.embedUrl.startsWith('/') ? `${baseUrl}${s.embedUrl}` : s.embedUrl) : undefined,
                quality: s.quality,
                type: s.type,
                isM3U8: s.isM3U8 || false,
                tracks: s.tracks || [],
              };
            });
          } else {
            retryCount++;
          }
        }
        
        if (!isMounted || controller.signal.aborted) return;
        
        setSources(combinedSources);

        if (combinedSources.length === 0) {
          setError('No viable streams found for this episode. The release may not be indexed yet — try again in a few minutes.');
        }

        setIsLoading(false);
      } catch (err) {
        if (!isMounted || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('[AnimePlayer] Critical error in stream pipeline:', err);
        setError('Failed to establish stream. Please try refreshing.');
        setIsLoading(false);
      }
    };

    void loadSources();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [aniwatchEpisodeId, anilistId, audioType, animeTitleEn, animeTitleRo, episodeNumber, totalEpisodes]);



  const [showDisclaimer, setShowDisclaimer] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDisclaimer(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading && sources.length === 0) {
    return (
      <div className={`w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
        <div className="aspect-video bg-anime-darker flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="font-medium">
              Connecting to streaming servers&hellip;
            </p>
            <p className="text-xs text-gray-400 mt-1">Fetching AniFlix &amp; searching torrent peers&hellip;</p>

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
    <div className={`relative w-full bg-anime-dark rounded-xl overflow-hidden ${className}`}>
      {showDisclaimer && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white/90 text-xs sm:text-sm px-4 py-2 rounded-lg border border-white/10 shadow-xl backdrop-blur-md text-center max-w-[90%] transition-opacity duration-1000">
          <p>If any ad shown are from stream providers, nyanime doesn't monetize using ads in their website.</p>
          <p className="text-white/50 text-[10px] mt-1 uppercase tracking-wider">— By NyAnime Team</p>
        </div>
      )}
      <VideoPlayer
        key={`${episodeNumber}-${sources[0]?.url || 'empty'}`}
        sources={sources}
        title={animeTitleEn || animeTitleRo || 'Anime Episode'}
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
        onProviderFailed={handleSourcesFailed}
        activeSourceIndex={activeSourceIndex}
        onSourceChange={onSourceChange}
        isTorrentMode={sources.length > 0 && (sources[0]?.url.includes('/torrent-stream') || sources[0]?.quality?.toLowerCase().includes('torrent'))}
      />
    </div>
  );
};

export default AnimePlayer;
