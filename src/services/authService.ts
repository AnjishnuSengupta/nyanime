import { 
  IUser, 
  findUserByEmail, 
  createUser as dbCreateUser, 
  comparePassword, 
  findUserById, 
  updateUser,
  setCurrentUser,
  getCurrentUser,
  clearCurrentUser
} from './dbService';

export interface UserData {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  createdAt: Date;
  watchlist: Array<{
    animeId: number;
    addedAt: Date;
  }>;
  history: Array<{
    animeId: number;
    episodeId: number;
    progress: number;
    timestamp: Date;
  }>;
  favorites: Array<{
    animeId: number;
    addedAt: Date;
  }>;
}

export const registerUser = async (username: string, email: string, password: string): Promise<UserData> => {
  try {
    const newUser = await dbCreateUser({
      username,
      email,
      password
    });
    
    const userData: Omit<IUser, 'password'> = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      createdAt: newUser.createdAt,
      watchlist: newUser.watchlist,
      history: newUser.history,
      favorites: newUser.favorites
    };

    setCurrentUser(userData);
    
    return userData;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    const user = findUserByEmail(email);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    const isMatch = await comparePassword(password, user.password);
    
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }
    
    const userData: Omit<IUser, 'password'> = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
      watchlist: user.watchlist,
      history: user.history,
      favorites: user.favorites
    };

    setCurrentUser(userData);
    
    return userData;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const logoutUser = () => {
  clearCurrentUser();
};

export const isLoggedIn = (): boolean => {
  return getCurrentUser() !== null;
};

export const getCurrentUserData = (): UserData | null => {
  return getCurrentUser();
};

export const addToWatchlist = async (userId: string, animeId: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const exists = user.watchlist.some(item => item.animeId === animeId);
    
    if (!exists) {
      const updatedWatchlist = [
        ...user.watchlist,
        { animeId, addedAt: new Date() }
      ];
      
      updateUser(userId, { watchlist: updatedWatchlist });
      return updatedWatchlist;
    }
    
    return user.watchlist;
  } catch (error) {
    console.error('Watchlist update error:', error);
    throw error;
  }
};

export const updateWatchHistory = async (userId: string, animeId: number, episodeId: number, progress: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    let updatedHistory = [...user.history];
    
    const existingIndex = updatedHistory.findIndex(
      item => item.animeId === animeId && item.episodeId === episodeId
    );
    
    if (existingIndex >= 0) {
      updatedHistory[existingIndex] = {
        ...updatedHistory[existingIndex],
        progress,
        timestamp: new Date()
      };
    } else {
      updatedHistory.push({
        animeId,
        episodeId,
        progress,
        timestamp: new Date()
      });
    }
    
    updatedHistory.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    if (updatedHistory.length > 20) {
      updatedHistory = updatedHistory.slice(0, 20);
    }
    
    updateUser(userId, { history: updatedHistory });
    return updatedHistory;
  } catch (error) {
    console.error('History update error:', error);
    throw error;
  }
};

export const toggleFavorite = async (userId: string, animeId: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    let updatedFavorites = [...user.favorites];
    
    const existingIndex = updatedFavorites.findIndex(item => item.animeId === animeId);
    
    if (existingIndex >= 0) {
      updatedFavorites.splice(existingIndex, 1);
    } else {
      updatedFavorites.push({ animeId, addedAt: new Date() });
    }
    
    updateUser(userId, { favorites: updatedFavorites });
    return updatedFavorites;
  } catch (error) {
    console.error('Favorites update error:', error);
    throw error;
  }
};

export const getUserData = async (userId: string): Promise<UserData> => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
      watchlist: user.watchlist,
      history: user.history,
      favorites: user.favorites
    };
  } catch (error) {
    console.error('Get user data error:', error);
    throw error;
  }
};

export const initializeAuthService = () => {
  console.log('Auth service initialized');
};
