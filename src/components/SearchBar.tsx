
import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  const handleClear = () => {
    setSearchQuery('');
  };

  return (
    <div 
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
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
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
            {[1, 2, 3].map((item) => (
              <div 
                key={item} 
                className="flex items-center space-x-3 p-2 hover:bg-white/5 rounded-md transition-colors cursor-pointer"
              >
                <div className="w-10 h-14 bg-anime-gray/60 rounded-sm overflow-hidden animate-pulse"></div>
                <div>
                  <div className="text-sm font-medium">Search Result {item}</div>
                  <div className="text-xs text-white/60">Action, Fantasy • 2023</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-center">
            <button className="text-sm text-anime-purple hover:text-anime-purple/80 font-medium transition-colors">
              View all results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
