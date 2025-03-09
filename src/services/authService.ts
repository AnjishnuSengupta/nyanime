
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
}

// Register a new user
export const registerUser = async (username: string, email: string, password: string): Promise<UserData> => {
  try {
    // Create new user
    const newUser = await dbCreateUser({
      username,
      email,
      password
    });
    
    // Return user data without password
    const userData: UserData = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
    };

    // Set as current user
    setCurrentUser(userData);
    
    return userData;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

// Login user
export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    // Find user by email
    const user = findUserByEmail(email);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Check password
    const isMatch = await comparePassword(password, user.password);
    
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }
    
    // Return user data without password
    const userData: UserData = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };

    // Set as current user
    setCurrentUser(userData);
    
    return userData;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// Logout user
export const logoutUser = () => {
  clearCurrentUser();
};

// Check if user is logged in
export const isLoggedIn = (): boolean => {
  return getCurrentUser() !== null;
};

// Get current user data
export const getCurrentUserData = (): UserData | null => {
  return getCurrentUser();
};

// Update user watchlist
export const addToWatchlist = async (userId: string, animeId: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if anime already exists in watchlist
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

// Update watch history
export const updateWatchHistory = async (userId: string, animeId: number, episodeId: number, progress: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    let updatedHistory = [...user.history];
    
    // Check if the episode exists in history
    const existingIndex = updatedHistory.findIndex(
      item => item.animeId === animeId && item.episodeId === episodeId
    );
    
    if (existingIndex >= 0) {
      // Update existing entry
      updatedHistory[existingIndex] = {
        ...updatedHistory[existingIndex],
        progress,
        timestamp: new Date()
      };
    } else {
      // Add new entry
      updatedHistory.push({
        animeId,
        episodeId,
        progress,
        timestamp: new Date()
      });
    }
    
    // Sort by most recent
    updatedHistory.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Limit history to 20 entries
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

// Update favorites
export const toggleFavorite = async (userId: string, animeId: number) => {
  try {
    const user = findUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    let updatedFavorites = [...user.favorites];
    
    // Check if anime already exists in favorites
    const existingIndex = updatedFavorites.findIndex(item => item.animeId === animeId);
    
    if (existingIndex >= 0) {
      // Remove from favorites
      updatedFavorites.splice(existingIndex, 1);
    } else {
      // Add to favorites
      updatedFavorites.push({ animeId, addedAt: new Date() });
    }
    
    updateUser(userId, { favorites: updatedFavorites });
    return updatedFavorites;
  } catch (error) {
    console.error('Favorites update error:', error);
    throw error;
  }
};

// Get user data
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
    };
  } catch (error) {
    console.error('Get user data error:', error);
    throw error;
  }
};

// Initialize the auth service
export const initializeAuthService = () => {
  // Call any initialization needed
  console.log('Auth service initialized');
};
