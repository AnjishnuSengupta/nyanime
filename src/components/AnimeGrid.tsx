
import React from 'react';
import AnimeCard from './AnimeCard';
import { ChevronRight } from 'lucide-react';

interface AnimeGridProps {
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

const AnimeGrid = ({ title, seeAllLink, animeList }: AnimeGridProps) => {
  return (
    <section className="py-4 sm:py-6 md:py-8 lg:py-12">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
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
        
        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
          {animeList.map((anime) => (
            <AnimeCard 
              key={anime.id}
              id={anime.id}
              title={anime.title}
              image={anime.image}
              category={anime.category}
              rating={anime.rating}
              year={anime.year}
              episodes={anime.episodes}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default AnimeGrid;
