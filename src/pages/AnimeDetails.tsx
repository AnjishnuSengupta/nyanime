import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Play, Calendar, Clock, List, PlusCircle, CheckCircle } from 'lucide-react';
import Header from '../components/Header';
import CategoryRow from '../components/CategoryRow';
import { useAnimeById, useSimilarAnime } from '../hooks/useAnimeData';
import { useAnimeCharacters, useAnimeReviews } from '../hooks/useAnimeDetails';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { EpisodeInfo } from '../services/aniwatchApiService';
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

  useEffect(() => {
    const savedComments = localStorage.getItem(`anime_comments_${animeId}`);
    if (savedComments) {
      setAnimeComments(JSON.parse(savedComments));
    }
    
    if (anime) {
      const getEpisodes = async () => {
        setIsLoadingEpisodes(true);
        try {
          // First, search for the anime on Aniwatch to get its ID
          const aniwatchApi = await import('../services/aniwatchApiService');
          const searchResults = await aniwatchApi.searchAnime(anime.title);
          
          if (searchResults.length === 0) {
            throw new Error('Anime not found on Aniwatch');
          }
          
          const aniwatchAnime = searchResults[0];
          const apiEpisodes = await aniwatchApi.fetchEpisodes(aniwatchAnime.id);
          
          // Transform to match expected format
          const transformedEpisodes = apiEpisodes.map((ep) => ({
            id: ep.id,
            episodeId: ep.episodeId,
            number: ep.number,
            title: ep.title,
            released: true,
            image: ep.image || anime.image,
            thumbnailUrl: ep.image || anime.image
          }));
          
          setEpisodes(transformedEpisodes);
        } catch (error) {
          console.error('Error fetching episodes:', error);
          const fallbackEpisodes = Array.from({ length: anime.episodes || 12 }, (_, i) => ({
            id: `${id}-episode-${i + 1}`,
            episodeId: `${id}-episode-${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            released: true,
            image: `${import.meta.env.VITE_EPISODE_THUMBNAIL_CDN}/${id || '1'}.jpg`,
            thumbnailUrl: `${import.meta.env.VITE_EPISODE_THUMBNAIL_CDN}/${id || '1'}.jpg`
          }));
          setEpisodes(fallbackEpisodes);
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
        <div className="absolute top-24 left-4 sm:top-20 z-10">
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
              <div className="inline-flex items-center bg-anime-purple/20 backdrop-blur-sm px-3 py-1 rounded-full mb-4">
                <span className="text-xs font-medium text-white">{anime.category}</span>
                <div className="mx-2 h-3 w-px bg-white/20"></div>
                <div className="flex items-center">
                  <Star className="w-3 h-3 text-yellow-400 mr-1" fill="currentColor" />
                  <span className="text-xs font-medium text-white">{anime.rating}</span>
                </div>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{anime.title}</h1>
              
              <div className="flex flex-wrap items-center text-sm text-white/70 gap-x-4 gap-y-2 mb-4">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>{anime.year}</span>
                </div>
                {anime.episodes && (
                  <div className="flex items-center">
                    <List className="h-4 w-4 mr-1" />
                    <span>{anime.episodes} Episodes</span>
                  </div>
                )}
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>24 min/ep</span>
                </div>
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
                      <p className="text-white">Studio MAPPA</p>
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
                      <p className="text-white">Finished Airing</p>
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
              ) : (
                <div className="space-y-4">
                  {episodes.map((episode, index) => (
                    <div 
                      key={episode.id || index} 
                      className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => handleWatchEpisode(episode.number || index + 1)}
                    >
                      <div className="w-full sm:w-40 h-24 bg-anime-gray rounded-lg overflow-hidden flex-shrink-0">
                        <img 
                          src={anime.image} 
                          alt={`Episode ${episode.number || index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <h3 className="font-medium text-white">
                            Episode {episode.number || index + 1}
                          </h3>
                          <span className="text-white/60 text-sm">24:00</span>
                        </div>
                        <p className="text-white/70 text-sm line-clamp-2 mt-1">
                          {episode.title || `Episode ${episode.number || index + 1} description goes here. This is a placeholder for the episode description.`}
                        </p>
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
