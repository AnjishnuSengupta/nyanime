import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, MessageSquare, Share2, Flag, List, Clock, FileBadge, Play } from 'lucide-react';
import Header from '../components/Header';
import { useAnimeById } from '../hooks/useAnimeData';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import VideoEmbed from '../components/VideoEmbed';
import { 
  fetchEpisodes, 
  fetchVideoSources, 
  VideoSource, 
  EpisodeInfo 
} from '../services/videoSourceService';

interface EpisodeData {
  id: string;
  number: number;
  title: string;
  duration: string;
  thumbnail: string;
  sources: VideoSource[];
}

const VideoPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const episodeParam = searchParams.get('episode');
  const navigate = useNavigate();
  const animeId = id ? id : '0';
  
  const { data: anime, isLoading: animeLoading } = useAnimeById(parseInt(animeId));
  
  const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [currentEpisodeData, setCurrentEpisodeData] = useState<EpisodeData | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  
  useEffect(() => {
    const getEpisodes = async () => {
      if (anime) {
        try {
          const apiEpisodes = await fetchEpisodes(animeId);
          
          const transformedEpisodes = apiEpisodes.map((ep) => ({
            id: ep.id,
            number: ep.number || parseInt(ep.id.split('-').pop() || '1'),
            title: ep.title || `Episode ${ep.number || parseInt(ep.id.split('-').pop() || '1')}`,
            duration: "24:00",
            thumbnail: anime.image,
            sources: []
          }));
          
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
            const episode = transformedEpisodes[episodeNumber - 1];
            loadEpisodeSources(episode);
          }
        } catch (error) {
          console.error('Error setting up episodes:', error);
          toast({
            title: "Error",
            description: "Failed to load episodes. Please try again later.",
            variant: "destructive",
          });
        }
      }
    };
    
    if (anime && !animeLoading) {
      getEpisodes();
    }
  }, [anime, animeLoading, animeId, episodeParam]);
  
  const loadEpisodeSources = async (episode: EpisodeData) => {
    setIsLoadingSources(true);
    try {
      const sources = await fetchVideoSources(episode.id);
      
      const updatedEpisode = {
        ...episode,
        sources
      };
      
      setCurrentEpisodeData(updatedEpisode);
      
      updateProgressTracking(episode.number);
    } catch (error) {
      console.error('Error loading episode sources:', error);
      toast({
        title: "Error",
        description: "Failed to load video sources. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSources(false);
    }
  };
  
  const updateProgressTracking = (episodeNumber: number) => {
    if (anime) {
      const progress = Math.floor(Math.random() * 80);
      localStorage.setItem(`anime_progress_${animeId}`, progress.toString());
      
      const continueWatching = JSON.parse(localStorage.getItem('continueWatching') || '[]');
      const existingIndex = continueWatching.findIndex((item: any) => item.id === parseInt(animeId));
      
      const watchingData = {
        id: parseInt(animeId),
        title: anime.title,
        image: anime.image,
        episode: episodeNumber,
        progress: progress,
        timestamp: new Date().toISOString()
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
    
    setCurrentEpisode(episodeNumber);
    navigate(`/anime/${id}/watch?episode=${episodeNumber}`);
    
    const episode = episodes[episodeNumber - 1];
    if (episode) {
      loadEpisodeSources(episode);
      window.scrollTo(0, 0);
    }
  };
  
  const handleNextEpisode = () => {
    if (currentEpisode < episodes.length) {
      handleEpisodeSelect(currentEpisode + 1);
    }
  };
  
  const handlePreviousEpisode = () => {
    if (currentEpisode > 1) {
      handleEpisodeSelect(currentEpisode - 1);
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
      
      <main className="container mx-auto px-4 py-8">
        <Button 
          variant="ghost" 
          className="text-white/70 hover:text-white mb-4 -ml-2"
          onClick={() => navigate(`/anime/${id}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Details
        </Button>
        
        <VideoEmbed 
          sources={currentEpisodeData.sources}
          title={anime.title}
          episodeNumber={currentEpisode}
          totalEpisodes={episodes.length}
          thumbnail={currentEpisodeData.thumbnail}
          onNextEpisode={currentEpisode < episodes.length ? handleNextEpisode : undefined}
          onPreviousEpisode={currentEpisode > 1 ? handlePreviousEpisode : undefined}
          initialProgress={0}
          autoPlay={true}
          isLoading={isLoadingSources}
          onEpisodeSelect={handleEpisodeSelect}
        />
        
        <div className="mt-4 mb-8">
          <h1 className="text-2xl text-white font-bold">{anime.title}</h1>
          <h2 className="text-lg text-white/80">Episode {currentEpisode}: {currentEpisodeData.title}</h2>
          
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
            <Tabs defaultValue="episodes" className="w-full">
              <TabsList className="bg-anime-dark mb-6 w-full">
                <TabsTrigger value="episodes" className="flex-1">Episodes</TabsTrigger>
                <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                <TabsTrigger value="comments" id="comments" className="flex-1">Comments</TabsTrigger>
              </TabsList>
              
              <TabsContent value="episodes" className="mt-0">
                <div className="glass-card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4">All Episodes</h3>
                  
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
                          {episodes.slice(range * 50, (range + 1) * 50).map((episode, index) => (
                            <div 
                              key={episode.id || (range * 50 + index)} 
                              className={`flex flex-col sm:flex-row gap-4 p-4 rounded-lg hover:bg-white/5 transition-colors cursor-pointer ${
                                currentEpisode === range * 50 + index + 1 ? 'bg-white/10' : ''
                              }`}
                              onClick={() => handleEpisodeSelect(range * 50 + index + 1)}
                            >
                              <div className="w-full sm:w-40 h-24 bg-anime-gray rounded-lg overflow-hidden flex-shrink-0">
                                <img 
                                  src={anime.image} 
                                  alt={`Episode ${range * 50 + index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex justify-between">
                                  <h3 className="font-medium text-white">
                                    Episode {range * 50 + index + 1}
                                  </h3>
                                  <span className="text-white/60 text-sm">24:00</span>
                                </div>
                                <p className="text-white/70 text-sm line-clamp-2 mt-1">
                                  {episode.title || `Episode ${range * 50 + index + 1} description goes here. This is a placeholder for the episode description.`}
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
              
              <TabsContent value="info" className="mt-0">
                <div className="glass-card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4">About This Anime</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-white/70 text-sm mb-2">Synopsis</h4>
                      <p className="text-white/90">
                        {anime.synopsis || "No synopsis available for this anime."}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-white/70 text-sm mb-2">Genres</h4>
                        <div className="flex flex-wrap gap-2">
                          {anime.category.split(', ').map((genre: string) => (
                            <span key={genre} className="px-2 py-1 bg-white/10 rounded-full text-xs text-white">
                              {genre}
                            </span>
                          ))}
                          <span className="px-2 py-1 bg-white/10 rounded-full text-xs text-white">
                            Adventure
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-white/70 text-sm mb-2">Details</h4>
                        <div className="space-y-1 text-white/90 text-sm">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-2 text-white/60" />
                            <span>24 min/ep</span>
                          </div>
                          <div className="flex items-center">
                            <List className="h-3 w-3 mr-2 text-white/60" />
                            <span>{episodes.length} Episodes</span>
                          </div>
                          <div className="flex items-center">
                            <FileBadge className="h-3 w-3 mr-2 text-white/60" />
                            <span>TV Series</span>
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
                  
                  <div className="mb-6">
                    <textarea 
                      placeholder="Write a comment..." 
                      className="w-full p-3 rounded-lg bg-anime-gray/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-anime-purple min-h-24"
                    ></textarea>
                    <div className="flex justify-end mt-2">
                      <Button 
                        className="bg-anime-purple hover:bg-anime-purple/90"
                        onClick={() => {
                          toast({
                            title: "Comment Posted",
                            description: "Your comment has been posted successfully",
                            duration: 3000,
                          });
                        }}
                      >
                        Post Comment
                      </Button>
                    </div>
                  </div>
                  
                  <Separator className="my-6 bg-white/10" />
                  
                  <div className="space-y-6">
                    {[...Array(3)].map((_, index) => (
                      <div key={index} className="flex gap-4">
                        <Avatar>
                          <AvatarImage src={`https://i.pravatar.cc/100?img=${index + 10}`} />
                          <AvatarFallback>
                            {['JD', 'AK', 'MT'][index]}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-white">
                              {['JohnDoe', 'AnimeKing', 'MangaTime'][index]}
                            </span>
                            <span className="text-white/50 text-xs">
                              {['2 hours ago', '5 days ago', 'Just now'][index]}
                            </span>
                          </div>
                          
                          <p className="text-white/80 text-sm">
                            {[
                              "This episode was amazing! The animation quality during the fight scene was top notch.",
                              "I've been waiting for this episode all week! Totally worth it.",
                              "The plot twist at the end was unexpected. Can't wait for the next episode!"
                            ][index]}
                          </p>
                          
                          <div className="flex items-center gap-3 mt-2">
                            <button className="text-white/50 text-xs hover:text-white transition-colors">
                              Like
                            </button>
                            <button className="text-white/50 text-xs hover:text-white transition-colors">
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          <div>
            <div className="glass-card p-6 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-4">Up Next</h3>
              
              <div className="space-y-3">
                {episodes.slice(currentEpisode, currentEpisode + 5).map((episode, index) => (
                  <div 
                    key={episode.id} 
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => handleEpisodeSelect(currentEpisode + index + 1)}
                  >
                    <div className="relative w-20 h-12 bg-anime-gray rounded overflow-hidden flex-shrink-0">
                      <img 
                        src={episode.thumbnail} 
                        alt={`Episode ${currentEpisode + index + 1}`} 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Play className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-white/70">Episode {currentEpisode + index + 1}</div>
                      <div className="text-sm text-white truncate">{episode.title}</div>
                    </div>
                  </div>
                ))}
                
                {currentEpisode + 5 >= episodes.length ? (
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VideoPage;
