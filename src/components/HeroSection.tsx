
import React, { useState, useEffect, useRef } from 'react';
import { Play, ChevronRight, Pause } from 'lucide-react';

interface SlideData {
  id: number;
  title: string;
  description: string;
  image: string;
  category: string;
  rating: string;
}

const HeroSection = () => {
  const slides: SlideData[] = [
    {
      id: 1,
      title: "Demon Slayer: Kimetsu no Yaiba",
      description: "Tanjiro sets out to become a demon slayer to avenge his family and cure his sister.",
      image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1920&q=80",
      category: "Action, Fantasy",
      rating: "9.5"
    },
    {
      id: 2,
      title: "Attack on Titan: Final Season",
      description: "Humanity's final stand against the overwhelming power of the Titans.",
      image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1920&q=80",
      category: "Action, Drama",
      rating: "9.8"
    },
    {
      id: 3,
      title: "Your Name",
      description: "Two strangers find themselves linked in a bizarre way. When a connection forms, will distance be the only thing to keep them apart?",
      image: "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=1920&q=80",
      category: "Romance, Fantasy",
      rating: "9.2"
    }
  ];

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slideInterval = useRef<NodeJS.Timeout | null>(null);

  const startSlideTimer = () => {
    if (slideInterval.current) {
      clearInterval(slideInterval.current);
    }

    slideInterval.current = setInterval(() => {
      if (!isPaused) {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }
    }, 6000);
  };

  useEffect(() => {
    startSlideTimer();
    return () => {
      if (slideInterval.current) {
        clearInterval(slideInterval.current);
      }
    };
  }, [isPaused, slides.length]);

  const handleSlideChange = (index: number) => {
    setCurrentSlide(index);
    startSlideTimer();
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

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
              backgroundImage: `linear-gradient(to bottom, rgba(13, 13, 21, 0.3), rgba(13, 13, 21, 0.9)), url('${slide.image}')`,
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
                <p className="text-white/80 text-sm md:text-base mb-6 max-w-2xl">{slide.description}</p>
                <div className="flex flex-wrap gap-3">
                  <button className="inline-flex items-center px-6 py-3 bg-anime-purple text-white font-medium rounded-full hover:bg-anime-purple/90 transition-colors">
                    <Play className="h-4 w-4 mr-2" /> Watch Now
                  </button>
                  <button className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-sm text-white font-medium rounded-full hover:bg-white/20 transition-colors">
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
