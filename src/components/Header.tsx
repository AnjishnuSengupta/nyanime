
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell, User, ChevronDown, LogOut, TrendingUp, Flame, Settings as SettingsIcon } from 'lucide-react';
import SearchBar from './SearchBar';
import RandomAnimeButton from './RandomAnimeButton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [hasUpcomingEpisode, setHasUpcomingEpisode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    const checkAuth = () => {
      const userJson = localStorage.getItem('user');
      if (userJson) {
        try {
          const userData = JSON.parse(userJson);
          setIsLoggedIn(true);
          setUsername(userData.username || 'User');
          setAvatarUrl(userData.avatar || '');
        } catch {
          console.error("Failed to parse user data");
          setIsLoggedIn(false);
        }
      } else {
        setIsLoggedIn(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    checkAuth();
    
    // Listen for auth changes from other tabs
    window.addEventListener('storage', checkAuth);
    
    // Listen for auth changes from current tab (custom event)
    window.addEventListener('authStateChanged', checkAuth);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('authStateChanged', checkAuth);
    };
  }, []);

  // Poll the batch next-episode endpoint every 3 minutes to check for imminent episodes
  const checkUpcomingEpisodes = useCallback(async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setHasUpcomingEpisode(false);
      return;
    }
    try {
      // Read watch history IDs from localStorage (fast, no Firebase round-trip)
      const stored = localStorage.getItem('continueWatching');
      let ids: number[] = [];
      if (stored) {
        try {
          ids = (JSON.parse(stored) as Array<{ id?: number; animeId?: number }>)
            .map((i) => i.id ?? i.animeId)
            .filter(Boolean) as number[];
        } catch { /* ignore */ }
      }
      if (ids.length === 0) return;

      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/anime/next-episode-batch?ids=${ids.join(',')}`);
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ airingAt: number | null }>;
      const now = Date.now();
      const hasImminent = data.some(
        (d) => d.airingAt !== null && d.airingAt * 1000 - now < 3600 * 1000 && d.airingAt * 1000 > now
      );
      setHasUpcomingEpisode(hasImminent);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setHasUpcomingEpisode(false);
      return;
    }
    checkUpcomingEpisodes();
    const interval = setInterval(checkUpcomingEpisodes, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isLoggedIn, checkUpcomingEpisodes]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    localStorage.removeItem('continueWatching');
    setIsLoggedIn(false);
    // Dispatch custom event so other components know auth state changed
    window.dispatchEvent(new Event('authStateChanged'));
    navigate('/');
  };

  const genres = [
    'Action', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Sci-Fi', 'Slice of Life'
  ];

  // Simplified highlights - only keeping Trending and Hot This Week
  const highlights = [
    { icon: <TrendingUp className="mr-2 h-4 w-4" />, label: 'Trending', path: '/anime?category=trending' },
    { icon: <Flame className="mr-2 h-4 w-4" />, label: 'Hot This Week', path: '/anime?category=hot' },
  ];

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'glass py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 max-w-full">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <div className="text-white font-bold text-2xl tracking-tighter">
                <span className="text-anime-purple">Ny</span>Anime
              </div>
            </Link>
            
            {/* Desktop Navigation - All items aligned in one row */}
            <nav className="hidden md:flex ml-10 items-center space-x-6">
              <Link to="/" className="text-white font-medium text-sm hover:text-anime-purple transition-colors">
                Home
              </Link>
              <div className="relative group">
                <button aria-label="Genres menu" className="text-white font-medium text-sm flex items-center hover:text-anime-purple transition-colors">
                  Genres <ChevronDown className="ml-1 h-4 w-4" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-48 glass-card rounded-lg overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left group-hover:translate-y-0 translate-y-2 z-50">
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {genres.map((genre) => (
                      <Link 
                        key={genre} 
                        to={`/anime?genre=${genre.toLowerCase()}`}
                        className="text-white/80 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/5 transition-colors"
                      >
                        {genre}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
              {/* Only display Trending and Hot This Week */}
              {highlights.map((item) => (
                <Link 
                  key={item.label}
                  to={item.path} 
                  className="text-white font-medium text-sm hover:text-anime-purple transition-colors flex items-center"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          
          {/* Right Side */}
          <div className="flex items-center space-x-3">
            <SearchBar />
            <RandomAnimeButton />
            
            {isLoggedIn ? (
              <>
                <Link to="/notifications" className="hidden md:flex text-white/70 hover:text-white transition-colors relative">
                  <Bell className="h-5 w-5" />
                  {hasUpcomingEpisode && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                  )}
                </Link>
                
                <DropdownMenu>
                  <DropdownMenuTrigger className="hidden md:flex items-center gap-2 px-2 py-1 rounded-full hover:bg-white/10 transition-colors">
                    <div className="w-8 h-8 bg-anime-purple/20 rounded-full flex items-center justify-center overflow-hidden border border-anime-purple/30">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-anime-purple" />
                      )}
                    </div>
                    <span className="text-white text-sm font-medium">{username}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 bg-anime-dark border-white/10 text-white">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className="focus:bg-white/10 cursor-pointer" onClick={() => { navigate('/profile'); }}>
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-white/10 cursor-pointer" onClick={() => navigate('/profile')}>
                      <span>Watchlist</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-white/10 cursor-pointer" onClick={() => navigate('/profile')}>
                      <span>History</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="focus:bg-white/10 cursor-pointer" onClick={() => { navigate('/settings'); }}>
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className="focus:bg-white/10 cursor-pointer text-red-400" onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="hidden md:flex items-center space-x-3">
                <Link 
                  to="/signin"
                  className="text-white font-medium text-sm hover:text-anime-purple transition-colors"
                >
                  Sign In
                </Link>
                <Link 
                  to="/signup"
                  className="bg-anime-purple text-white font-medium text-sm px-4 py-2 rounded-md hover:bg-anime-purple/90 transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
            
            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-white/70 hover:text-white transition-colors"
              onClick={() => { setIsMobileMenuOpen(!isMobileMenuOpen); }}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        <div className={`md:hidden transition-all duration-300 ease-in-out overflow-hidden ${
          isMobileMenuOpen ? 'max-h-96 opacity-100 mt-5' : 'max-h-0 opacity-0'
        }`}>
          <nav className="flex flex-col space-y-4 pb-4">
            <Link to="/" className="text-white font-medium hover:text-anime-purple transition-colors">
              Home
            </Link>
            <Link to="/anime" className="text-white font-medium hover:text-anime-purple transition-colors">
              All Anime
            </Link>
            
            {/* Mobile Highlights - Only Trending and Hot This Week */}
            {highlights.map((item) => (
              <Link 
                key={item.label}
                to={item.path} 
                className="text-white font-medium hover:text-anime-purple transition-colors flex items-center"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            
            <div className="pt-2 border-t border-white/10">
              {isLoggedIn ? (
                <>
                  <Link to="/profile" className="text-white flex items-center py-2 hover:text-anime-purple">
                    <User className="h-5 w-5 mr-2" /> Profile
                  </Link>
                  <button 
                    onClick={handleLogout} 
                    className="text-red-400 flex items-center py-2 hover:text-red-300 w-full text-left"
                  >
                    <LogOut className="h-5 w-5 mr-2" /> Log Out
                  </button>
                </>
              ) : (
                <div className="flex flex-col space-y-3 pt-2">
                  <Link 
                    to="/signin"
                    className="text-white font-medium hover:text-anime-purple transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link 
                    to="/signup"
                    className="bg-anime-purple text-white font-medium px-4 py-2 rounded-md hover:bg-anime-purple/90 transition-colors inline-block w-full text-center"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
