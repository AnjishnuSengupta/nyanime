
import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import AnimeGrid from '../components/AnimeGrid';
import CategoryRow from '../components/CategoryRow';
import { useTrendingAnime, usePopularAnime, useSeasonalAnime } from '../hooks/useAnimeData';
import { CategorySkeleton, GridSkeleton, HeroSkeleton } from '../components/LoadingSkeletons';

const Index = () => {
  const { trendingAnime, isLoading: trendingLoading } = useTrendingAnime();
  const { popularAnime, isLoading: popularLoading } = usePopularAnime();
  const { seasonalAnime, isLoading: seasonalLoading } = useSeasonalAnime();
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    // Simulate initial page load
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (isPageLoading) {
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

  return (
    <div className="min-h-screen bg-anime-darker animate-fade-in">
      <Header />
      
      <main>
        <HeroSection />
        
        {/* Continue Watching */}
        <div className="bg-anime-dark py-1">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <div className="w-2 h-6 bg-anime-purple rounded-full mr-3"></div>
                <h2 className="text-lg font-semibold text-white">Continue Watching</h2>
              </div>
              <button className="text-sm text-white/60 hover:text-white">Sign In to Track</button>
            </div>
          </div>
        </div>
        
        {/* Seasonal Anime */}
        {seasonalLoading ? (
          <CategorySkeleton />
        ) : (
          <CategoryRow 
            title="Winter 2023 Anime" 
            seeAllLink="/seasonal"
            animeList={seasonalAnime}
          />
        )}
        
        {/* Popular Anime */}
        {popularLoading ? (
          <CategorySkeleton />
        ) : (
          <CategoryRow 
            title="Most Popular" 
            seeAllLink="/popular"
            animeList={popularAnime}
          />
        )}
        
        {/* Trending Anime Grid */}
        {trendingLoading ? (
          <GridSkeleton />
        ) : (
          <AnimeGrid 
            title="Trending Now" 
            seeAllLink="/trending"
            animeList={trendingAnime}
          />
        )}
        
        {/* Genres */}
        <section className="py-10 md:py-16 bg-anime-dark">
          <div className="container mx-auto px-4 md:px-6">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Explore by Genre</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
              {['Action', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Sci-Fi', 'Slice of Life'].map((genre) => (
                <a 
                  key={genre}
                  href={`/genre/${genre.toLowerCase()}`} 
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
                <button 
                  type="submit" 
                  className="px-6 py-3 bg-anime-purple text-white font-medium rounded-lg hover:bg-anime-purple/90 transition-colors"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="bg-anime-dark border-t border-white/10 py-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <div className="text-white font-bold text-2xl tracking-tighter">
                <span className="text-anime-purple">Ani</span>Stream
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
            <p className="text-white/60 text-sm">© 2023 AniStream. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
