
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import AnimeCard from '../components/AnimeCard';
import { SearchFilters, SearchFilters as SearchFiltersType } from '../components/SearchFilters';
import { useToast } from '@/hooks/use-toast';
import { useTrendingAnime, usePopularAnime, useSeasonalAnime } from '../hooks/useAnimeData';
import { GridSkeleton } from '../components/LoadingSkeletons';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';

const AnimeList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { trendingAnime, isLoading: trendingLoading } = useTrendingAnime();
  const { popularAnime, isLoading: popularLoading } = usePopularAnime();
  const { seasonalAnime, isLoading: seasonalLoading } = useSeasonalAnime();
  const [animeList, setAnimeList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();
  
  const ITEMS_PER_PAGE = 20;
  
  const category = searchParams.get('category') || 'all';
  const genre = searchParams.get('genre') || '';
  const year = searchParams.get('year') || '';
  const query = searchParams.get('query') || '';

  useEffect(() => {
    if (trendingLoading || popularLoading || seasonalLoading) {
      return;
    }
    
    setIsLoading(true);
    
    // Combine all anime data
    let combinedAnime: any[] = [];
    
    switch (category) {
      case 'trending':
        combinedAnime = [...trendingAnime];
        break;
      case 'popular':
        combinedAnime = [...popularAnime];
        break;
      case 'seasonal':
        combinedAnime = [...seasonalAnime];
        break;
      default:
        combinedAnime = [...trendingAnime, ...popularAnime, ...seasonalAnime];
        // Remove duplicates based on id
        combinedAnime = combinedAnime.filter((anime, index, self) =>
          index === self.findIndex((a) => a.id === anime.id)
        );
    }
    
    // Apply filters
    let filteredAnime = combinedAnime;
    
    // Filter by genre if specified
    if (genre) {
      filteredAnime = filteredAnime.filter(anime => 
        anime.category.toLowerCase().includes(genre.toLowerCase())
      );
    }
    
    // Filter by year if specified
    if (year) {
      filteredAnime = filteredAnime.filter(anime => anime.year === year);
    }
    
    // Filter by search query if specified
    if (query) {
      filteredAnime = filteredAnime.filter(anime => 
        anime.title.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    setAnimeList(filteredAnime);
    setHasMore(filteredAnime.length > ITEMS_PER_PAGE);
    setPage(1);
    setIsLoading(false);
    
  }, [category, genre, year, query, trendingAnime, popularAnime, seasonalAnime, trendingLoading, popularLoading, seasonalLoading]);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setPage(prev => prev + 1);
    
    // Simulate loading delay
    setTimeout(() => {
      setIsLoadingMore(false);
      
      // If no more items to load
      if ((page + 1) * ITEMS_PER_PAGE >= animeList.length) {
        setHasMore(false);
      }
    }, 800);
  };

  const handleSearch = (filters: SearchFiltersType) => {
    const newParams = new URLSearchParams();
    
    if (filters.query) {
      newParams.set('query', filters.query);
    }
    
    if (filters.genres.length > 0) {
      newParams.set('genre', filters.genres[0]);
    }
    
    if (filters.year) {
      newParams.set('year', filters.year);
    }
    
    if (category !== 'all') {
      newParams.set('category', category);
    }
    
    setSearchParams(newParams);
    
    toast({
      title: "Search applied",
      description: `Applied filters to anime list`,
      duration: 3000,
    });
    
    setShowFilters(false);
  };

  const visibleAnime = animeList.slice(0, page * ITEMS_PER_PAGE);

  const getCategoryTitle = () => {
    switch (category) {
      case 'trending':
        return 'Trending Anime';
      case 'popular':
        return 'Popular Anime';
      case 'seasonal':
        return 'Seasonal Anime';
      default:
        return genre ? `${genre} Anime` : (query ? `Search: "${query}"` : 'All Anime');
    }
  };

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{getCategoryTitle()}</h1>
            <p className="text-white/60">
              {isLoading ? 'Loading...' : `${animeList.length} results found`}
            </p>
          </div>
          
          <Button
            onClick={() => setShowFilters(!showFilters)}
            className="mt-4 md:mt-0 bg-anime-dark hover:bg-anime-dark/90"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>
        
        {showFilters && (
          <div className="mb-8">
            <SearchFilters onSearch={handleSearch} />
          </div>
        )}
        
        {isLoading ? (
          <GridSkeleton />
        ) : (
          <>
            {animeList.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
                {visibleAnime.map((anime) => (
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
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-24 h-24 rounded-full bg-anime-dark flex items-center justify-center mb-6">
                  <span className="text-white text-4xl">😢</span>
                </div>
                <h2 className="text-xl font-medium text-white mb-2">No results found</h2>
                <p className="text-white/60 mb-6">Try adjusting your filters or search query</p>
                <Button 
                  onClick={() => setSearchParams({})}
                  className="bg-anime-purple hover:bg-anime-purple/90"
                >
                  Clear Filters
                </Button>
              </div>
            )}
            
            {hasMore && animeList.length > 0 && (
              <div className="flex justify-center mt-12">
                <Button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-8 py-2 bg-anime-dark hover:bg-anime-dark/90"
                >
                  {isLoadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AnimeList;
