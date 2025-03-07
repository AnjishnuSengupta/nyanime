
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, MessageSquare, Share2, Flag, List, Clock, FileBadge, Play } from 'lucide-react';
import Header from '../components/Header';
import VideoPlayer from '../components/VideoPlayer';
import { useAnimeData } from '../hooks/useAnimeData';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';

const VideoPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const episodeParam = searchParams.get('episode');
  const navigate = useNavigate();
  const { getAnimeById, getSimilarAnime } = useAnimeData();
  const [anime, setAnime] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      if (id) {
        const animeData = await getAnimeById(parseInt(id));
        setAnime(animeData);
        
        // Generate mock episodes
        const episodeCount = animeData.episodes || 12;
        const mockEpisodes = Array.from({ length: episodeCount }, (_, i) => ({
          number: i + 1,
          title: `Episode ${i + 1}`,
          duration: "24:00",
          thumbnail: animeData.image,
          // Mock video source (would be real URLs in a production app)
          videoSrc: "https://www.w3schools.com/html/mov_bbb.mp4"
        }));
        
        setEpisodes(mockEpisodes);
        
        // Set current episode from URL parameter or default to 1
        if (episodeParam) {
          const episodeNumber = parseInt(episodeParam);
          if (episodeNumber > 0 && episodeNumber <= episodeCount) {
            setCurrentEpisode(episodeNumber);
          }
        }
      }
      setIsLoading(false);
    };

    fetchData();
  }, [id, getAnimeById, episodeParam]);
  
  if (isLoading || !anime) {
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
  
  const currentEpisodeData = episodes[currentEpisode - 1];
  
  const handleNextEpisode = () => {
    if (currentEpisode < episodes.length) {
      setCurrentEpisode(currentEpisode + 1);
      navigate(`/anime/${id}/watch?episode=${currentEpisode + 1}`);
      window.scrollTo(0, 0);
    }
  };
  
  const handlePreviousEpisode = () => {
    if (currentEpisode > 1) {
      setCurrentEpisode(currentEpisode - 1);
      navigate(`/anime/${id}/watch?episode=${currentEpisode - 1}`);
      window.scrollTo(0, 0);
    }
  };
  
  const handleEpisodeSelect = (episodeNumber: number) => {
    setCurrentEpisode(episodeNumber);
    navigate(`/anime/${id}/watch?episode=${episodeNumber}`);
    window.scrollTo(0, 0);
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

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          className="text-white/70 hover:text-white mb-4 -ml-2"
          onClick={() => navigate(`/anime/${id}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Details
        </Button>
        
        {/* Video Player */}
        <VideoPlayer 
          src={currentEpisodeData.videoSrc}
          title={anime.title}
          episodeNumber={currentEpisode}
          totalEpisodes={episodes.length}
          thumbnail={currentEpisodeData.thumbnail}
          onNextEpisode={currentEpisode < episodes.length ? handleNextEpisode : undefined}
          onPreviousEpisode={currentEpisode > 1 ? handlePreviousEpisode : undefined}
          initialProgress={0}
          autoPlay={true}
        />
        
        {/* Episode Info */}
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
        
        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
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
                  
                  <div className="space-y-2">
                    {episodes.map((episode, index) => (
                      <div 
                        key={index} 
                        className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                          currentEpisode === index + 1 
                            ? 'bg-anime-purple/20 border border-anime-purple/30' 
                            : 'hover:bg-white/5'
                        }`}
                        onClick={() => handleEpisodeSelect(index + 1)}
                      >
                        <div className="w-16 h-12 bg-anime-gray rounded overflow-hidden flex-shrink-0 mr-3">
                          <img 
                            src={episode.thumbnail} 
                            alt={`Episode ${index + 1}`} 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <span className={`font-medium ${currentEpisode === index + 1 ? 'text-anime-purple' : 'text-white'}`}>
                              Episode {index + 1}
                            </span>
                            <span className="text-white/60 text-sm">{episode.duration}</span>
                          </div>
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
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, nisl eget
                        aliquam ultricies, nunc nisl aliquet nunc, quis aliquam nisl nunc quis nisl. 
                        Sed vitae augue euismod, aliquam nunc quis, aliquet nunc.
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
                            <span>{anime.episodes} Episodes</span>
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
                    {/* Sample Comments */}
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
          
          {/* Sidebar */}
          <div>
            <div className="glass-card p-6 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-4">Up Next</h3>
              
              <div className="space-y-3">
                {episodes.slice(currentEpisode, currentEpisode + 5).map((episode, index) => (
                  <div 
                    key={index} 
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
