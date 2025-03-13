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
    const user = await findUserByEmail(email);
    
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

export const updateWatchHistory = async (userId: string, animeId: number, episodeId: number, progress: number): Promise<Array<{animeId: number, episodeId: number, progress: number, timestamp: Date}>> => {
  try {
    const user = await findUserById(userId);
    
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
    
    const updatedUser = await updateUser(userId, { history: updatedHistory });
    return updatedUser?.history || user.history;
  } catch (error) {
    console.error('History update error:', error);
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
      history: user.history,
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
    
    return {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
      createdAt: updatedUser.createdAt,
      watchlist: updatedUser.watchlist,
      history: updatedUser.history,
      favorites: updatedUser.favorites
    };
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
