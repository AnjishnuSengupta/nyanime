
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { searchAnime } from '../services/animeService';
import { AnimeData } from '../services/animeService';

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnimeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
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
  
  // Fetch search results using MAL/Jikan API
  useEffect(() => {
    const fetchResults = async () => {
      if (debouncedQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      
      setIsLoading(true);
      try {
        const results = await searchAnime(debouncedQuery);
        setSearchResults(results.anime);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchResults();
  }, [debouncedQuery]);
  
  const handleClear = () => {
    setSearchQuery('');
    setDebouncedQuery('');
  };
  
  const handleViewAllResults = () => {
    navigate(`/anime?query=${encodeURIComponent(searchQuery)}`);
    setIsFocused(false);
    setSearchQuery('');
  };
  
  const handleResultClick = (animeId: string) => {
    // For now, navigate to the MAL-based anime details
    // We'll need to convert or create a new details page for Aniwatch IDs
    navigate(`/anime/${animeId}`);
    setIsFocused(false);
    setSearchQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/anime?query=${encodeURIComponent(searchQuery)}`);
      setIsFocused(false);
      setSearchQuery('');
    }
  };

  const handleGenreClick = (genre: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/anime?genre=${encodeURIComponent(genre.toLowerCase())}`);
    setIsFocused(false);
    setSearchQuery('');
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
      <form className="flex items-center px-3 py-2 w-full" onSubmit={handleSubmit}>
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
            type="button"
            onClick={handleClear} 
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      {isFocused && searchQuery && (
        <div className="absolute top-full left-0 right-0 mt-2 glass rounded-lg p-3 z-50 animate-fade-in shadow-xl">
          <div className="text-sm font-medium text-white/60 mb-2">Quick Results</div>
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-2 text-white/60 text-sm">
                Searching...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.slice(0, 5).map((anime) => (
                <div 
                  key={anime.id} 
                  className="flex items-center space-x-3 p-2 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                  onClick={() => handleResultClick(anime.id.toString())}
                >
                  <div className="w-10 h-14 bg-anime-gray/60 rounded-sm overflow-hidden">
                    <img src={anime.image || '/placeholder.svg'} alt={anime.title} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{anime.title}</div>
                    <div className="text-xs text-white/60">
                      {anime.category && (
                        <span 
                          className="cursor-pointer hover:text-anime-purple"
                          onClick={(e) => handleGenreClick(anime.category, e)}
                        >
                          {anime.category}
                        </span>
                      )} 
                      {anime.duration && <span> • {anime.duration}</span>}
                    </div>
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
