import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, MessageSquare, Share2, Flag, List, Clock, FileBadge, Play, Search, Radio, AlertTriangle, Server } from 'lucide-react';
import Header from '../components/Header';
import { useAnimeById } from '../hooks/useAnimeData';
import { SEO, getVideoSchema } from '../lib/seo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import AnimePlayer from '../components/AnimePlayer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VideoSource } from '../services/aniwatchApiService';
import { getCurrentUser, updateHistory, getUserData } from '../services/firebaseAuthService';
interface EpisodeData {
  id: string;
  number: number;
  title: string;
  isFiller: boolean;
}

const VideoPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // URL params
  const epParam = searchParams.get('ep') || searchParams.get('episode');
  const providerParam = searchParams.get('provider') || 'torrent';
  
  // State
  const [currentEpisode, setCurrentEpisode] = useState<number>(() => {
    const val = epParam || '1';
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  });
  const [currentProvider, setCurrentProvider] = useState<string>(providerParam);
  const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError] = useState<string | null>(null);
  // Live sources from AnimePlayer — used to render the dynamic server switcher
  const [loadedSources, setLoadedSources] = useState<VideoSource[]>([]);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [initialTime, setInitialTime] = useState(0);
  const lastUpdateTimeRef = React.useRef<number>(0);
  
  // Fetch primary anime data (from AniList)
  const { data: anime, isLoading: isAnimeLoading, error: animeError } = useAnimeById(Number(id));
  
  // Sync URL params with state initially
  useEffect(() => {
    if (epParam) {
      setCurrentEpisode(parseInt(epParam, 10));
    }
  }, [epParam]);

  // Fetch real episode list from Aniflix to ensure we only show aired/available episodes
  useEffect(() => {
    let isMounted = true;
    if (anime && id) {
      setEpisodesLoading(true);
      const fetchEpisodes = async () => {
        try {
          const baseUrl = import.meta.env.VITE_API_URL || '';
          const epRes = await fetch(`${baseUrl}/api/anime/${id}/episodes`);
          if (!epRes.ok) throw new Error('Failed to fetch episodes');
          const epData = await epRes.json();
          const parsedEpisodes = epData.episodes || epData || [];
          
          if (Array.isArray(parsedEpisodes) && parsedEpisodes.length > 0 && isMounted) {
            setEpisodes(parsedEpisodes.map(ep => ({
              id: `ep-${ep.number}`,
              number: ep.number,
              title: ep.title || `Episode ${ep.number}`,
              isFiller: false
            })));
            setEpisodesLoading(false);
            return;
          }
        } catch {
          console.warn('[VideoPage] Failed to load real episodes, falling back');
        }
        
        if (isMounted) {
          // Fallback to nextAiringEpisode or total episodes if Aniflix fails
          const nextAiring = (anime as Record<string, unknown>).nextAiringEpisode as { episode: number } | undefined;
          const count = nextAiring ? nextAiring.episode - 1 : (anime.episodes || 12);
          const generatedEpisodes = Array.from({ length: Math.max(1, count) }).map((_, i) => ({
            id: `ep-${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            isFiller: false
          }));
          setEpisodes(generatedEpisodes);
          setEpisodesLoading(false);
        }
      };
      
      fetchEpisodes();
    }
    return () => { isMounted = false; };
  }, [anime, id]);

  // Callback from AnimePlayer — receive live source list when it resolves
  const handleSourcesLoaded = useCallback((sources: VideoSource[]) => {
    setLoadedSources(sources);
    // Reset to first source whenever the episode changes and sources reload
    setActiveSourceIndex(0);
  }, []);
  
  // Load initial progress from Firebase history
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      const user = getCurrentUser();
      if (!user) return;
      try {
        const userData = await getUserData(user.id);
        if (userData?.history && isMounted) {
          const item = userData.history.find((h: any) => h.animeId === Number(id));
          if (item && item.episodeId === currentEpisode) {
            setInitialTime(item.timestamp || 0);
          } else {
            setInitialTime(0);
          }
        }
      } catch (err) {
        console.error('Failed to load history for initial time', err);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [id, currentEpisode]);

  const handleTimeUpdate = useCallback((time: number, duration: number) => {
    const now = Date.now();
    // Only update Firebase every 10 seconds to save quota
    if (now - lastUpdateTimeRef.current > 10000) {
      lastUpdateTimeRef.current = now;
      const user = getCurrentUser();
      if (user) {
        const progress = Math.round((time / Math.max(1, duration)) * 100);
        updateHistory(user.id, Number(id), currentEpisode, progress, Math.floor(time)).catch(console.error);
      }
    }
  }, [id, currentEpisode]);
  
  // Dummy comments data
  const [comments] = useState<Comment[]>([
    {
      id: '1',
      user: 'AnimeFan99',
      avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
      content: 'This episode was absolutely insane! The animation during the fight scene was god-tier.',
      time: '2 hours ago',
      likes: 245
    },
    {
      id: '2',
      user: 'Sakura_blossom',
      avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
      content: 'I cannot wait for the next episode. Does anyone know if this is following the manga closely?',
      time: '5 hours ago',
      likes: 132
    },
    {
      id: '3',
      user: 'OtakuKing',
      avatar: 'https://i.pravatar.cc/150?u=a04258114e29026702d',
      content: 'The pacing in this adaptation is perfect. They really know how to build tension.',
      time: '1 day ago',
      likes: 89
    },
    {
      id: '4',
      user: 'Nezuko_simp',
      avatar: 'https://i.pravatar.cc/150?u=a048581f4e29026701d',
      content: 'Did anyone notice the easter egg at 14:32? Such a cool reference to the author\'s previous work.',
      time: '2 days ago',
      likes: 412
    }
  ]);
  
  // Early returns for loading/error states MUST be after ALL hooks
  if (isAnimeLoading) return null;
  if (animeError || !anime) return null;

  const titleEn =
    anime.title_english ??
    anime.title?.english ??
    anime.title ??
    '';

  const titleRo =
    anime.title ??
    anime.title?.romaji ??
    titleEn;

  const handleEpisodeSelect = (episodeNumber: number) => {
    setCurrentEpisode(episodeNumber);
    
    // Update URL strictly to 'ep' to avoid conflicts using React Router
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('episode');
      newParams.set('ep', episodeNumber.toString());
      return newParams;
    }, { replace: true });
    
    // Scroll to player
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const _handleProviderSelect = (providerId: string) => {
    setCurrentProvider(providerId);
    
    // Update URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('provider', providerId);
    window.history.pushState({}, '', newUrl.toString());
  };
  
  const handleNextEpisode = () => {
    const maxEps = anime?.episodes || episodes.length || 0;
    if (currentEpisode < maxEps) {
      handleEpisodeSelect(currentEpisode + 1);
    }
  };
  
  const handlePreviousEpisode = () => {
    if (currentEpisode > 1) {
      handleEpisodeSelect(currentEpisode - 1);
    }
  };
  
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${titleEn} - Episode ${currentEpisode} | Nyanime`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        description: "The video link has been copied to your clipboard.",
        duration: 3000,
      });
    }
  };

  const currentEpisodeData = episodes.find(e => e.number === currentEpisode);
  
  return (
    <div className="min-h-screen bg-anime-dark pb-20">
      {anime && (
        <SEO 
          title={`Watch ${titleEn} - Episode ${currentEpisode} | Nyanime`}
          description={`Watch ${titleEn} Episode ${currentEpisode} online in high quality. ${(anime.synopsis || '').substring(0, 150)}...`}
          image={anime.image}
          schema={getVideoSchema({
            id: String(id),
            title: `${titleEn} - Episode ${currentEpisode}`,
            description: anime.synopsis,
            thumbnail: anime.image,
            animeTitle: titleEn,
            episodeNumber: currentEpisode
          })}
        />
      )}

      {/* Background Banner */}
      <div className="fixed inset-0 -z-10 h-[60vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-anime-dark via-anime-dark/80 to-transparent z-10" />
        <img 
          src={anime?.image}
          alt="banner"
          className="w-full h-full object-cover opacity-20 blur-sm"
        />
      </div>
      
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate(`/anime/${id}`)}
          className="mb-4 text-gray-400 hover:text-white group"
        >
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Anime Info
        </Button>
        
        {isAnimeLoading ? (
          <div className="w-full aspect-video bg-black/50 animate-pulse rounded-xl mb-8 flex items-center justify-center">
            <div className="text-anime-purple font-medium flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
              Loading Player...
            </div>
          </div>
        ) : animeError || !anime ? (
          <div className="w-full aspect-video bg-black/50 rounded-xl mb-8 flex items-center justify-center border border-red-500/30">
            <div className="text-center p-6 max-w-md">
              <Flag className="w-12 h-12 text-red-500 mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-bold text-white mb-2">Could not load anime data</h2>
              <p className="text-gray-400 mb-6">There was an error fetching the information for this anime.</p>
              <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Player Column */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              
              {/* VIDEO PLAYER COMPONENT */}
              <div className="glass-card rounded-xl overflow-hidden shadow-2xl border border-white/5">
                <div className="w-full relative bg-black aspect-video">
                  <AnimePlayer
                    anilistId={Number(id)}
                    malId={anime?.mal_id}
                    aniwatchEpisodeId={currentEpisodeData?.id}
                    episodeNumber={currentEpisode}
                    totalEpisodes={anime.episodes || 100}
                    animeTitleEn={titleEn}
                    animeTitleRo={titleRo}
                    onNextEpisode={handleNextEpisode}
                    onPreviousEpisode={handlePreviousEpisode}
                    onEpisodeSelect={handleEpisodeSelect}
                    onSourcesLoaded={handleSourcesLoaded}
                    activeSourceIndex={activeSourceIndex}
                    onSourceChange={setActiveSourceIndex}
                    preferredProvider={currentProvider}
                    initialTime={initialTime}
                    onTimeUpdate={handleTimeUpdate}
                  />
                </div>
                
                {/* Player Controls & Info Bar */}
                <div className="p-4 md:p-6 bg-gradient-to-b from-black/20 to-transparent">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-white mb-1 line-clamp-2">
                        {anime.title_english || anime.title}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                        <Badge variant="outline" className="bg-anime-purple/10 text-anime-purple border-anime-purple/30">
                          Episode {currentEpisode}
                        </Badge>
                        {currentEpisodeData?.title && currentEpisodeData.title !== `Episode ${currentEpisode}` && (
                          <span className="hidden md:inline text-gray-300">
                            • {currentEpisodeData.title}
                          </span>
                        )}
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {anime.duration || '24m'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                      <Button variant="secondary" size="sm" className="bg-white/5 hover:bg-white/10 text-white border border-white/10">
                        <ThumbsUp className="w-4 h-4 mr-2" />
                        Like
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleShare} className="bg-white/5 hover:bg-white/10 text-white border border-white/10">
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </Button>
                      <Button variant="secondary" size="icon" className="bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10">
                        <Flag className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Server Selection (Mobile) — dynamic, sourced from AnimePlayer */}
              <div className="lg:hidden glass-card rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-4 h-4 text-anime-purple" />
                  <h3 className="text-lg font-semibold text-white">Servers</h3>
                  {loadedSources.length > 0 && (
                    <Badge variant="outline" className="ml-auto bg-white/5 text-gray-400 border-white/10 text-[10px]">
                      {loadedSources.length} source{loadedSources.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {loadedSources.length === 0 ? (
                    <p className="text-xs text-gray-500">Loading sources&hellip;</p>
                  ) : (
                    loadedSources.map((src, idx) => (
                      <Button
                        key={`mobile-src-${idx}`}
                        size="sm"
                        variant={idx === activeSourceIndex ? 'default' : 'outline'}
                        className={idx === activeSourceIndex
                          ? 'bg-anime-purple text-white shadow-lg shadow-anime-purple/20'
                          : 'border-white/10 text-gray-300 hover:text-white hover:border-anime-purple/50'}
                        onClick={() => setActiveSourceIndex(idx)}
                        title={src.quality || `Source ${idx + 1}`}
                      >
                        {src.quality || `Source ${idx + 1}`}
                      </Button>
                    ))
                  )}
                </div>
              </div>
              
              {/* Episodes List (Mobile) */}
              <div className="lg:hidden glass-card rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <List className="w-5 h-5 text-anime-purple" />
                    <h3 className="text-lg font-semibold text-white">Episodes</h3>
                  </div>
                  <div className="text-sm text-gray-400">
                    {anime.episodes || episodes.length} Total
                  </div>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search episode number..." 
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-anime-purple/50 transition-colors mb-4"
                  />
                </div>
                
                {episodesError && (
                  <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-900/50 text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Notice</AlertTitle>
                    <AlertDescription>
                      {episodesError}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {episodesLoading ? (
                    Array.from({ length: 24 }).map((_, i) => (
                      <div key={`skeleton-ep-mobile-${i}`} className="h-10 bg-white/5 animate-pulse rounded-md"></div>
                    ))
                  ) : episodesError ? (
                    <div className="col-span-full py-4 text-center text-sm text-red-400 bg-red-500/10 rounded-lg">
                      {episodesError}
                    </div>
                  ) : episodes.length > 0 ? (
                    episodes.map((ep) => (
                      <button
                        key={`mobile-ep-${ep.id || ep.number}`}
                        onClick={() => handleEpisodeSelect(ep.number)}
                        className={`h-10 rounded-md flex items-center justify-center text-sm font-medium transition-all ${
                          currentEpisode === ep.number
                            ? 'bg-anime-purple text-white shadow-lg shadow-anime-purple/20'
                            : ep.isFiller 
                              ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 hover:bg-orange-500/30'
                              : 'bg-white/5 text-gray-300 border border-white/5 hover:bg-white/10 hover:text-white'
                        }`}
                        title={ep.title || `Episode ${ep.number}`}
                      >
                        {ep.number}
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full py-8 text-center text-gray-400">
                      No episodes found
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs Section (Comments, Details, Related) */}
              <div className="glass-card rounded-xl p-4 md:p-6 border border-white/5 mt-2">
                <Tabs defaultValue="comments" className="w-full">
                  <TabsList className="w-full flex md:inline-flex bg-black/40 p-1 rounded-lg border border-white/5">
                    <TabsTrigger value="comments" className="flex-1 md:flex-none data-[state=active]:bg-anime-purple data-[state=active]:text-white">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Comments
                    </TabsTrigger>
                    <TabsTrigger value="details" className="flex-1 md:flex-none data-[state=active]:bg-anime-purple data-[state=active]:text-white">
                      <FileBadge className="w-4 h-4 mr-2" />
                      Details
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="comments" className="mt-6">
                    <div className="space-y-6">
                      <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-anime-purple/20 flex items-center justify-center shrink-0 border border-anime-purple/30">
                          <span className="text-anime-purple font-bold">U</span>
                        </div>
                        <div className="flex-1">
                          <textarea 
                            placeholder="Add a comment..." 
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-anime-purple/50 transition-colors min-h-[100px] resize-none"
                          ></textarea>
                          <div className="flex justify-end mt-2">
                            <Button size="sm" className="bg-anime-purple hover:bg-anime-purple/80 text-white">
                              Comment
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4 mt-8">
                        <h4 className="text-white font-medium mb-4 flex items-center">
                          <MessageSquare className="w-4 h-4 mr-2 text-anime-purple" />
                          {comments.length} Comments
                        </h4>
                        
                        {comments.map((comment) => (
                          <div key={comment.id} className="flex gap-4 p-4 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                            <img src={comment.avatar} alt={comment.user} className="w-10 h-10 rounded-full shrink-0" />
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-white font-medium">{comment.user}</span>
                                <span className="text-xs text-gray-500">{comment.time}</span>
                              </div>
                              <p className="text-gray-300 text-sm mb-3">{comment.content}</p>
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                <button className="flex items-center hover:text-anime-purple transition-colors">
                                  <ThumbsUp className="w-3 h-3 mr-1" /> {comment.likes}
                                </button>
                                <button className="hover:text-white transition-colors">Reply</button>
                                <button className="hover:text-red-400 transition-colors ml-auto">Report</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="details" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="md:col-span-2 space-y-4">
                        <div>
                          <div className="prose prose-invert max-w-none">
                          <p className="text-gray-300 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: anime.synopsis || '' }}></p>
                        </div>
                        </div>
                        
                        {currentEpisodeData && currentEpisodeData.title && (
                          <div className="pt-4 border-t border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-2">Episode {currentEpisode} Info</h3>
                            <p className="text-gray-300 font-medium">Title: <span className="text-white">{currentEpisodeData.title}</span></p>
                            {currentEpisodeData.isFiller && (
                              <Badge variant="outline" className="mt-2 border-orange-500/50 text-orange-400 bg-orange-500/10">
                                Filler Episode
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-24">Japanese:</span>
                          <span className="text-white font-medium">{anime.title_japanese || anime.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-24">Aired:</span>
                          <span className="text-white font-medium">
                            {anime.year || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-24">Status:</span>
                          <Badge className={anime.status?.includes('Airing') ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>
                            {anime.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-24">Studio:</span>
                          <span className="text-white font-medium">
                            {anime.studios || 'Unknown'}
                          </span>
                        </div>
                        <div className="pt-4 mt-2 border-t border-white/10">
                          <div className="flex flex-wrap gap-2">
                            {anime.category?.split(', ').map((genre: string) => (
                              <Badge key={genre} variant="secondary" className="bg-white/5 hover:bg-white/10 text-xs py-0">
                                {genre}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            
            {/* Right Sidebar - Episodes & Servers (Desktop) */}
            <div className="hidden lg:flex flex-col gap-6">
              {/* Anime Quick Info Card */}
              <div className="glass-card rounded-xl p-4 flex gap-4 border border-white/5">
                <img 
                  src={anime.image} 
                  alt={anime.title_english || anime.title} 
                  className="w-20 h-28 object-cover rounded-md shadow-md"
                />
                <div className="flex flex-col py-1">
                  <h3 className="text-white font-semibold line-clamp-2 text-sm mb-1">
                    {anime.title_english || anime.title}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-white">{anime.format || 'TV'}</span>
                    <span>•</span>
                    <span className="flex items-center"><Play className="w-3 h-3 mr-1" /> {anime.episodes || '?'} eps</span>
                  </div>
                  <div className="mt-auto">
                    <Button variant="link" className="p-0 h-auto text-anime-purple text-xs hover:text-white" onClick={() => navigate(`/anime/${id}`)}>
                      View Details <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Server Selection Panel */}
              <div className="glass-card rounded-xl border border-white/5 overflow-hidden flex flex-col max-h-[30vh]">
                <div className="p-4 bg-black/40 border-b border-white/5 shrink-0">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-anime-purple" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Servers</h3>
                  </div>
                </div>
                
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {loadedSources.length === 0 ? (
                      <div className="flex flex-col gap-2 items-center py-4 text-gray-500">
                        <Radio className="w-4 h-4 animate-pulse text-anime-purple" />
                        <p className="text-xs">Loading sources&hellip;</p>
                      </div>
                    ) : (
                      loadedSources.map((src, idx) => (
                        <button
                          key={`desktop-src-${idx}`}
                          onClick={() => setActiveSourceIndex(idx)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all ${
                            idx === activeSourceIndex
                              ? 'bg-anime-purple text-white font-semibold shadow-md shadow-anime-purple/20'
                              : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10'
                          }`}
                          title={src.quality || `Source ${idx + 1}`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Radio className={`w-3.5 h-3.5 shrink-0 ${idx === activeSourceIndex ? 'text-white' : 'text-anime-purple/60'}`} />
                            <span className="truncate text-left" title={src.quality}>
                              {src.quality || `Source ${idx + 1}`}
                            </span>
                          </span>
                          <span className={`text-[10px] shrink-0 ml-2 px-1.5 py-0.5 rounded ${
                            idx === activeSourceIndex ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-500'
                          }`}>
                            {src.type === 'torrent' ? 'Torrent' : src.type.toUpperCase()}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Episodes List Panel */}
              <div className="glass-card rounded-xl border border-white/5 flex-1 flex flex-col overflow-hidden min-h-[400px]">
                <div className="p-4 bg-black/40 border-b border-white/5 shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <List className="w-4 h-4 text-anime-purple" />
                      <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Episodes</h3>
                    </div>
                    <Badge variant="outline" className="bg-white/5 text-gray-300 border-white/10 text-[10px]">
                      {anime.episodes || episodes.length} Total
                    </Badge>
                  </div>
                  
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-anime-purple transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Search episode..." 
                      className="w-full bg-black/60 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-anime-purple/50 transition-colors"
                    />
                  </div>
                </div>
                
                <ScrollArea className="flex-1 p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {episodesLoading ? (
                      Array.from({ length: 24 }).map((_, i) => (
                        <div key={`skeleton-ep-${i}`} className="h-9 bg-white/5 animate-pulse rounded-md"></div>
                      ))
                    ) : episodesError ? (
                      <div className="col-span-4 py-4 text-center text-xs text-red-400 bg-red-500/10 rounded-lg">
                        {episodesError}
                      </div>
                    ) : episodes.length > 0 ? (
                      episodes.map((ep) => (
                        <button
                          key={ep.id || `ep-${ep.number}`}
                          onClick={() => handleEpisodeSelect(ep.number)}
                          className={`h-9 rounded-md flex items-center justify-center text-xs font-medium transition-all ${
                            currentEpisode === ep.number
                              ? 'bg-anime-purple text-white shadow-md shadow-anime-purple/20 scale-105 z-10'
                              : ep.isFiller 
                                ? 'bg-orange-500/10 text-orange-200/80 border border-orange-500/20 hover:bg-orange-500/20 hover:text-orange-100 hover:border-orange-500/40'
                                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white hover:border-white/10'
                          }`}
                          title={ep.title || `Episode ${ep.number}`}
                        >
                          {ep.number}
                        </button>
                      ))
                    ) : (
                      <div className="col-span-4 py-8 text-center text-gray-500 text-sm">
                        No episodes available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default VideoPage;
