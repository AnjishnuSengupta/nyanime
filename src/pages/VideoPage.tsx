import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, MessageSquare, Share2, Flag, List, Clock, FileBadge, Play, Calendar } from 'lucide-react';
import Header from '../components/Header';
import { useAnimeById } from '../hooks/useAnimeData';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import AnimePlayer from '../components/AnimePlayer';
import { fetchEpisodes, fetchVideoSources, VideoSource } from '../services/videoSourceService';
import { updateWatchHistory } from '../services/authService';
import CommentsSection from '../components/CommentsSection';
import animeService, { AnimeProvider, PROVIDERS } from '@/lib/consumet/animeService';

interface EpisodeData {
  id: string;
  number: number;
  title: string;
  duration: string;
  thumbnail: string;
  sources: VideoSource[];
  released: boolean;
  consumetId?: string;
}

const VideoPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const episodeParam = searchParams.get('episode');
  const timeParam = searchParams.get('t');
  const navigate = useNavigate();
  const animeId = id ? id : '0';
  
  const { data: anime, isLoading: animeLoading } = useAnimeById(parseInt(animeId));
  
  const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [currentEpisodeData, setCurrentEpisodeData] = useState<EpisodeData | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [episodeComments, setEpisodeComments] = useState<any[]>([]);
  const [isMovie, setIsMovie] = useState(false);
  const [initialProgress, setInitialProgress] = useState<number>(0);
  
  useEffect(() => {
    if (timeParam) {
      const timeInSeconds = parseInt(timeParam);
      if (!isNaN(timeInSeconds)) {
        setInitialProgress(timeInSeconds);
      }
    }
  }, [timeParam]);

  useEffect(() => {
    if (anime) {
      setIsMovie(anime.type?.toLowerCase() === 'movie');
    }
  }, [anime, animeId]);
  
  useEffect(() => {
    const getEpisodes = async () => {
      if (anime) {
        try {
          setIsLoadingSources(true);
          console.log(`Getting episodes for anime: ${anime.title} (ID: ${animeId})`);
          
          if (isMovie) {
            const consumetId = animeService.generateEpisodeId(anime.title, 1, PROVIDERS.GOGOANIME);
            
            const movieEpisode: EpisodeData = {
              id: `${animeId}-movie-1`,
              number: 1,
              title: anime.title,
              duration: anime.duration || '1:30:00',
              thumbnail: anime.image,
              sources: [],
              released: true,
              consumetId: consumetId
            };
            
            setEpisodes([movieEpisode]);
            setCurrentEpisode(1);
            setCurrentEpisodeData(movieEpisode);
            setIsLoadingSources(false);
            return;
          }
          
          const apiEpisodes = await fetchEpisodes(animeId);
          console.log(`Fetched ${apiEpisodes.length} episodes for anime ${animeId}`);
          
          const airedEpisodeCount = anime.airing ? (anime.airingEpisodes || 1) : (anime.episodes || apiEpisodes.length);
          
          const transformedEpisodes = apiEpisodes.map((ep) => {
            const episodeNumber = ep.number || parseInt(ep.id.split('-').pop() || '1');
            // Generate a consumet compatible ID for each episode
            const consumetId = animeService.generateEpisodeId(anime.title, episodeNumber, PROVIDERS.GOGOANIME);
            
            return {
              id: ep.id,
              number: episodeNumber,
              title: ep.title || `Episode ${episodeNumber}`,
              duration: ep.duration || anime.duration || "24:00",
              thumbnail: ep.image || anime.image,
              sources: [],
              released: episodeNumber <= airedEpisodeCount,
              consumetId: consumetId
            };
          });
          
          setEpisodes(transformedEpisodes);
          
          let episodeNumber = 1;
          if (episodeParam) {
            episodeNumber = parseInt(episodeParam);
            if (isNaN(episodeNumber) || episodeNumber < 1 || episodeNumber > transformedEpisodes.length) {
              episodeNumber = 1;
            }
          }
          setCurrentEpisode(episodeNumber);
          
          if (transformedEpisodes.length > 0) {
            const episode = transformedEpisodes.find(ep => ep.number === episodeNumber) || transformedEpisodes[0];
            
            if (episode.released) {
              setCurrentEpisodeData(episode);
            } else {
              toast({
                title: "Episode Not Released",
                description: `Episode ${episodeNumber} hasn't aired yet. Showing the latest available episode.`,
                variant: "destructive",
              });
              
              const latestReleasedEpisode = transformedEpisodes
                .filter(ep => ep.released)
                .sort((a, b) => b.number - a.number)[0];
              
              if (latestReleasedEpisode) {
                setCurrentEpisode(latestReleasedEpisode.number);
                navigate(`/anime/${id}/watch?episode=${latestReleasedEpisode.number}`, { replace: true });
                setCurrentEpisodeData(latestReleasedEpisode);
              }
            }
          }
        } catch (error) {
          console.error('Error setting up episodes:', error);
          toast({
            title: "Error",
            description: "Failed to load episodes. Please try again later.",
            variant: "destructive",
          });
        } finally {
          setIsLoadingSources(false);
        }
      }
    };
    
    if (anime && !animeLoading) {
      getEpisodes();
    }
  }, [anime, animeLoading, animeId, episodeParam, isMovie, navigate, id]);

  useEffect(() => {
    if (animeId && currentEpisode) {
      const commentKey = `anime_${animeId}_episode_${currentEpisode}_comments`;
      const savedComments = localStorage.getItem(commentKey);
      if (savedComments) {
        setEpisodeComments(JSON.parse(savedComments));
      } else {
        setEpisodeComments([]);
      }
    }
  }, [animeId, currentEpisode]);
  
  const updateProgressTracking = (episodeNumber: number, currentTime: number = 0) => {
    if (anime) {
      const totalDuration = anime.duration ? parseInt(anime.duration) * 60 : 24 * 60;
      const percentProgress = Math.floor((currentTime / totalDuration) * 100);
      
      localStorage.setItem(`anime_progress_${animeId}`, percentProgress.toString());
      
      const userId = localStorage.getItem('userId');
      if (userId) {
        updateWatchHistory(userId, parseInt(animeId), episodeNumber, percentProgress, currentTime);
      }
      
      const continueWatching = JSON.parse(localStorage.getItem('continueWatching') || '[]');
      const existingIndex = continueWatching.findIndex((item: any) => item.id === parseInt(animeId));
      
      const watchingData = {
        id: parseInt(animeId),
        title: anime.title,
        image: anime.image,
        episode: episodeNumber,
        progress: percentProgress,
        timestamp: currentTime,
        lastUpdated: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        continueWatching[existingIndex] = watchingData;
      } else {
        continueWatching.unshift(watchingData);
      }
      
      localStorage.setItem('continueWatching', JSON.stringify(
        continueWatching.slice(0, 10)
      ));
    }
  };
  
  const handleEpisodeSelect = (episodeNumber: number) => {
    if (episodeNumber === currentEpisode && currentEpisodeData) {
      return;
    }
    
    const episode = episodes.find(ep => ep.number === episodeNumber);
    if (!episode) {
      console.error(`Episode ${episodeNumber} not found in episodes list`);
      toast({
        title: "Episode Not Found",
        description: `Could not find episode ${episodeNumber}`,
        variant: "destructive",
      });
      return;
    }
    
    if (!episode.released) {
      toast({
        title: "Episode Not Available",
        description: "This episode hasn't been released yet.",
        variant: "destructive",
      });
      return;
    }
    
    setCurrentEpisode(episodeNumber);
    navigate(`/anime/${id}/watch?episode=${episodeNumber}`);
    
    setCurrentEpisodeData(episode);
    window.scrollTo(0, 0);
  };
  
  const handleNextEpisode = () => {
    if (currentEpisode < episodes.length) {
      const nextEpisodeNumber = episodes
        .filter(ep => ep.number > currentEpisode && ep.released)
        .sort((a, b) => a.number - b.number)[0]?.number;
        
      if (nextEpisodeNumber) {
        handleEpisodeSelect(nextEpisodeNumber);
      }
    }
  };
  
  const handlePreviousEpisode = () => {
    if (currentEpisode > 1) {
      const prevEpisodeNumber = episodes
        .filter(ep => ep.number < currentEpisode && ep.released)
        .sort((a, b) => b.number - a.number)[0]?.number;
        
      if (prevEpisodeNumber) {
        handleEpisodeSelect(prevEpisodeNumber);
      }
    }
  };
  
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Video link has been copied to clipboard",
      duration: 3000,
    });
  };
  
  const handleLike = () => {
    toast({
      title: "Liked!",
      description: "You liked this episode",
      duration: 3000,
    });
  };
  
  const handleReport = () => {
    toast({
      description: "Issue reported. Thank you for helping improve our platform.",
      duration: 3000,
    });
  };

  const handleAddComment = (text: string) => {
    const newComment = {
      id: Date.now(),
      user: {
        username: 'You',
        avatar: 'https://i.pravatar.cc/150?img=3'
      },
      text,
      date: new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    };
    
    const updatedComments = [newComment, ...episodeComments];
    setEpisodeComments(updatedComments);
    
    const commentKey = `anime_${animeId}_episode_${currentEpisode}_comments`;
    localStorage.setItem(commentKey, JSON.stringify(updatedComments));
  };

  if (animeLoading || !anime || episodes.length === 0 || !currentEpisodeData) {
    return (
      <div className="min-h-screen bg-anime-darker">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="w-full aspect-video bg-anime-gray/30 animate-pulse rounded-xl mb-6"></div>
          <div className="w-1/2 h-8 bg-anime-gray/30 animate-pulse rounded-lg mb-4"></div>
          <div className="w-1/4 h-6 bg-anime-gray/30 animate-pulse rounded-lg mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="w-full h-[200px] bg-anime-gray/30 animate-pulse rounded-lg"></div>
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
      
      <main className="container mx-auto px-4 pt-24 pb-8">
        <div className="mb-4 flex items-center">
          <Button 
            variant="ghost" 
            className="text-white/70 hover:text-white -ml-2"
            onClick={() => navigate(`/anime/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Details
          </Button>
        </div>
        
        <AnimePlayer
          episodeId={currentEpisodeData.consumetId}
          animeTitle={anime?.title}
          episodeNumber={currentEpisode}
          totalEpisodes={episodes.length}
          initialTime={initialProgress}
          onPreviousEpisode={currentEpisode > 1 && !isMovie ? handlePreviousEpisode : undefined}
          onNextEpisode={currentEpisode < episodes.length && !isMovie ? handleNextEpisode : undefined}
          onEpisodeSelect={!isMovie ? handleEpisodeSelect : undefined}
          onTimeUpdate={(currentTime) => updateProgressTracking(currentEpisode, currentTime)}
          autoPlay={true}
          className="rounded-xl overflow-hidden"
        />
        
        <div className="mt-4 mb-8">
          <h1 className="text-2xl text-white font-bold">{anime.title}</h1>
          {isMovie ? (
            <h2 className="text-lg text-white/80">{anime.title_english || anime.title}</h2>
          ) : (
            <h2 className="text-lg text-white/80">Episode {currentEpisode}: {currentEpisodeData.title}</h2>
          )}
          
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <Button 
              variant="ghost" 
              className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              onClick={handleLike}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Like
            </Button>
            
            <Button 
              variant="ghost" 
              className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              onClick={() => {
                const commentsSection = document.getElementById('comments');
                if (commentsSection) {
                  commentsSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Comment
            </Button>
            
            <Button 
              variant="ghost" 
              className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            
            <Button 
              variant="ghost" 
              className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              onClick={handleReport}
            >
              <Flag className="h-4 w-4 mr-2" />
              Report
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Tabs defaultValue={isMovie ? "info" : "episodes"} className="w-full">
              <TabsList className="bg-anime-dark mb-6 w-full">
                {!isMovie && <TabsTrigger value="episodes" className="flex-1">Episodes</TabsTrigger>}
                <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                <TabsTrigger value="comments" id="comments" className="flex-1">Comments</TabsTrigger>
              </TabsList>
              
              {!isMovie && (
                <TabsContent value="episodes" className="mt-0">
                  <div className="glass-card p-6 rounded-xl">
                    <h3 className="text-xl font-bold text-white mb-4">All Episodes</h3>
                    
                    {anime.airing && (
                      <div className="mb-6 p-3 bg-anime-purple/20 rounded-lg">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 text-anime-purple mr-2" />
                          <span className="text-white text-sm">
                            <strong>{anime.airingEpisodes}</strong> of {anime.episodes || '?'} episodes aired
                          </span>
                        </div>
                        <p className="text-white/70 text-xs mt-1">
                          New episodes typically release weekly
                        </p>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      {episodes.length > 50 ? (
                        <div className="mb-4">
                          <p className="text-white mb-2">Jump to episode range:</p>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: Math.ceil(episodes.length / 50) }, (_, i) => i).map((range) => (
                              <button
                                key={range}
                                className="px-3 py-1 bg-white/10 rounded-lg text-white hover:bg-anime-purple/20"
                                onClick={() => {
                                  const element = document.getElementById(`episode-range-${range}`);
                                  if (element) element.scrollIntoView({ behavior: 'smooth' });
                                }}
                              >
                                {range * 50 + 1}-{Math.min((range + 1) * 50, episodes.length)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      
                      {Array.from({ length: Math.ceil(episodes.length / 50) }, (_, i) => i).map((range) => (
                        <div key={range} id={`episode-range-${range}`}>
                          <h4 className="text-white/80 text-sm mb-3 font-medium">
                            Episodes {range * 50 + 1}-{Math.min((range + 1) * 50, episodes.length)}
                          </h4>
                          <div className="space-y-2">
                            {episodes.slice(range * 50, (range + 1) * 50).map((episode) => (
                              <div 
                                key={episode.id} 
                                className={`flex flex-col sm:flex-row gap-4 p-4 rounded-lg transition-colors ${
                                  currentEpisode === episode.number ? 'bg-white/10' : ''
                                } ${
                                  episode.released ? 'hover:bg-white/5 cursor-pointer' : 'opacity-50 bg-white/5'
                                }`}
                                onClick={() => episode.released && handleEpisodeSelect(episode.number)}
                              >
                                <div className="w-full sm:w-40 h-24 bg-anime-gray rounded-lg overflow-hidden flex-shrink-0 relative">
                                  <img 
                                    src={episode.thumbnail || anime.image} 
                                    alt={`Episode ${episode.number}`}
                                    className="w-full h-full object-cover"
                                  />
                                  {!episode.released && (
                                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                      <p className="text-white text-xs font-medium px-2 py-1 bg-anime-purple/80 rounded-full">
                                        Coming Soon
                                      </p>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex justify-between">
                                    <h3 className="font-medium text-white">
                                      Episode {episode.number}
                                      {!episode.released && (
                                        <span className="ml-2 text-anime-purple text-sm">(Not Released)</span>
                                      )}
                                    </h3>
                                    <span className="text-white/60 text-sm">{episode.duration}</span>
                                  </div>
                                  <p className="text-white/70 text-sm line-clamp-2 mt-1">
                                    {episode.title || `Episode ${episode.number} description goes here. This is a placeholder for the episode description.`}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              )}
              
              <TabsContent value="info" className="mt-0">
                <div className="glass-card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4">About This {isMovie ? 'Movie' : 'Anime'}</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-white/70 text-sm mb-2">Synopsis</h4>
                      <p className="text-white/90">
                        {anime.synopsis || `No synopsis available for this ${isMovie ? 'movie' : 'anime'}.`}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-white/70 text-sm mb-2">Genres</h4>
                        <div className="flex flex-wrap gap-2">
                          {anime.category && anime.category.split(', ').map((genre: string) => (
                            <span key={genre} className="px-2 py-1 bg-white/10 rounded-full text-xs text-white">
                              {genre}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-white/70 text-sm mb-2">Details</h4>
                        <div className="space-y-1 text-white/90 text-sm">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-2 text-white/60" />
                            <span>{isMovie ? (anime.duration || '1h 30min') : (anime.duration || '24 min/ep')}</span>
                          </div>
                          {!isMovie && (
                            <div className="flex items-center">
                              <List className="h-3 w-3 mr-2 text-white/60" />
                              <span>{episodes.length} Episodes</span>
                            </div>
                          )}
                          <div className="flex items-center">
                            <FileBadge className="h-3 w-3 mr-2 text-white/60" />
                            <span>{anime.type || (isMovie ? 'Movie' : 'TV Series')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="comments" className="mt-0">
                <div className="glass-card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4">Comments</h3>
                  
                  <CommentsSection 
                    animeId={parseInt(animeId)}
                    comments={episodeComments}
                    onAddComment={handleAddComment}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          <div>
            <div className="glass-card p-6 rounded-xl">
              {isMovie ? (
                <div className="text-center py-4">
                  <h3 className="text-lg font-bold text-white mb-2">Movie</h3>
                  <p className="text-white/70">This is a full-length anime movie</p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-white mb-4">Up Next</h3>
                  
                  <div className="space-y-3">
                    {episodes
                      .filter(ep => ep.number > currentEpisode && ep.released)
                      .sort((a, b) => a.number - b.number)
                      .slice(0, 5)
                      .map((episode) => (
                        <div 
                          key={episode.id} 
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => handleEpisodeSelect(episode.number)}
                        >
                          <div className="relative w-20 h-12 bg-anime-gray rounded overflow-hidden flex-shrink-0">
                            <img 
                              src={episode.thumbnail} 
                              alt={`Episode ${episode.number}`} 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <Play className="h-4 w-4 text-white" />
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-white/70">Episode {episode.number}</div>
                            <div className="text-sm text-white truncate">{episode.title}</div>
                          </div>
                        </div>
                      ))}
                    
                    {episodes.filter(ep => ep.number > currentEpisode && ep.released).length === 0 ? (
                      <p className="text-center text-white/50 text-sm py-2">
                        You've reached the end of this series
                      </p>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="w-full mt-2 border-white/10 text-white hover:bg-white/10"
                        onClick={() => navigate(`/anime/${id}`)}
                      >
                        View All Episodes
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VideoPage;