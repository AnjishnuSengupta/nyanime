
import React, { useState, useEffect } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { fetchGenres } from '../services/animeService';

// Generate years for dropdown (current year down to 1990)
const years = Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => (new Date().getFullYear() - i).toString());

const statuses = ['Airing', 'Completed', 'Upcoming'];

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
}

export interface SearchFilters {
  query: string;
  genres: string[];
  year: string | null;
  status: string | null;
  rating: [number, number]; // Min and Max rating
}

export const SearchFilters = ({ onSearch }: SearchFiltersProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    genres: [],
    year: null,
    status: null,
    rating: [0, 10]
  });

  // Fetch genres from the API
  const { data: genreList = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours cache
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const handleReset = () => {
    setFilters({
      query: '',
      genres: [],
      year: null,
      status: null,
      rating: [0, 10]
    });
  };

  const toggleGenre = (genre: string) => {
    setFilters(prev => {
      if (prev.genres.includes(genre)) {
        return { ...prev, genres: prev.genres.filter(g => g !== genre) };
      } else {
        return { ...prev, genres: [...prev.genres, genre] };
      }
    });
  };

  return (
    <div className="w-full mb-8">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            type="text"
            placeholder="Search anime..."
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            className="pl-9 bg-anime-gray/50 border-white/10 text-white"
          />
        </div>
        
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="bg-anime-gray/50 border-white/10 text-white hover:bg-white/10">
              <Filter className="h-4 w-4 mr-2" />
              Filters {filters.genres.length > 0 || filters.year || filters.status || filters.rating[0] > 0 || filters.rating[1] < 10 ? 
                <span className="ml-1 w-5 h-5 rounded-full bg-anime-purple text-white text-xs flex items-center justify-center">
                  {filters.genres.length + (filters.year ? 1 : 0) + (filters.status ? 1 : 0) + (filters.rating[0] > 0 || filters.rating[1] < 10 ? 1 : 0)}
                </span> : null
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 md:w-96 bg-anime-gray border-white/10 text-white p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Filter Anime</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleReset}
                className="h-8 text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="h-3 w-3 mr-1" /> Reset
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/70 mb-2 block">Genres</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
                  {genreList.map(genre => (
                    <label 
                      key={genre} 
                      className={`px-3 py-1 rounded-full text-xs cursor-pointer transition-colors ${
                        filters.genres.includes(genre) 
                          ? 'bg-anime-purple text-white' 
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      <Checkbox 
                        checked={filters.genres.includes(genre)}
                        onCheckedChange={() => toggleGenre(genre)}
                        className="sr-only"
                      />
                      {genre}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Year</label>
                  <Select 
                    value={filters.year || undefined} 
                    onValueChange={(value) => setFilters({ ...filters, year: value })}
                  >
                    <SelectTrigger className="bg-anime-dark border-white/10 text-white">
                      <SelectValue placeholder="Any Year" />
                    </SelectTrigger>
                    <SelectContent className="bg-anime-dark border-white/10 text-white">
                      <SelectItem value="">Any Year</SelectItem>
                      {years.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Status</label>
                  <Select 
                    value={filters.status || undefined} 
                    onValueChange={(value) => setFilters({ ...filters, status: value })}
                  >
                    <SelectTrigger className="bg-anime-dark border-white/10 text-white">
                      <SelectValue placeholder="Any Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-anime-dark border-white/10 text-white">
                      <SelectItem value="">Any Status</SelectItem>
                      {statuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-white/70">Rating Range</label>
                  <span className="text-xs text-white/70">{filters.rating[0]} - {filters.rating[1]}</span>
                </div>
                <Slider 
                  defaultValue={[0, 10]} 
                  min={0} 
                  max={10} 
                  step={0.5} 
                  value={filters.rating}
                  onValueChange={(value) => setFilters({ ...filters, rating: value as [number, number] })}
                  className="mt-2"
                />
              </div>
            </div>
            
            <Separator className="my-4 bg-white/10" />
            
            <div className="flex justify-end">
              <Button 
                onClick={() => {
                  onSearch(filters);
                  setIsOpen(false);
                }}
                className="bg-anime-purple hover:bg-anime-purple/90"
              >
                Apply Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </form>
    </div>
  );
};
