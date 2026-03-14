
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import AnimeCard from '../components/AnimeCard';
import { SearchFilters, SearchFilters as SearchFiltersType } from '../components/SearchFilters';
import { useToast } from '@/hooks/use-toast';
import { 
  useAnimeSearch, 
  useTrendingAnime, 
  usePopularAnime, 
  useSeasonalAnime 
} from '../hooks/useAnimeData';
import { GridSkeleton } from '../components/LoadingSkeletons';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';

const AnimeList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();
  
  const category = searchParams.get('category') || 'all';
  const genre = searchParams.get('genre') || '';
  const year = searchParams.get('year') || '';
  const query = searchParams.get('query') || '';
  const status = searchParams.get('status') || '';

  // Get data from different sources based on category
  const { data: trendingData = [], isLoading: trendingLoading } = useTrendingAnime();
  const { data: popularData = [], isLoading: popularLoading } = usePopularAnime();
  const { data: seasonalData = [], isLoading: seasonalLoading } = useSeasonalAnime();
  
  // Use search API for regular searches
  const { 
    data: searchData, 
    isLoading: searchLoading, 
    isFetching: searchFetching, 
    error 
  } = useAnimeSearch(
    query,
    genre,
    year,
    status,
    page
  );

  const derivedListState = useMemo(() => {
    // If there's a specific category, use that data
    if (category === 'trending') {
      return {
        animeList: trendingData,
        hasMore: false,
        totalPages: 1,
        isLoading: trendingLoading,
      };
    }

    if (category === 'popular') {
      return {
        animeList: popularData,
        hasMore: false,
        totalPages: 1,
        isLoading: popularLoading,
      };
    }

    if (category === 'seasonal') {
      return {
        animeList: seasonalData,
        hasMore: false,
        totalPages: 1,
        isLoading: seasonalLoading,
      };
    }

    if (category === 'new') {
      const newAnime = popularData.filter((anime) => parseInt(anime.year) >= 2023);
      return {
        animeList: newAnime,
        hasMore: false,
        totalPages: 1,
        isLoading: popularLoading,
      };
    }

    if (category === 'hot') {
      // Use deterministic ordering to keep render pure.
      const hotAnime = [...popularData]
        .sort((a, b) => {
          const scoreA = Number(a.id) % 97;
          const scoreB = Number(b.id) % 97;
          return scoreB - scoreA;
        })
        .slice(0, 20);
      return {
        animeList: hotAnime,
        hasMore: false,
        totalPages: 1,
        isLoading: popularLoading,
      };
    }

    if (category === 'top') {
      const topAnime = [...popularData].sort((a, b) => {
        const ratingA = parseFloat(a.rating) || 0;
        const ratingB = parseFloat(b.rating) || 0;
        return ratingB - ratingA;
      });
      return {
        animeList: topAnime,
        hasMore: false,
        totalPages: 1,
        isLoading: popularLoading,
      };
    }

    if (genre || query || year || status) {
      return {
        animeList: searchData?.anime || [],
        hasMore: searchData?.pagination?.hasNextPage || false,
        totalPages: searchData?.pagination?.totalPages || 1,
        isLoading: searchLoading,
      };
    }

    const mixed = [...trendingData, ...popularData];
    const uniqueAnime = Array.from(new Map(mixed.map((item) => [item.id, item])).values());
    return {
      animeList: uniqueAnime,
      hasMore: false,
      totalPages: 1,
      isLoading: trendingLoading || popularLoading,
    };
  }, [
    category, 
    trendingData, popularData, seasonalData,
    trendingLoading, popularLoading, seasonalLoading,
    searchData, searchLoading,
    query, genre, year, status
  ]);

  const { animeList, hasMore, totalPages, isLoading } = derivedListState;

  // Log any errors for debugging
  useEffect(() => {
    if (error) {
      console.error("Search error:", error);
      toast({
        title: "Search error",
        description: "Failed to fetch anime. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const isLoadingMore = searchFetching && !searchLoading;

  const handleLoadMore = () => {
    if (page < totalPages) {
      setPage(prev => prev + 1);
    }
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
    
    if (filters.status) {
      newParams.set('status', filters.status);
    }
    
    if (category !== 'all') {
      newParams.set('category', category);
    }
    
    setSearchParams(newParams);
    setPage(1);
    
    toast({
      title: "Search applied",
      description: `Applied filters to anime list`,
      duration: 3000,
    });
    
    setShowFilters(false);
  };

  const getCategoryTitle = () => {
    switch (category) {
      case 'trending':
        return 'Trending Anime';
      case 'popular':
        return 'Popular Anime';
      case 'seasonal':
        return 'Seasonal Anime';
      case 'new':
        return 'New Releases';
      case 'hot':
        return 'Hot This Week';
      case 'top':
        return 'Top Rated Anime';
      default:
        return genre ? `${genre.charAt(0).toUpperCase() + genre.slice(1)} Anime` : (query ? `Search: "${query}"` : 'All Anime');
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
                {animeList.map((anime) => (
                  <AnimeCard 
                    key={`${category}-${anime.id}`}
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
            
            {hasMore && (
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
