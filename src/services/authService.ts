
import { 
  IUser, 
  findUserByEmail, 
  createUser as dbCreateUser, 
  comparePassword, 
  findUserById, 
  updateUser,
  setCurrentUser,
  getCurrentUser,
  clearCurrentUser,
  hashPassword
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
    timestamp: number; // Timestamp in seconds for video playback position
    lastWatched: Date; // Date when the episode was last watched
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
    
    const userData: UserData = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      createdAt: newUser.createdAt,
      watchlist: newUser.watchlist,
      history: newUser.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      })),
      favorites: newUser.favorites
    };

    // Convert to IUser format for storage
    const storageUser = {
      ...userData,
      history: userData.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      }))
    };
    
    setCurrentUser(storageUser);
    
    return userData;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    const user = await findUserByEmail(email);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    const isMatch = await comparePassword(password, user.password);
    
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }
    
    const userData: UserData = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
      watchlist: user.watchlist,
      history: user.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      })),
      favorites: user.favorites
    };

    // Convert to IUser format for storage
    const storageUser = {
      ...userData,
      history: userData.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      }))
    };
    
    setCurrentUser(storageUser);
    
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
  const user = getCurrentUser();
  if (!user) return null;
  
  return {
    ...user,
    history: user.history.map(item => ({
      animeId: item.animeId,
      episodeId: item.episodeId,
      progress: item.progress,
      timestamp: item.timestamp,
      lastWatched: item.lastWatched
    }))
  };
};

export const addToWatchlist = async (userId: string, animeId: number): Promise<Array<{animeId: number, addedAt: Date}>> => {
  try {
    const user = await findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const exists = user.watchlist.some(item => item.animeId === animeId);
    
    if (!exists) {
      const updatedWatchlist = [
        ...user.watchlist,
        { animeId, addedAt: new Date() }
      ];
      
      const updatedUser = await updateUser(userId, { watchlist: updatedWatchlist });
      return updatedUser?.watchlist || user.watchlist;
    }
    
    return user.watchlist;
  } catch (error) {
    console.error('Watchlist update error:', error);
    throw error;
  }
};

export const updateWatchHistory = async (
  userId: string, 
  animeId: number, 
  episodeId: number, 
  progress: number,
  timestamp: number = 0
): Promise<Array<{animeId: number, episodeId: number, progress: number, timestamp: number, lastWatched: Date}>> => {
  try {
    const user = await findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    let updatedHistory = [...user.history];
    
    const existingIndex = updatedHistory.findIndex(
      item => item.animeId === animeId && item.episodeId === episodeId
    );
    
    const now = new Date();
    
    if (existingIndex >= 0) {
      updatedHistory[existingIndex] = {
        ...updatedHistory[existingIndex],
        progress,
        timestamp,
        lastWatched: now
      };
    } else {
      updatedHistory.push({
        animeId,
        episodeId,
        progress,
        timestamp,
        lastWatched: now
      });
    }
    
    updatedHistory.sort((a, b) => {
      return b.lastWatched.getTime() - a.lastWatched.getTime();
    });
    
    if (updatedHistory.length > 20) {
      updatedHistory = updatedHistory.slice(0, 20);
    }
    
    const updatedUser = await updateUser(userId, { 
      history: updatedHistory.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId, 
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      }))
    });
    
    return updatedUser?.history.map(item => ({
      animeId: item.animeId,
      episodeId: item.episodeId,
      progress: item.progress,
      timestamp: item.timestamp,
      lastWatched: item.lastWatched
    })) || updatedHistory;
  } catch (error) {
    console.error('History update error:', error);
    throw error;
  }
};

export const removeFromWatchHistory = async (userId: string, animeId: number): Promise<Array<{animeId: number, episodeId: number, progress: number, timestamp: number, lastWatched: Date}>> => {
  try {
    const user = await findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const updatedHistory = user.history.filter(item => item.animeId !== animeId);
    
    const updatedUser = await updateUser(userId, { 
      history: updatedHistory.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      }))
    });
    
    return updatedUser?.history.map(item => ({
      animeId: item.animeId,
      episodeId: item.episodeId,
      progress: item.progress,
      timestamp: item.timestamp,
      lastWatched: item.lastWatched
    })) || updatedHistory;
  } catch (error) {
    console.error('History removal error:', error);
    throw error;
  }
};

export const toggleFavorite = async (userId: string, animeId: number): Promise<Array<{animeId: number, addedAt: Date}>> => {
  try {
    const user = await findUserById(userId);
    
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
    
    const updatedUser = await updateUser(userId, { favorites: updatedFavorites });
    return updatedUser?.favorites || user.favorites;
  } catch (error) {
    console.error('Favorites update error:', error);
    throw error;
  }
};

export const getUserData = async (userId: string): Promise<UserData> => {
  try {
    const user = await findUserById(userId);
    
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
      history: user.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      })),
      favorites: user.favorites
    };
  } catch (error) {
    console.error('Get user data error:', error);
    throw error;
  }
};

export const updateUserProfile = async (userId: string, updateData: { username?: string; avatar?: string }): Promise<UserData> => {
  try {
    const user = await findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const updatedUser = await updateUser(userId, updateData);
    
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }
    
    // Update current user in localStorage if it's the logged-in user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      setCurrentUser({
        ...currentUser,
        ...updateData
      });
    }
    
    const userData: UserData = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
      createdAt: updatedUser.createdAt,
      watchlist: updatedUser.watchlist,
      history: updatedUser.history.map(item => ({
        animeId: item.animeId,
        episodeId: item.episodeId,
        progress: item.progress,
        timestamp: item.timestamp,
        lastWatched: item.lastWatched
      })),
      favorites: updatedUser.favorites
    };
    
    return userData;
  } catch (error) {
    console.error('Profile update error:', error);
    throw error;
  }
};

export const updateUserPassword = async (userId: string, currentPassword: string, newPassword: string): Promise<boolean> => {
  try {
    const user = await findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }
    
    // Hash and update new password
    const hashedNewPassword = await hashPassword(newPassword);
    
    const updatedUser = await updateUser(userId, { password: hashedNewPassword });
    
    if (!updatedUser) {
      throw new Error('Failed to update password');
    }
    
    return true;
  } catch (error) {
    console.error('Password update error:', error);
    throw error;
  }
};

export const initializeAuthService = () => {
  console.log('Auth service initialized with PostgreSQL backend');
};
