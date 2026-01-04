import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '../components/Header';
import AnimeCard from '../components/AnimeCard';
import AvatarSelector from '../components/AvatarSelector';
import { UserIcon, Settings, LogOut, Edit2 } from 'lucide-react';
import { getUserData, updateUserProfile } from '@/services/firebaseAuthService';
import { fetchMultipleAnimeInfo } from '@/services/animeDataService';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  watchlist: Array<{animeId: number, addedAt: Date}>;
  history: Array<{animeId: number, episodeId: number, progress: number, timestamp: number, lastWatched: Date}>;
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
  const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      navigate('/signin');
      return;
    }

    loadUserProfile(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, toast]);

  const loadUserProfile = async (userId: string) => {
    try {
      const userData = await getUserData(userId);
      
      const profile: UserProfile = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        avatar: userData.avatar,
        watchlist: userData.watchlist,
        history: userData.history,
        favorites: userData.favorites
      };
      
      setUser(profile);
      setEditedUsername(userData.username);
      
      // Collect all unique anime IDs to fetch in parallel
      const allAnimeIds = new Set<number>();
      userData.watchlist.forEach(item => allAnimeIds.add(item.animeId));
      userData.history.forEach(item => allAnimeIds.add(item.animeId));
      userData.favorites.forEach(item => allAnimeIds.add(item.animeId));
      
      // Fetch all anime info in one batch
      const uniqueIds = Array.from(allAnimeIds);
      const allAnimeInfo = await fetchMultipleAnimeInfo(uniqueIds);
      
      // Create a map for quick lookup
      const animeMap = new Map<number, NonNullable<typeof allAnimeInfo[0]>>();
      allAnimeInfo.forEach(info => {
        if (info) {
          animeMap.set(info.malId, info);
        }
      });
      
      // Build watchlist cards from map
      if (userData.watchlist.length > 0) {
        const watchlistCards = userData.watchlist
          .map(item => animeMap.get(item.animeId))
          .filter((info): info is NonNullable<typeof info> => info !== undefined)
          .map(info => ({
            id: info.malId,
            title: info.title,
            image: info.image,
            category: info.genres?.join(', ') || 'Unknown',
            rating: 'N/A',
            year: info.releaseYear || 'Unknown',
            episodes: info.totalEpisodes || 0
          }));
        setWatchlist(watchlistCards);
      }
      
      // Build history cards from map
      if (userData.history.length > 0) {
        const historyCards = userData.history
          .map((historyItem, _index) => {
            const info = animeMap.get(historyItem.animeId);
            if (!info) return null;
            return {
              id: info.malId,
              title: info.title,
              image: info.image,
              category: info.genres?.join(', ') || 'Unknown',
              rating: 'N/A',
              year: info.releaseYear || 'Unknown',
              episodes: info.totalEpisodes || 0,
              progress: historyItem.progress || 0
            };
          })
          .filter((card): card is NonNullable<typeof card> => card !== null);
        setHistory(historyCards);
      }
      
      // Build favorites cards from map
      if (userData.favorites.length > 0) {
        const favoritesCards = userData.favorites
          .map(item => animeMap.get(item.animeId))
          .filter((info): info is NonNullable<typeof info> => info !== undefined)
          .map(info => ({
            id: info.malId,
            title: info.title,
            image: info.image,
            category: info.genres?.join(', ') || 'Unknown',
            rating: 'N/A',
            year: info.releaseYear || 'Unknown',
            episodes: info.totalEpisodes || 0
          }));
        setFavorites(favoritesCards);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      toast({
        title: "Error loading profile",
        description: "Please try again later",
        variant: "destructive",
      });
      navigate('/signin');
    }
  };

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
    if (!user) return;
    
    setIsLoading(true);
    
    updateUserProfile(user.id, {
      username: editedUsername,
      avatar: user.avatar
    })
      .then(() => {
        const updatedUser = {
          ...user,
          username: editedUsername,
        };
        setUser(updatedUser);
        setIsEditing(false);
        
        toast({
          title: "Profile updated",
          description: "Your profile has been successfully updated",
        });
      })
      .catch((error) => {
        console.error('Error updating profile:', error);
        toast({
          title: "Update failed",
          description: "Failed to update profile. Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleAvatarSelect = (avatarUrl: string) => {
    if (!user) return;
    
    updateUserProfile(user.id, {
      avatar: avatarUrl
    })
      .then(() => {
        const updatedUser = {
          ...user,
          avatar: avatarUrl,
        };
        setUser(updatedUser);
        
        toast({
          title: "Avatar updated",
          description: "Your profile avatar has been updated",
        });
      })
      .catch((error) => {
        console.error('Error updating avatar:', error);
        toast({
          title: "Update failed",
          description: "Failed to update avatar. Please try again.",
          variant: "destructive",
        });
      });
  };

  const handleSettingsClick = () => {
    navigate('/settings');
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
      
      <main className="container mx-auto px-4 py-6 sm:py-8 md:py-16 mt-16">
        <div className="glass-card p-4 sm:p-6 md:p-8 rounded-xl mb-6 sm:mb-8 md:mb-10">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 md:w-32 md:h-32 bg-anime-gray/50 rounded-full flex items-center justify-center text-white text-5xl overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-12 h-12" />
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="absolute bottom-0 right-0 rounded-full w-8 h-8 p-0 bg-anime-purple hover:bg-anime-purple/90 border-0"
                onClick={() => setIsAvatarSelectorOpen(true)}
              >
                <Edit2 className="w-4 h-4 text-white" />
              </Button>
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
      
      {/* Avatar Selector Modal */}
      <AvatarSelector
        isOpen={isAvatarSelectorOpen}
        onClose={() => setIsAvatarSelectorOpen(false)}
        onSelect={handleAvatarSelect}
        currentAvatar={user?.avatar}
      />
    </div>
  );
};

export default Profile;
