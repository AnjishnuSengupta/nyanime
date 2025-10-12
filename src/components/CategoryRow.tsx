
import React, { useRef } from 'react';
import AnimeCard from './AnimeCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategoryRowProps {
  title: string;
  seeAllLink?: string;
  animeList: {
    id: number;
    title: string;
    image: string;
    category: string;
    rating: string;
    year: string;
    episodes?: number;
  }[];
}

const CategoryRow = ({ title, seeAllLink, animeList }: CategoryRowProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = current.clientWidth * 0.75;
      
      if (direction === 'left') {
        current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="py-6 md:py-10">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {seeAllLink && (
            <a 
              href={seeAllLink} 
              className="flex items-center text-sm font-medium text-anime-purple hover:underline"
            >
              See All <ChevronRight className="h-4 w-4 ml-1" />
            </a>
          )}
        </div>
        
        {/* Scroll Container */}
        <div className="relative group">
          <div 
            ref={scrollContainerRef}
            className="flex space-x-4 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4"
          >
            {animeList.map((anime) => (
              <div 
                key={anime.id} 
                className="flex-shrink-0 w-[180px] sm:w-[220px] md:w-[250px]"
              >
                <AnimeCard 
                  id={anime.id}
                  title={anime.title}
                  image={anime.image}
                  category={anime.category}
                  rating={anime.rating}
                  year={anime.year}
                  episodes={anime.episodes}
                  compact
                />
              </div>
            ))}
          </div>
          
          {/* Scroll Buttons */}
          <button 
            onClick={() => scroll('left')} 
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-black/50 rounded-full p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-black/70 focus:outline-none disabled:opacity-0"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button 
            onClick={() => scroll('right')} 
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-black/50 rounded-full p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-black/70 focus:outline-none disabled:opacity-0"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default CategoryRow;
