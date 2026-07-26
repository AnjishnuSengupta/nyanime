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
  /** MAL (MyAnimeList) numeric ID — used for MegaPlay embed URL construction */
  malId?: number;
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


/** Infer a basic MIME type from the file extension. */
/**
 * Normalise raw track objects from jimaku.cc into the AniwatchTrack shape
 * that VideoPlayer expects: { lang: string, url: string }.
 * Filters out thumbnail-only tracks.
 */
function normaliseTracks(raw: Array<{ lang?: string; label?: string; url?: string; file?: string }>): AniwatchTrack[] {
  return (Array.isArray(raw) ? raw : [])
    .map(t => ({ lang: t.lang || t.label || 'English', url: t.url || t.file || '' }))
    .filter(t => t.url && !t.url.includes('thumbnails') && t.lang.toLowerCase() !== 'thumbnails');
}

// Keep normaliseTracks in scope — it's used by the orchestrator response track merging
void normaliseTracks;

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  aniwatchEpisodeId,
  episodeId: _episodeId,
  anilistId,
  malId,
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

  // Handle all sources failing — simple error display
  const handleSourcesFailed = useCallback(() => {
    console.log('[AnimePlayer] All sources exhausted.');
    setError('No streaming sources found for this episode. Try a different server or come back later.');
  }, []);

  // Hybrid source resolution: orchestrator (MegaPlay + AllAnime + torrent), run in parallel
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

        // Build MegaPlay source immediately (Server 1) — available even if backend is down
        const lang = audioType === 'dub' ? 'dub' : 'sub';
        const megaplaySource: VideoSource | null = (malId && episodeNumber) ? {
          url: `https://megaplay.buzz/stream/mal/${malId}/${episodeNumber}/${lang}`,
          embedUrl: `https://megaplay.buzz/stream/mal/${malId}/${episodeNumber}/${lang}`,
          quality: 'Server 1',
          type: 'embed' as const,
          isM3U8: false,
          tracks: [],
        } : null;

        // Show MegaPlay immediately while backend sources load in the background
        if (megaplaySource) {
          setSources([megaplaySource]);
          setIsLoading(false);
        }
        
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
            combinedSources = data.sources.map((s: { url: string, embedUrl?: string, quality?: string, type?: string, isM3U8?: boolean, tracks?: unknown[] }) => {
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

        // --- Frontend AllAnime Resolution (Bypasses Cloudflare) ---
        try {
          const ALLANIME_EP_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';
          const titleToSearch = animeTitleEn || animeTitleRo;
          
          if (titleToSearch) {
            const allanimeApi = 'https://api.allanime.day/api';
            const searchQuery = 'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name englishName availableEpisodesDetail } } }';
            
            const searchRes = await fetch(`${allanimeApi}?variables=${encodeURIComponent(JSON.stringify({
              search: { allowAdult: false, allowUnknown: false, query: titleToSearch },
              limit: 3, page: 1, translationType: audioType, countryOrigin: 'ALL',
            }))}&query=${encodeURIComponent(searchQuery)}`, {
              headers: { Accept: 'application/json' }
            });
            
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const edges = searchData?.data?.shows?.edges || [];
              if (edges.length > 0) {
                const showId = edges[0]._id;
                
                const params = new URLSearchParams();
                params.set('variables', JSON.stringify({ showId, translationType: audioType, episodeString: String(episodeNumber) }));
                params.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: ALLANIME_EP_HASH } }));
                
                const sourcesRes = await fetch(`${allanimeApi}?${params.toString()}`, {
                  headers: { Accept: 'application/json' }
                });
                
                if (sourcesRes.ok) {
                  const sourcesText = await sourcesRes.text();
                  let rawSources: any[] = [];
                  
                  if (sourcesText.includes('"tobeparsed"')) {
                    const match = sourcesText.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
                    if (match) {
                      // Browser AES-CTR decryption using Web Crypto API
                      try {
                        const keyMaterial = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('Xot36i3lK3:v1'));
                        const key = await window.crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-CTR' }, false, ['decrypt']);
                        
                        const binaryString = atob(match[1]);
                        const buf = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) buf[i] = binaryString.charCodeAt(i);
                        
                        const ivBytes = buf.subarray(1, 13);
                        const iv = new Uint8Array(16);
                        iv.set(ivBytes, 0);
                        iv[15] = 2; // 00000002 counter
                        
                        const ciphertext = buf.subarray(13, buf.length - 16);
                        
                        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 128 }, key, ciphertext);
                        const decryptedStr = new TextDecoder().decode(decrypted);
                        
                        const urlMatches = decryptedStr.matchAll(/"sourceUrl"\s*:\s*"([^"]+)".*?"sourceName"\s*:\s*"([^"]+)"/g);
                        for (const m of urlMatches) {
                          rawSources.push({ sourceUrl: m[1].replace(/\\/g, ''), sourceName: m[2] });
                        }
                      } catch (err) {
                        console.error('[AllAnime Frontend] Decryption failed:', err);
                      }
                    }
                  } else {
                    try {
                      rawSources = JSON.parse(sourcesText)?.data?.episode?.sourceUrls || [];
                    } catch (e) { console.error('Failed to parse sources', e); }
                  }
                  
                  const hexMap: Record<string, string> = {'79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J','73':'K','74':'L','75':'M','76':'N','77':'O','68':'P','69':'Q','6a':'R','6b':'S','6c':'T','6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z','59':'a','5a':'b','5b':'c','5c':'d','5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n','57':'o','48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x','41':'y','42':'z','08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7','00':'8','01':'9','15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#','63':'[','65':']','78':'@','19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+','14':',','03':';','05':'=','1d':'%'};
                  
                  for (const s of rawSources) {
                    let url = s.sourceUrl;
                    if (url.startsWith('--')) {
                      const hexStr = url.slice(2);
                      let result = '';
                      for (let i = 0; i < hexStr.length; i += 2) {
                        const byte = hexStr.slice(i, i + 2).toLowerCase();
                        if (byte === '--') { result += '\n'; continue; }
                        result += hexMap[byte] || '';
                      }
                      url = result.replace('clock', 'clock.json');
                      if (url.startsWith('/')) url = 'https://api.allanime.day' + url;
                    }
                    
                    combinedSources.push({
                      url: `${baseUrl}/stream?url=${encodeURIComponent(url)}`,
                      quality: `Server 2 (${s.sourceName})`,
                      type: url.includes('.m3u8') ? 'hls' : 'mp4',
                      isM3U8: url.includes('.m3u8'),
                      tracks: []
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('[AllAnime Frontend] Failed:', err);
        }
        // --- End Frontend AllAnime Resolution ---

        // Re-label backend sources as Server 2, 3… (Server 1 is always MegaPlay)
        let serverIdx = 2;
        for (const src of combinedSources) {
          if (src.type !== 'torrent') {
            src.quality = `Server ${serverIdx++}`;
          }
        }

        // Prepend MegaPlay as Server 1, then anipy/torrent sources after
        if (megaplaySource) {
          combinedSources.unshift(megaplaySource);
        } else if (combinedSources.length === 0) {
          // No malId and no backend sources — clear error will show below
        }
        
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
  }, [aniwatchEpisodeId, anilistId, malId, audioType, animeTitleEn, animeTitleRo, episodeNumber, totalEpisodes]);



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
            <p className="text-sm text-gray-300">
              Loading streaming sources&hellip;
            </p>
            <p className="text-xs text-gray-300 mt-1">Searching torrents and MegaPlay&hellip;</p>

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
