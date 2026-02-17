import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Play, Calendar, Clock, List, PlusCircle, CheckCircle, Radio } from 'lucide-react';
import Header from '../components/Header';
import CategoryRow from '../components/CategoryRow';
import { useAnimeById, useSimilarAnime } from '../hooks/useAnimeData';
import { useAnimeCharacters, useAnimeReviews } from '../hooks/useAnimeDetails';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { EpisodeInfo, searchAnime, fetchEpisodes } from '../services/aniwatchApiService';
import aniwatchApi from '../services/aniwatchApiService';
import CommentsSection from '../components/CommentsSection';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserData, updateWatchlist } from '@/services/firebaseAuthService';

import AnimeAvatarService from '../services/animeAvatarService';

const AnimeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const animeId = id ? parseInt(id) : 0;
  
  const { data: anime, isLoading: animeLoading } = useAnimeById(animeId);
  const { data: similarAnime = [] } = useSimilarAnime(animeId);
  const { data: characters = [], isLoading: charactersLoading } = useAnimeCharacters(animeId);
  const { data: reviews = [], isLoading: reviewsLoading } = useAnimeReviews(animeId);
  
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [animeComments, setAnimeComments] = useState<Array<{
    id: number;
    user: {
      username: string;
      avatar?: string;
    };
    text: string;
    date: string;
  }>>([]);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);
  const [nextEpisodeDate, setNextEpisodeDate] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');

  // Compute next episode release date for airing anime
  const computeNextEpisodeDate = useCallback((airedFrom: string, airedEpisodeCount: number): Date | null => {
    const startDate = new Date(airedFrom);
    if (isNaN(startDate.getTime())) return null;
    // Next episode = startDate + (airedEpisodeCount) * 7 days
    const nextDate = new Date(startDate.getTime() + airedEpisodeCount * 7 * 24 * 60 * 60 * 1000);
    // Only return if it's in the future
    return nextDate > new Date() ? nextDate : null;
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!nextEpisodeDate) {
      setCountdown('');
      return;
    }
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = nextEpisodeDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown('Airing now!');
        setNextEpisodeDate(null);
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${minutes}m ${seconds}s`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextEpisodeDate]);

  useEffect(() => {
    const savedComments = localStorage.getItem(`anime_comments_${animeId}`);
    if (savedComments) {
      setAnimeComments(JSON.parse(savedComments));
    }
    
    if (anime) {
      const getEpisodes = async () => {
        setIsLoadingEpisodes(true);
        try {
          // Search aniwatch for the anime to get real episode data
          const searchResults = await searchAnime(anime.title);
          
          // Also search with English title and combine results
          if (anime.title_english && anime.title_english !== anime.title) {
            const altResults = await searchAnime(anime.title_english);
            const existingIds = new Set(searchResults.map(r => r.id));
            for (const result of altResults) {
              if (!existingIds.has(result.id)) {
                searchResults.push(result);
              }
            }
          }
          
          if (searchResults.length === 0) {
            // Fallback: generate placeholder episodes from MAL count
            const episodeCount = anime.episodes || 12;
            setEpisodes(Array.from({ length: episodeCount }, (_, i) => ({
              id: `${id}-episode-${i + 1}`,
              episodeId: `${id}-episode-${i + 1}`,
              number: i + 1,
              title: `Episode ${i + 1}`,
              image: anime.image,
              isFiller: false
            })));
            setIsLoadingEpisodes(false);
            return;
          }
          
          // Use smart matching to find the correct anime
          const aniwatchAnime = aniwatchApi.findBestMatch(
            searchResults,
            anime.title,
            anime.episodes,
            anime.title_english
          );
          
          if (!aniwatchAnime) {
            const episodeCount = anime.episodes || 12;
            setEpisodes(Array.from({ length: episodeCount }, (_, i) => ({
              id: `${id}-episode-${i + 1}`,
              episodeId: `${id}-episode-${i + 1}`,
              number: i + 1,
              title: `Episode ${i + 1}`,
              image: anime.image,
              isFiller: false
            })));
            setIsLoadingEpisodes(false);
            return;
          }
          
          const apiEpisodes = await fetchEpisodes(aniwatchAnime.id);
          
          // Calculate how many episodes have actually aired
          const airedEpisodeCount = anime.airing
            ? (anime.airingEpisodes || apiEpisodes.length)
            : (anime.episodes || apiEpisodes.length);
          
          const transformedEpisodes: EpisodeInfo[] = apiEpisodes.map((ep) => {
            const episodeNumber = ep.number || parseInt(ep.id.split('-').pop() || '1');
            return {
              id: ep.id,
              episodeId: ep.episodeId || ep.id,
              number: episodeNumber,
              title: ep.title || `Episode ${episodeNumber}`,
              duration: ep.duration,
              image: ep.image || anime.image,
              isFiller: ep.isFiller || false,
              released: episodeNumber <= airedEpisodeCount
            };
          });
          
          setEpisodes(transformedEpisodes);
          
          // Compute next episode countdown for airing anime
          if (anime.airing && anime.airedFrom) {
            const nextDate = computeNextEpisodeDate(anime.airedFrom, airedEpisodeCount);
            setNextEpisodeDate(nextDate);
          }
        } catch (error) {
          console.error('Error fetching episodes from aniwatch:', error);
          // Fallback to generated episodes on error
          const episodeCount = anime.episodes || 12;
          setEpisodes(Array.from({ length: episodeCount }, (_, i) => ({
            id: `${id}-episode-${i + 1}`,
            episodeId: `${id}-episode-${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            image: anime.image,
            isFiller: false
          })));
        } finally {
          setIsLoadingEpisodes(false);
        }
      };
      
      getEpisodes();
      
      const checkWatchlist = async () => {
        const userId = localStorage.getItem('userId');
        if (userId) {
          try {
            const userData = await getUserData(userId);
            const inWatchlist = userData.watchlist.some(item => item.animeId === animeId);
            setIsInWatchlist(inWatchlist);
          } catch (error) {
            console.error('Error checking watchlist:', error);
          }
        }
      };
      
      checkWatchlist();
    }
  }, [anime, animeId, id]);

  const handleAddToWatchlist = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user?.id) {
      toast({
        title: "Login Required",
        description: "Please login to add anime to your watchlist",
        variant: "destructive",
      });
      navigate('/signin');
      return;
    }
    
    setIsAddingToWatchlist(true);
    try {
      await updateWatchlist(user.id, animeId, 'add');
      setIsInWatchlist(true);
      toast({
        title: "Added to Watchlist",
        description: `${anime?.title} has been added to your watchlist`,
      });
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to add to watchlist. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAddingToWatchlist(false);
    }
  };

  const fallbackTrailerIds = {
    '43349': 'MGRm4IzK1SQ',
    '5114': 'cUFoQ-Hl0h4',
    '44511': 'Z1zx8LcRdBk',
    '1735': 'QsYho_fujTY',
    '25777': '6ohYYtxfDTs',
    '21': 'oE8xZeYmZ2I',
    '11061': 'NlJZ-YgAt-c',
    '40748': '9MnQ0P_79pM',
  };

  const getTrailerId = () => {
    if (anime && anime.trailerId) {
      return anime.trailerId;
    }
    
    if (id && fallbackTrailerIds[id as keyof typeof fallbackTrailerIds]) {
      return fallbackTrailerIds[id as keyof typeof fallbackTrailerIds];
    }
    
    return 'QsYho_fujTY';
  };

  const openTrailerModal = () => {
    setIsTrailerModalOpen(true);
  };

  const closeTrailerModal = () => {
    setIsTrailerModalOpen(false);
  };

  const handleWatchEpisode = (episodeNumber: number) => {
    navigate(`/anime/${id}/watch?episode=${episodeNumber}`);
  };

  const handleAddComment = (text: string) => {
    const newComment = {
      id: Date.now(),
      user: {
        username: 'You',
        avatar: AnimeAvatarService.getUserAvatar('demouser')
      },
      text,
      date: new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    };
    
    const updatedComments = [newComment, ...animeComments];
    setAnimeComments(updatedComments);
    
    localStorage.setItem(`anime_comments_${animeId}`, JSON.stringify(updatedComments));
  };

  if (animeLoading || !anime) {
    return (
      <div className="min-h-screen bg-anime-darker">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="w-full h-[300px] bg-anime-gray/30 animate-pulse rounded-xl mb-6"></div>
          <div className="w-3/4 h-8 bg-anime-gray/30 animate-pulse rounded-lg mb-4"></div>
          <div className="w-1/2 h-6 bg-anime-gray/30 animate-pulse rounded-lg mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="w-full h-[400px] bg-anime-gray/30 animate-pulse rounded-lg"></div>
            </div>
            <div>
              <div className="w-full h-[400px] bg-anime-gray/30 animate-pulse rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <div 
        className="relative w-full h-[50vh] bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13, 13, 21, 0.3), rgba(13, 13, 21, 0.9)), url(${anime.image})`
        }}
      >
        {/* Back button - hidden on mobile to save space */}
        <div className="absolute top-24 left-4 sm:top-20 z-10 hidden md:block">
          <Button 
            variant="outline" 
            className="bg-black/30 backdrop-blur-md border-white/10 text-white hover:bg-white/20"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        
        <div className="container mx-auto px-4 h-full flex flex-col justify-end pb-8">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 sm:gap-6 md:gap-8">
            <div className="w-32 h-48 md:w-40 md:h-60 rounded-lg overflow-hidden shadow-xl glass-card flex-shrink-0 -mt-16">
              <img 
                src={anime.image} 
                alt={anime.title} 
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="inline-flex items-center bg-anime-purple/20 backdrop-blur-sm px-3 py-1 rounded-full">
                  <span className="text-xs font-medium text-white">{anime.category}</span>
                  <div className="mx-2 h-3 w-px bg-white/20"></div>
                  <div className="flex items-center">
                    <Star className="w-3 h-3 text-yellow-400 mr-1" fill="currentColor" />
                    <span className="text-xs font-medium text-white">{anime.rating}</span>
                  </div>
                </div>
                
                {anime.airing && (
                  <div className="inline-flex items-center bg-green-500/20 backdrop-blur-sm px-3 py-1 rounded-full animate-pulse">
                    <Radio className="w-3 h-3 text-green-400 mr-1.5" />
                    <span className="text-xs font-medium text-green-400">Currently Airing</span>
                  </div>
                )}
                
                {anime.status && !anime.airing && (
                  <div className="inline-flex items-center bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full">
                    <span className="text-xs font-medium text-white/70">{anime.status}</span>
                  </div>
                )}
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{anime.title}</h1>
              
              <div className="flex flex-wrap items-center text-sm text-white/70 gap-x-4 gap-y-2 mb-4">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>{anime.year}</span>
                </div>
                {anime.airing && anime.airingEpisodes ? (
                  <div className="flex items-center">
                    <List className="h-4 w-4 mr-1" />
                    <span>{anime.airingEpisodes} of {anime.episodes || '?'} Episodes Aired</span>
                  </div>
                ) : anime.episodes ? (
                  <div className="flex items-center">
                    <List className="h-4 w-4 mr-1" />
                    <span>{anime.episodes} Episodes</span>
                  </div>
                ) : null}
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>24 min/ep</span>
                </div>
                {anime.airing && countdown && (
                  <div className="flex items-center text-green-400">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>Next episode in {countdown}</span>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-3">
                <Button 
                  className="bg-anime-purple hover:bg-anime-purple/90"
                  onClick={() => navigate(`/anime/${id}/watch?episode=1`)}
                >
                  <Play className="h-4 w-4 mr-2" /> Watch Now
                </Button>
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/10 text-white hover:bg-white/20"
                  onClick={handleAddToWatchlist}
                  disabled={isAddingToWatchlist || isInWatchlist}
                >
                  {isInWatchlist ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" /> In Watchlist
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-4 w-4 mr-2" /> Add to List
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-anime-dark mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="episodes">Episodes</TabsTrigger>
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="glass-card p-6 rounded-xl mb-6">
                  <h2 className="text-xl font-bold text-white mb-4">Synopsis</h2>
                  <p className="text-white/80 leading-relaxed">
                    {anime.synopsis || 
                      "No synopsis available for this anime. We'll update this information soon!"}
                  </p>
                </div>
                
                <div className="glass-card p-6 rounded-xl">
                  <h2 className="text-xl font-bold text-white mb-4">Trailer</h2>
                  <div 
                    className="aspect-video bg-anime-gray rounded-lg overflow-hidden cursor-pointer relative"
                    onClick={openTrailerModal}
                  >
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Button className="bg-anime-purple hover:bg-anime-purple/90">
                        <Play className="h-6 w-6" /> Watch Trailer
                      </Button>
                    </div>
                    <img 
                      src={`https://img.youtube.com/vi/${getTrailerId()}/maxresdefault.jpg`} 
                      alt="Trailer thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <div className="glass-card p-6 rounded-xl">
                  <h2 className="text-xl font-bold text-white mb-4">Details</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white/60 text-sm">Studios</h3>
                      <p className="text-white">{anime.studios || 'Unknown'}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-white/60 text-sm">Genres</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {anime.category.split(',').map((genre: string, index: number) => (
                          <span 
                            key={index} 
                            className="px-3 py-1 bg-white/10 rounded-full text-xs text-white cursor-pointer hover:bg-anime-purple/20"
                            onClick={() => navigate(`/anime?genre=${encodeURIComponent(genre.trim())}`)}
                          >
                            {genre.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-white/60 text-sm">Status</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {anime.airing && (
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        )}
                        <p className={anime.airing ? 'text-green-400' : 'text-white'}>
                          {anime.status || 'Finished Airing'}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-white/60 text-sm">Season</h3>
                      <p className="text-white">Fall {anime.year}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="episodes">
            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-bold text-white mb-4">Episodes</h2>
              
              {anime.airing && (
                <div className="mb-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center">
                    <Radio className="h-4 w-4 text-green-400 mr-2" />
                    <span className="text-white text-sm">
                      <strong>{anime.airingEpisodes || episodes.filter(e => (e as any).released !== false).length}</strong> of {anime.episodes || '?'} episodes aired
                    </span>
                  </div>
                  {countdown && (
                    <p className="text-green-400 text-xs mt-1 ml-6">
                      Next episode estimated in {countdown}
                    </p>
                  )}
                  {!countdown && (
                    <p className="text-white/50 text-xs mt-1 ml-6">
                      New episodes release weekly
                    </p>
                  )}
                </div>
              )}
              
              {isLoadingEpisodes ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="flex gap-4 p-4 rounded-lg">
                      <div className="w-40 h-24 bg-anime-gray/30 animate-pulse rounded-lg"></div>
                      <div className="flex-1">
                        <div className="w-1/3 h-5 bg-anime-gray/30 animate-pulse rounded-lg mb-2"></div>
                        <div className="w-2/3 h-4 bg-anime-gray/30 animate-pulse rounded-lg"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : episodes.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No episodes available yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {episodes.length > 50 && (
                    <div className="mb-4">
                      <p className="text-white/70 text-sm mb-2">Jump to episode range:</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: Math.ceil(episodes.length / 50) }, (_, i) => i).map((range) => (
                          <button
                            key={range}
                            className="px-3 py-1 bg-white/10 rounded-lg text-white text-xs hover:bg-anime-purple/20 transition-colors"
                            onClick={() => {
                              const element = document.getElementById(`details-ep-range-${range}`);
                              if (element) element.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            {range * 50 + 1}-{Math.min((range + 1) * 50, episodes.length)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {Array.from({ length: Math.ceil(episodes.length / 50) }, (_, i) => i).map((range) => (
                    <div key={range} id={`details-ep-range-${range}`}>
                      {episodes.length > 50 && (
                        <h4 className="text-white/80 text-sm mb-3 font-medium">
                          Episodes {range * 50 + 1}-{Math.min((range + 1) * 50, episodes.length)}
                        </h4>
                      )}
                      <div className="space-y-2">
                        {episodes.slice(range * 50, (range + 1) * 50).map((episode, index) => {
                          const isReleased = (episode as any).released !== false;
                          return (
                            <div 
                              key={episode.id || index} 
                              className={`flex flex-col sm:flex-row gap-4 p-4 rounded-lg transition-colors ${
                                isReleased ? 'hover:bg-white/5 cursor-pointer' : 'opacity-50 bg-white/5'
                              }`}
                              onClick={() => isReleased && handleWatchEpisode(episode.number || index + 1)}
                            >
                              <div className="w-full sm:w-40 h-24 bg-anime-gray rounded-lg overflow-hidden flex-shrink-0 relative">
                                <img 
                                  src={episode.image || anime.image} 
                                  alt={`Episode ${episode.number || index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {!isReleased && (
                                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                    <p className="text-white text-xs font-medium px-2 py-1 bg-anime-purple/80 rounded-full">
                                      Coming Soon
                                    </p>
                                  </div>
                                )}
                                {episode.isFiller && isReleased && (
                                  <div className="absolute top-1 right-1">
                                    <span className="text-[10px] bg-yellow-500/80 text-black px-1.5 py-0.5 rounded-full font-medium">
                                      Filler
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex justify-between items-start">
                                  <h3 className="font-medium text-white">
                                    Episode {episode.number || index + 1}
                                    {!isReleased && (
                                      <span className="ml-2 text-anime-purple text-sm">(Not Released)</span>
                                    )}
                                  </h3>
                                  {episode.duration && (
                                    <span className="text-white/60 text-sm">{episode.duration}</span>
                                  )}
                                </div>
                                <p className="text-white/70 text-sm line-clamp-2 mt-1">
                                  {episode.title}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="characters">
            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-bold text-white mb-4">Characters</h2>
              
              {charactersLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, index) => (
                    <div key={index} className="text-center">
                      <div className="w-full aspect-[3/4] bg-anime-gray/30 animate-pulse rounded-lg overflow-hidden mb-2"></div>
                      <div className="h-5 bg-anime-gray/30 animate-pulse rounded-lg mb-1 w-3/4 mx-auto"></div>
                      <div className="h-4 bg-anime-gray/30 animate-pulse rounded-lg w-1/2 mx-auto"></div>
                    </div>
                  ))}
                </div>
              ) : characters.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No character information available.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {characters.map((character) => (
                    <div key={character.id} className="text-center">
                      <div className="w-full aspect-[3/4] bg-anime-gray rounded-lg overflow-hidden mb-2 relative group">
                        <img 
                          src={character.image} 
                          alt={character.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-2 left-2 right-2">
                            <span className="text-xs bg-anime-purple/80 text-white px-2 py-1 rounded-full">
                              {character.role || 'Character'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <h3 className="font-medium text-white text-sm line-clamp-1">{character.name}</h3>
                      {character.voiceActor && (
                        <p className="text-white/60 text-xs line-clamp-1">{character.voiceActor.name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="reviews" id="reviews">
            <div className="glass-card p-6 rounded-xl mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Reviews</h2>
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/10 text-white hover:bg-white/20"
                  onClick={() => {
                    if (!document.getElementById('comments')) return;
                    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Write a Review
                </Button>
              </div>
              
              {reviewsLoading ? (
                <div className="space-y-6">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="border-b border-white/10 pb-6 last:border-0">
                      <div className="flex justify-between mb-2">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-anime-gray/30 animate-pulse mr-3"></div>
                          <div>
                            <div className="h-5 w-24 bg-anime-gray/30 animate-pulse rounded mb-1"></div>
                            <div className="h-4 w-16 bg-anime-gray/30 animate-pulse rounded"></div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 mr-1" fill="currentColor" />
                          <div className="h-4 w-10 bg-anime-gray/30 animate-pulse rounded"></div>
                        </div>
                      </div>
                      <div className="h-4 w-full bg-anime-gray/30 animate-pulse rounded mb-1"></div>
                      <div className="h-4 w-4/5 bg-anime-gray/30 animate-pulse rounded mb-1"></div>
                      <div className="h-4 w-2/3 bg-anime-gray/30 animate-pulse rounded"></div>
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No reviews yet. Be the first to review this anime!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-white/10 pb-6 last:border-0">
                      <div className="flex justify-between mb-2">
                        <div className="flex items-center">
                          <Avatar className="h-10 w-10 mr-3">
                            <AvatarImage src={review.user.avatar} alt={review.user.username} />
                            <AvatarFallback>{review.user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-medium text-white">{review.user.username}</h3>
                            <p className="text-white/60 text-xs">{review.date}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 mr-1" fill="currentColor" />
                          <span className="text-white">{review.rating}/10</span>
                        </div>
                      </div>
                      <p className="text-white/80 text-sm">
                        {review.text}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <button className="text-white/50 text-xs hover:text-white transition-colors">
                          Helpful
                        </button>
                        <button className="text-white/50 text-xs hover:text-white transition-colors">
                          Report
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="glass-card p-6 rounded-xl" id="comments">
              <h2 className="text-xl font-bold text-white mb-4">Discussion</h2>
              <CommentsSection 
                animeId={animeId}
                comments={animeComments}
                onAddComment={handleAddComment}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {similarAnime && similarAnime.length > 0 && (
        <CategoryRow 
          title="Similar Anime" 
          animeList={similarAnime}
        />
      )}

      {isTrailerModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="absolute top-4 right-4">
            <Button 
              variant="ghost" 
              className="text-white bg-white/10 hover:bg-white/20"
              onClick={closeTrailerModal}
            >
              Close
            </Button>
          </div>
          <div className="w-full max-w-4xl aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${getTrailerId()}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimeDetails;
