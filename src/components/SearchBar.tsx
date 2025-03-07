
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useTrendingAnime, usePopularAnime } from '../hooks/useAnimeData';

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const { trendingAnime } = useTrendingAnime();
  const { popularAnime } = usePopularAnime();
  
  // Handle clicks outside the search component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Debounce search query
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(timerId);
    };
  }, [searchQuery]);
  
  // Search logic
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    // Combine anime lists and remove duplicates
    const allAnime = [...trendingAnime, ...popularAnime].filter(
      (anime, index, self) => index === self.findIndex((a) => a.id === anime.id)
    );
    
    // Filter based on search query
    const results = allAnime
      .filter(anime => anime.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
      .slice(0, 5); // Limit to 5 results for quick search
    
    setSearchResults(results);
  }, [debouncedQuery, trendingAnime, popularAnime]);
  
  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
  };
  
  const handleViewAllResults = () => {
    navigate(`/anime?query=${searchQuery}`);
    setIsFocused(false);
  };
  
  const handleResultClick = (animeId: number) => {
    navigate(`/anime/${animeId}`);
    setIsFocused(false);
  };

  return (
    <div 
      ref={searchContainerRef}
      className={`relative flex items-center transition-all duration-300 ease-in-out ${
        isFocused 
          ? 'w-full md:w-96 bg-secondary/80 border border-white/20' 
          : 'w-10 md:w-64 bg-secondary/50'
      } rounded-full overflow-hidden`}
    >
      <div className="flex items-center px-3 py-2 w-full">
        <Search 
          className={`text-white/70 h-5 w-5 flex-shrink-0 ${isFocused ? 'mr-2' : 'mr-0'}`} 
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search anime..."
          className={`bg-transparent border-none outline-none text-white w-full ${
            isFocused ? 'opacity-100' : 'opacity-0 md:opacity-100'
          } transition-opacity`}
        />
        {searchQuery && isFocused && (
          <button 
            onClick={handleClear} 
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {isFocused && searchQuery && (
        <div className="absolute top-full left-0 right-0 mt-2 glass rounded-lg p-3 z-50 animate-fade-in shadow-xl">
          <div className="text-sm font-medium text-white/60 mb-2">Quick Results</div>
          <div className="space-y-2">
            {searchResults.length > 0 ? (
              searchResults.map((anime) => (
                <div 
                  key={anime.id} 
                  className="flex items-center space-x-3 p-2 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                  onClick={() => handleResultClick(anime.id)}
                >
                  <div className="w-10 h-14 bg-anime-gray/60 rounded-sm overflow-hidden">
                    <img src={anime.image} alt={anime.title} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{anime.title}</div>
                    <div className="text-xs text-white/60">{anime.category} • {anime.year}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-2 text-white/60 text-sm">
                {debouncedQuery.length < 2 ? 'Type at least 2 characters' : 'No results found'}
              </div>
            )}
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-center">
            <button 
              className="text-sm text-anime-purple hover:text-anime-purple/80 font-medium transition-colors"
              onClick={handleViewAllResults}
            >
              View all results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
