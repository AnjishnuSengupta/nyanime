
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import Header from "../components/Header";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <div className="container mx-auto px-4 min-h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="glass-card p-8 md:p-12 rounded-xl max-w-2xl w-full text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/placeholder.svg')] opacity-5 bg-center bg-no-repeat bg-contain" />
          
          <h1 className="text-6xl md:text-8xl font-bold mb-4 bg-gradient-to-r from-anime-purple to-anime-blue bg-clip-text text-transparent">
            404
          </h1>
          
          <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
            Lost in the Anime Multiverse?
          </h2>
          
          <p className="text-white/70 text-lg mb-8 max-w-md mx-auto">
            The page you're looking for seems to have disappeared into another dimension. Let's get you back on track!
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
