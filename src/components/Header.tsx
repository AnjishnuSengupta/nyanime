
import React, { useEffect, useState } from 'react';
import { Menu, Bell, User, ChevronDown } from 'lucide-react';
import SearchBar from './SearchBar';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const categories = [
    'Action', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Romance', 'Sci-Fi', 'Slice of Life'
  ];

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'glass py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <a href="/" className="flex items-center">
              <div className="text-white font-bold text-2xl tracking-tighter">
                <span className="text-anime-purple">Ani</span>Stream
              </div>
            </a>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex ml-10 space-x-6">
              <a href="/" className="text-white font-medium text-sm hover:text-anime-purple transition-colors">
                Home
              </a>
              <div className="relative group">
                <button className="text-white font-medium text-sm flex items-center hover:text-anime-purple transition-colors">
                  Categories <ChevronDown className="ml-1 h-4 w-4" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-48 glass-card rounded-lg overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left group-hover:translate-y-0 translate-y-2 z-50">
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {categories.map((category) => (
                      <a 
                        key={category} 
                        href={`/category/${category.toLowerCase()}`}
                        className="text-white/80 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/5 transition-colors"
                      >
                        {category}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <a href="/seasonal" className="text-white font-medium text-sm hover:text-anime-purple transition-colors">
                Seasonal
              </a>
              <a href="/popular" className="text-white font-medium text-sm hover:text-anime-purple transition-colors">
                Popular
              </a>
            </nav>
          </div>
          
          {/* Right Side */}
          <div className="flex items-center space-x-5">
            <SearchBar />
            
            <button className="hidden md:flex text-white/70 hover:text-white transition-colors">
              <Bell className="h-5 w-5" />
            </button>
            
            <button className="hidden md:flex text-white/70 hover:text-white transition-colors">
              <User className="h-5 w-5" />
            </button>
            
            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-white/70 hover:text-white transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
            <a href="/" className="text-white font-medium hover:text-anime-purple transition-colors">
              Home
            </a>
            <a href="/categories" className="text-white font-medium hover:text-anime-purple transition-colors">
              Categories
            </a>
            <a href="/seasonal" className="text-white font-medium hover:text-anime-purple transition-colors">
              Seasonal
            </a>
            <a href="/popular" className="text-white font-medium hover:text-anime-purple transition-colors">
              Popular
            </a>
            <div className="pt-2 border-t border-white/10 flex space-x-4">
              <a href="/notifications" className="text-white/70 hover:text-white transition-colors flex items-center">
                <Bell className="h-5 w-5 mr-2" /> Notifications
              </a>
              <a href="/profile" className="text-white/70 hover:text-white transition-colors flex items-center">
                <User className="h-5 w-5 mr-2" /> Profile
              </a>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
