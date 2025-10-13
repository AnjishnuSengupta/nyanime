
import React, { useState } from 'react';
import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import CategoryRow from '../components/CategoryRow';
import AnimeCard from '../components/AnimeCard';
import ContinueWatching from '../components/ContinueWatching';
import { useTrendingAnime, usePopularAnime, useSeasonalAnime } from '../hooks/useAnimeData';
import { CategorySkeleton, GridSkeleton, HeroSkeleton } from '../components/LoadingSkeletons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const { data: trendingAnime = [], isLoading: trendingLoading } = useTrendingAnime();
  const { data: popularAnime = [], isLoading: popularLoading } = usePopularAnime();
  const { data: seasonalAnime = [], isLoading: seasonalLoading } = useSeasonalAnime();
  const [activeTab, setActiveTab] = useState('trending');

  // Create categories for highlights
  const getNewAnime = () => {
    return popularAnime.filter(anime => parseInt(anime.year) >= 2023).slice(0, 10);
  };
  
  const getActionAnime = () => {
    return popularAnime.filter(anime => 
      anime.category.toLowerCase().includes('action')
    ).slice(0, 10);
  };
  
  const getRomanceAnime = () => {
    return popularAnime.filter(anime => 
      anime.category.toLowerCase().includes('romance')
    ).slice(0, 10);
  };
  
  // Hot this week - simulate with a random sampling of popular anime
  const getHotThisWeek = () => {
    return [...popularAnime].sort(() => 0.5 - Math.random()).slice(0, 10);
  };
  
  // Top rated - simulate with sorting popular anime by rating
  const getTopRated = () => {
    return [...popularAnime].sort((a, b) => {
      const ratingA = parseFloat(a.rating) || 0;
      const ratingB = parseFloat(b.rating) || 0;
      return ratingB - ratingA;
    }).slice(0, 10);
  };

  if (trendingLoading && popularLoading && seasonalLoading) {
    return (
      <div className="min-h-screen bg-anime-darker animate-fade-in">
        <Header />
        <main>
          <HeroSkeleton />
          <CategorySkeleton />
          <GridSkeleton />
        </main>
      </div>
    );
  }

  const newAnime = getNewAnime();
  const actionAnime = getActionAnime();
  const romanceAnime = getRomanceAnime();
  const hotThisWeek = getHotThisWeek();
  const topRated = getTopRated();

  return (
    <div className="min-h-screen bg-anime-darker animate-fade-in">
      <Header />
      
      <main>
        <HeroSection />
        
        {/* Continue Watching Section */}
        <ContinueWatching />
        
        {/* Featured Content Tabs */}
        <section className="py-4 sm:py-6 md:py-8">
          <div className="container mx-auto px-4 md:px-6">
            <Tabs 
              defaultValue="trending" 
              className="w-full"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
                <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TabsList className="bg-anime-dark h-10 inline-flex w-auto min-w-full sm:min-w-0">
                    <TabsTrigger value="trending" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">Trending</TabsTrigger>
                    <TabsTrigger value="popular" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">Popular</TabsTrigger>
                    <TabsTrigger value="seasonal" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">Seasonal</TabsTrigger>
                    <TabsTrigger value="new" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">New</TabsTrigger>
                    <TabsTrigger value="hot" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">Hot</TabsTrigger>
                    <TabsTrigger value="top" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">Top Rated</TabsTrigger>
                  </TabsList>
                </div>
                <a href="/anime" className="text-xs sm:text-sm text-anime-purple flex items-center hover:underline whitespace-nowrap ml-4 sm:ml-0">
                  Explore All <ChevronRight className="h-4 w-4" />
                </a>
              </div>
              
              <TabsContent value="trending" className="mt-0">
                {trendingLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {trendingAnime.slice(0, 10).map((anime, index) => (
                      <AnimeCard 
                        key={`trending-${anime.id}-${index}`}
                        id={anime.id}
                        title={anime.title}
                        image={anime.image}
                        category={anime.category}
                        rating={anime.rating}
                        year={anime.year}
                        episodes={anime.episodes}
                        progress={anime.id % 2 === 0 ? Math.floor(Math.random() * 100) : undefined}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="popular" className="mt-0">
                {popularLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {popularAnime.slice(0, 10).map((anime) => (
                      <AnimeCard 
                        key={`popular-${anime.id}`}
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
                )}
              </TabsContent>
              
              <TabsContent value="seasonal" className="mt-0">
                {seasonalLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {seasonalAnime.slice(0, 10).map((anime) => (
                      <AnimeCard 
                        key={`seasonal-${anime.id}`}
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
                )}
              </TabsContent>
              
              <TabsContent value="new" className="mt-0">
                {popularLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {newAnime.map((anime) => (
                      <AnimeCard 
                        key={`new-${anime.id}`}
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
                )}
              </TabsContent>
              
              <TabsContent value="hot" className="mt-0">
                {popularLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {hotThisWeek.map((anime) => (
                      <AnimeCard 
                        key={`hot-${anime.id}`}
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
                )}
              </TabsContent>
              
              <TabsContent value="top" className="mt-0">
                {popularLoading ? (
                  <GridSkeleton />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
                    {topRated.map((anime) => (
                      <AnimeCard 
                        key={`top-${anime.id}`}
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
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>
        
        {/* Category Rows */}
        <>
          {seasonalLoading ? (
            <CategorySkeleton />
          ) : (
            <CategoryRow 
              title="This Season's Anime" 
              seeAllLink="/anime?category=seasonal"
              animeList={seasonalAnime}
            />
          )}
          
          {popularLoading ? (
            <CategorySkeleton />
          ) : (
            <CategoryRow 
              title="Most Popular" 
              seeAllLink="/anime?category=popular"
              animeList={popularAnime}
            />
          )}
          
          {/* Additional highlight sections */}
          {!popularLoading && hotThisWeek.length > 0 && (
            <CategoryRow 
              title="Hot This Week" 
              seeAllLink="/anime?category=hot"
              animeList={hotThisWeek}
            />
          )}
          
          {!popularLoading && topRated.length > 0 && (
            <CategoryRow 
              title="Top Rated Anime" 
              seeAllLink="/anime?category=top"
              animeList={topRated}
            />
          )}
          
          {!popularLoading && actionAnime.length > 0 && (
            <CategoryRow 
              title="Action Anime" 
              seeAllLink="/anime?genre=action"
              animeList={actionAnime}
            />
          )}
          
          {!popularLoading && romanceAnime.length > 0 && (
            <CategoryRow 
              title="Romance Anime" 
              seeAllLink="/anime?genre=romance"
              animeList={romanceAnime}
            />
          )}
        </>
        
        {/* Genres */}
        <section className="py-10 md:py-16 bg-anime-dark">
          <div className="container mx-auto px-4 md:px-6">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Explore by Genre</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
              {['Action', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Sci-Fi', 'Slice of Life', 'Adventure', 'Mystery', 'Supernatural', 'Sports'].map((genre) => (
                <a 
                  key={genre}
                  href={`/anime?genre=${genre.toLowerCase()}`} 
                  className="group glass-card p-8 flex flex-col items-center justify-center transition-transform hover:scale-105"
                >
                  <span className="text-lg font-semibold text-white group-hover:text-anime-purple transition-colors">{genre}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
        
        {/* Newsletter */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-white mb-4">Stay Updated with New Releases</h2>
              <p className="text-white/70 mb-8">Get notified about new episodes, seasonal anime, and exclusive content.</p>
              <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input 
                  type="email" 
                  placeholder="Enter your email" 
                  className="flex-1 px-4 py-3 rounded-lg bg-anime-gray border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-anime-purple"
                />
                <Button 
                  type="submit" 
                  className="px-6 py-3 bg-anime-purple text-white font-medium rounded-lg hover:bg-anime-purple/90 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    toast({
                      title: "Subscribed!",
                      description: "You've been added to our newsletter.",
                      duration: 3000,
                    });
                  }}
                >
                  Subscribe
                </Button>
              </form>
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="bg-anime-dark border-t border-white/10 py-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <div className="text-white font-bold text-2xl tracking-tighter">
                <span className="text-anime-purple">Ny</span>Anime
              </div>
              <p className="text-white/60 mt-2 text-sm">The ultimate anime streaming platform</p>
            </div>
            <div className="flex flex-wrap gap-8 justify-center">
              <div>
                <h4 className="text-white font-medium mb-3">Navigation</h4>
                <ul className="space-y-2">
                  <li><a href="/" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Home</a></li>
                  <li><a href="/categories" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Categories</a></li>
                  <li><a href="/seasonal" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Seasonal</a></li>
                  <li><a href="/popular" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Popular</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-medium mb-3">Legal</h4>
                <ul className="space-y-2">
                  <li><a href="/terms" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Terms of Service</a></li>
                  <li><a href="/privacy" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Privacy Policy</a></li>
                  <li><a href="/copyright" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Copyright</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-medium mb-3">Connect</h4>
                <ul className="space-y-2">
                  <li><a href="/contact" className="text-white/60 text-sm hover:text-anime-purple transition-colors">Contact Us</a></li>
                  <li><a href="/about" className="text-white/60 text-sm hover:text-anime-purple transition-colors">About</a></li>
                  <li><a href="/faq" className="text-white/60 text-sm hover:text-anime-purple transition-colors">FAQ</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 text-center">
            <p className="text-white/60 text-sm">© 2023 NyAnime. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
