
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, ChevronRight, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTrendingAnime, usePopularAnime } from '../hooks/useAnimeData';
import { AnimeData } from '../services/animeService';

const HeroSection = () => {
  const { data: trendingAnime = [], isLoading: trendingLoading } = useTrendingAnime();
  const { data: popularAnime = [], isLoading: popularLoading } = usePopularAnime();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slideInterval = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Combine trending and popular anime for hero slides
  const getFeatureSlides = (): AnimeData[] => {
    const slides: AnimeData[] = [];
    
    // Select top 2 trending and top 1 popular anime for the slides
    if (trendingAnime.length > 0) {
      slides.push(trendingAnime[0]);
      if (trendingAnime.length > 1) slides.push(trendingAnime[1]);
    }
    
    if (popularAnime.length > 0 && !slides.some(s => s.id === popularAnime[0].id)) {
      slides.push(popularAnime[0]);
    }
    
    // Fallback if no data yet
    if (slides.length === 0) {
      return [{
        id: 0,
        title: "Loading Anime...",
        image: "/placeholder.svg",
        category: "Loading...",
        rating: "N/A",
        year: "N/A",
        synopsis: "Loading content, please wait..."
      }];
    }
    
    return slides;
  };

  const slides = getFeatureSlides();

  const startSlideTimer = useCallback(() => {
    if (slideInterval.current) {
      clearInterval(slideInterval.current);
    }

    slideInterval.current = setInterval(() => {
      if (!isPaused) {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }
    }, 6000);
  }, [isPaused, slides.length]);

  useEffect(() => {
    startSlideTimer();
    return () => {
      if (slideInterval.current) {
        clearInterval(slideInterval.current);
      }
    };
  }, [startSlideTimer]);

  const handleSlideChange = (index: number) => {
    setCurrentSlide(index);
    startSlideTimer();
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleWatchNow = (id: number) => {
    navigate(`/anime/${id}`);
  };

  if (trendingLoading && popularLoading) {
    return (
      <section className="relative w-full h-[70vh] md:h-[80vh] bg-anime-darker flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Loading featured anime...</div>
      </section>
    );
  }

  return (
    <section className="relative w-full h-[70vh] md:h-[80vh] overflow-hidden">
      {/* Background Image Slider */}
      <div className="absolute inset-0 z-0">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              backgroundImage: `linear-gradient(to bottom, rgba(13, 13, 21, 0.5), rgba(13, 13, 21, 0.9)), url('${slide.image}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end">
        <div className="container mx-auto px-4 md:px-6 pb-16 md:pb-20">
          <div className="max-w-3xl">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`transition-all duration-700 ${
                  index === currentSlide 
                    ? 'opacity-100 transform translate-y-0' 
                    : 'opacity-0 transform translate-y-8 absolute'
                }`}
              >
                <div className="inline-flex items-center bg-anime-purple/20 backdrop-blur-sm px-3 py-1 rounded-full mb-4">
                  <div className="w-2 h-2 rounded-full bg-anime-purple mr-2 animate-pulse-soft"></div>
                  <span className="text-xs font-medium text-white">{slide.category}</span>
                  <div className="mx-2 h-3 w-px bg-white/20"></div>
                  <div className="flex items-center">
                    <svg className="w-3 h-3 text-yellow-400 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                    <span className="text-xs font-medium text-white">{slide.rating}</span>
                  </div>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight">{slide.title}</h1>
                <p className="text-white/80 text-sm md:text-base mb-6 max-w-2xl">
                  {slide.synopsis ? slide.synopsis.substring(0, 150) + '...' : 'No synopsis available.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    className="inline-flex items-center px-6 py-3 bg-anime-purple text-white font-medium rounded-full hover:bg-anime-purple/90 transition-colors"
                    onClick={() => handleWatchNow(slide.id)}
                  >
                    <Play className="h-4 w-4 mr-2" /> Watch Now
                  </button>
                  <button 
                    className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-sm text-white font-medium rounded-full hover:bg-white/20 transition-colors"
                    onClick={() => navigate(`/anime/${slide.id}`)}
                  >
                    More Info <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slide Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex items-center space-x-3">
        <button
          onClick={togglePause}
          className="p-2 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors"
        >
          {isPaused ? <Play className="h-3 w-3 text-white" /> : <Pause className="h-3 w-3 text-white" />}
        </button>
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => handleSlideChange(index)}
            className={`w-12 h-1 rounded-full transition-all ${
              index === currentSlide ? 'bg-anime-purple' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroSection;
