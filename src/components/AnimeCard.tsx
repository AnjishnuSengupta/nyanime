
import React, { useState } from 'react';
import { Play, Star } from 'lucide-react';

interface AnimeCardProps {
  id: number;
  title: string;
  image: string;
  category: string;
  rating: string;
  year: string;
  episodes?: number;
  compact?: boolean;
}

const AnimeCard = ({ 
  id, 
  title, 
  image, 
  category, 
  rating, 
  year, 
  episodes, 
  compact = false 
}: AnimeCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`group relative overflow-hidden ${compact ? 'rounded-lg' : 'rounded-xl'} transition-transform duration-300 ease-out ${
        isHovered ? 'transform scale-[1.03]' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background Image */}
      <div 
        className="w-full h-full"
        style={{
          aspectRatio: compact ? '16/10' : '2/3',
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-100" />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-3 md:p-4">
        {/* Title and Rating */}
        <h3 className="text-white font-semibold text-sm md:text-base line-clamp-2 mb-1">{title}</h3>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/70">{category}</span>
          <div className="flex items-center">
            <Star className="h-3 w-3 text-yellow-400 mr-1" fill="currentColor" />
            <span className="text-white">{rating}</span>
          </div>
        </div>
      </div>
      
      {/* Hover Effect */}
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center p-4 transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button className="w-12 h-12 rounded-full bg-anime-purple flex items-center justify-center mb-3 animate-scale-up">
          <Play className="h-5 w-5 text-white" fill="currentColor" />
        </button>
        <h3 className="text-white font-semibold text-center mb-1">{title}</h3>
        <div className="flex items-center justify-center text-xs mb-2">
          <span className="text-white/70">{year}</span>
          {episodes && (
            <>
              <div className="mx-2 h-3 w-px bg-white/20"></div>
              <span className="text-white/70">{episodes} Episodes</span>
            </>
          )}
        </div>
        <div className="inline-flex items-center bg-white/10 px-3 py-1 rounded-full">
          <span className="text-xs font-medium text-white">{category}</span>
        </div>
      </div>
    </div>
  );
};

export default AnimeCard;
