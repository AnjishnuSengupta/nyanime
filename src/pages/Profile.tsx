import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '../components/Header';
import AnimeCard from '../components/AnimeCard';
import { UserIcon, Settings, LogOut, Edit2 } from 'lucide-react';
import { getUserData } from '@/services/authService';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  watchlist: Array<{animeId: number, addedAt: Date}>;
  history: Array<{animeId: number, episodeId: number, progress: number, timestamp: Date}>;
  favorites: Array<{animeId: number, addedAt: Date}>;
}

interface AnimeCardProps {
  id: number;
  title: string;
  image: string;
  category: string;
  rating: string;
  year: string;
  episodes: number;
  progress?: number;
}

const Profile = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<AnimeCardProps[]>([]);
  const [history, setHistory] = useState<AnimeCardProps[]>([]);
  const [favorites, setFavorites] = useState<AnimeCardProps[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      navigate('/signin');
      return;
    }

    getUserData(userId)
      .then(userData => {
        setUser(userData);
        setEditedUsername(userData.username);
        
        setWatchlist(transformToAnimeCards(userData.watchlist.map(item => item.animeId)));
        
        const historyCards = transformToAnimeCards(userData.history.map(item => item.animeId));
        setHistory(historyCards.map((card, index) => ({
          ...card,
          progress: userData.history[index]?.progress || 0
        })));
        
        setFavorites(transformToAnimeCards(userData.favorites.map(item => item.animeId)));
        
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to fetch user data:", error);
        toast({
          title: "Error loading profile",
          description: "Please try again later",
          variant: "destructive",
        });
        navigate('/signin');
      });
  }, [navigate, toast]);

  const handleLogout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('user');
    toast({
      title: "Logged out",
      description: "You have been successfully logged out",
    });
    navigate('/');
  };

  const handleSaveProfile = () => {
    setIsLoading(true);
    
    setTimeout(() => {
      if (user) {
        const updatedUser = {
          ...user,
          username: editedUsername,
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
      
      setIsEditing(false);
      setIsLoading(false);
      
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated",
      });
    }, 1000);
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const transformToAnimeCards = (animeIds: number[]): AnimeCardProps[] => {
    const animeData: Record<number, Omit<AnimeCardProps, 'id'>> = {
      1: {
        title: "Attack on Titan",
        image: "/placeholder.svg",
        category: "Action, Drama",
        rating: "4.8",
        year: "2013",
        episodes: 75,
      },
      2: {
        title: "Demon Slayer",
        image: "/placeholder.svg",
        category: "Action, Supernatural",
        rating: "4.7",
        year: "2019",
        episodes: 44,
      },
      3: {
        title: "Jujutsu Kaisen",
        image: "/placeholder.svg",
        category: "Action, Supernatural",
        rating: "4.8",
        year: "2020",
        episodes: 24,
      },
      4: {
        title: "My Hero Academia",
        image: "/placeholder.svg",
        category: "Action, Superhero",
        rating: "4.6",
        year: "2016",
        episodes: 113,
      },
      5: {
        title: "One Piece",
        image: "/placeholder.svg",
        category: "Adventure, Fantasy",
        rating: "4.9",
        year: "1999",
        episodes: 1000,
      },
    };
    
    return animeIds.map(id => {
      const anime = animeData[id];
      if (anime) {
        return { id, ...anime };
      } else {
        return {
          id,
          title: `Anime ${id}`,
          image: "/placeholder.svg",
          category: "Unknown",
          rating: "N/A",
          year: "2023",
          episodes: 12,
        };
      }
    });
  };

  if (isLoading) {
    return <div className="min-h-screen bg-anime-darker flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <div className="min-h-screen bg-anime-darker flex items-center justify-center">User not found</div>;
  }

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <main className="container mx-auto px-4 py-8 md:py-16 mt-16">
        <div className="glass-card p-6 md:p-8 rounded-xl mb-10">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 md:w-32 md:h-32 bg-anime-gray/50 rounded-full flex items-center justify-center text-white text-5xl">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
              ) : (
                <UserIcon className="w-12 h-12" />
              )}
            </div>
            
            <div className="flex-1 text-center md:text-left">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="text-sm text-white/70 block mb-1">Username</label>
                    <Input
                      id="username"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      className="bg-anime-gray/50 border-white/10 text-white max-w-xs"
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button
                      onClick={handleSaveProfile}
                      className="bg-anime-purple hover:bg-anime-purple/90"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditedUsername(user.username);
                      }}
                      className="border-white/10 text-white hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <h1 className="text-2xl md:text-3xl font-bold text-white">{user.username}</h1>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="border-white/10 text-white hover:bg-white/10 self-center md:self-start"
                    >
                      <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                    </Button>
                  </div>
                  <p className="text-white/60 mt-1">{user.email}</p>
                </>
              )}
              
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/10"
                  onClick={handleSettingsClick}
                >
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 text-red-400 hover:bg-red-400/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <Tabs defaultValue="watchlist" className="w-full">
          <TabsList className="bg-anime-dark h-10 mb-8">
            <TabsTrigger value="watchlist" className="text-sm">Watchlist</TabsTrigger>
            <TabsTrigger value="history" className="text-sm">Watch History</TabsTrigger>
            <TabsTrigger value="favorites" className="text-sm">Favorites</TabsTrigger>
          </TabsList>
          
          <TabsContent value="watchlist" className="mt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
              {watchlist.map((anime) => (
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
          </TabsContent>
          
          <TabsContent value="history" className="mt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
              {history.map((anime) => (
                <AnimeCard 
                  key={anime.id}
                  id={anime.id}
                  title={anime.title}
                  image={anime.image}
                  category={anime.category}
                  rating={anime.rating}
                  year={anime.year}
                  episodes={anime.episodes}
                  progress={anime.progress}
                />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="favorites" className="mt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
              {favorites.map((anime) => (
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Profile;
