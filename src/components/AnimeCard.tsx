
import React, { useState } from 'react';
import { Play, Star, Calendar, Clock, List, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface AnimeCardProps {
  id: number;
  title: string;
  image: string;
  category: string;
  rating: string;
  year: string;
  episodes?: number;
  compact?: boolean;
  progress?: number;
}

const AnimeCard = ({ 
  id, 
  title, 
  image, 
  category, 
  rating, 
  year, 
  episodes, 
  compact = false,
  progress
}: AnimeCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/anime/${id}`);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/anime/${id}/watch`);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    toast({
      title: isFavorite ? "Removed from favorites" : "Added to favorites",
      description: `${title} has been ${isFavorite ? "removed from" : "added to"} your favorites`,
      duration: 3000,
    });
  };

  const handleCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Extract the first genre if multiple are present
    const firstGenre = category.split(',')[0].trim();
    navigate(`/anime?genre=${encodeURIComponent(firstGenre)}`);
  };

  return (
    <div 
      className={`group relative overflow-hidden ${compact ? 'rounded-lg' : 'rounded-lg md:rounded-xl'} transition-transform duration-300 ease-out ${
        isHovered ? 'transform scale-[1.03] shadow-lg' : ''
      } cursor-pointer`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${title}`}
    >
      {/* Background Image */}
      <div 
        className="w-full h-full"
        style={{
          aspectRatio: compact ? '16/10' : '2/3',
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'top center',
        }}
      />
      
      {/* Progress bar (if progress exists) */}
      {progress !== undefined && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <div 
            className="h-full bg-anime-purple" 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-100" />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-2 sm:p-3 md:p-4">
        {/* Title and Rating */}
        <h3 className="text-white font-semibold text-xs sm:text-sm md:text-base line-clamp-2 mb-1">{title}</h3>
        <div className="flex items-center justify-between text-[10px] sm:text-xs">
          <span 
            className="text-white/70 cursor-pointer hover:text-white"
            onClick={handleCategoryClick}
          >
            {category.split(',')[0].trim()}
          </span>
          <div className="flex items-center">
            <Star className="h-3 w-3 text-yellow-400 mr-1" fill="currentColor" />
            <span className="text-white">{rating}</span>
          </div>
        </div>
      </div>
      
      {/* Hover Effect */}
      <div 
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col justify-center items-center p-4 transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button 
          className="w-12 h-12 rounded-full bg-anime-purple flex items-center justify-center mb-3 animate-scale-up"
          onClick={handlePlay}
        >
          <Play className="h-5 w-5 text-white" fill="currentColor" />
        </button>
        <h3 className="text-white font-semibold text-center mb-1">{title}</h3>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs mb-2">
          <div className="flex items-center text-white/70">
            <Calendar className="h-3 w-3 mr-1" />
            <span>{year}</span>
          </div>
          {episodes && (
            <div className="flex items-center text-white/70">
              <List className="h-3 w-3 mr-1" />
              <span>{episodes} Episodes</span>
            </div>
          )}
          <div className="flex items-center text-white/70">
            <Clock className="h-3 w-3 mr-1" />
            <span>24 min/ep</span>
          </div>
        </div>
        <div 
          className="inline-flex items-center bg-white/10 px-3 py-1 rounded-full cursor-pointer hover:bg-anime-purple/20 transition-colors"
          onClick={handleCategoryClick}
        >
          <span className="text-xs font-medium text-white">{category.split(',')[0].trim()}</span>
        </div>
        
        {/* Favorite button */}
        <button 
          onClick={handleFavorite}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center transition-colors hover:bg-black/70"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart 
            className={`h-4 w-4 ${isFavorite ? 'text-red-500' : 'text-white'}`} 
            fill={isFavorite ? "currentColor" : "none"}
          />
        </button>
      </div>
    </div>
  );
};

export default AnimeCard;
