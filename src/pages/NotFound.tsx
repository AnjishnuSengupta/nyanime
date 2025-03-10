
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search, Coffee, Film } from "lucide-react";
import Header from "../components/Header";
import { useAnimeData } from "../hooks/useAnimeData";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { popularAnime } = useAnimeData();

  // Get 3 random popular anime for suggestions
  const suggestedAnime = popularAnime.slice(0, 10)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-anime-darker bg-[url('/404-bg.svg')] bg-repeat bg-cover">
      <Header />
      
      <div className="container mx-auto px-4 min-h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="glass-card p-8 md:p-12 rounded-xl max-w-3xl w-full text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-anime-purple/20 to-anime-blue/20 opacity-50" />
          
          <div className="relative z-10">
            <div className="flex flex-col items-center mb-8">
              <h1 className="text-7xl md:text-9xl font-bold mb-4 bg-gradient-to-r from-anime-purple to-anime-blue bg-clip-text text-transparent">
                404
              </h1>
              
              <div className="w-16 h-1 bg-gradient-to-r from-anime-purple to-anime-blue rounded-full mb-4"></div>
              
              <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
                Looks Like You've Crossed Into Another Dimension
              </h2>
              
              <p className="text-white/70 text-lg mb-8 max-w-md">
                The page you're looking for has disappeared into the anime multiverse. Let's get you back to a familiar world!
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
                className="w-full sm:w-auto border-white/10 text-white hover:bg-white/10"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
              
              <Button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto bg-anime-purple hover:bg-anime-purple/90"
              >
                <Home className="mr-2 h-4 w-4" />
                Return Home
              </Button>
              
              <Button
                onClick={() => navigate('/anime')}
                variant="secondary"
                className="w-full sm:w-auto bg-anime-blue hover:bg-anime-blue/90"
              >
                <Search className="mr-2 h-4 w-4" />
                Browse Anime
              </Button>
            </div>
            
            {suggestedAnime.length > 0 && (
              <div className="mt-8 pt-8 border-t border-white/10">
                <h3 className="text-white text-xl font-medium mb-4">Why not try these instead?</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {suggestedAnime.map((anime) => (
                    <div 
                      key={anime.id} 
                      className="bg-white/5 rounded-lg overflow-hidden cursor-pointer hover:bg-white/10 transition-colors"
                      onClick={() => navigate(`/anime/${anime.id}`)}
                    >
                      <div className="w-full aspect-[3/4] relative">
                        <img 
                          src={anime.image} 
                          alt={anime.title} 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end">
                          <div className="p-2">
                            <span className="text-xs bg-anime-purple text-white px-2 py-1 rounded-full">
                              {anime.type}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-3">
                        <h4 className="text-white font-medium line-clamp-1">{anime.title}</h4>
                        <div className="flex items-center text-white/70 text-xs mt-1">
                          <Film className="h-3 w-3 mr-1" />
                          <span>{anime.status}</span>
                          <span className="mx-1">•</span>
                          <Coffee className="h-3 w-3 mr-1" />
                          <span>{anime.rating || 'PG-13'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
