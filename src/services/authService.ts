
import { User, connectDB } from './dbService';
import mongoose from 'mongoose';

// Make sure MongoDB is connected
connectDB();

export interface UserData {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

// Register a new user
export const registerUser = async (username: string, email: string, password: string): Promise<UserData> => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // Create new user
    const user = new User({
      username,
      email,
      password,
    });
    
    await user.save();
    
    // Return user data without password
    return {
      id: user._id,
      username: user.username,
      email: user.email,
    };
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

// Login user
export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }
    
    // Return user data without password
    return {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// Update user watchlist
export const addToWatchlist = async (userId: string, animeId: number) => {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if anime already exists in watchlist
    const exists = user.watchlist.some(item => item.animeId === animeId);
    
    if (!exists) {
      user.watchlist.push({ animeId });
      await user.save();
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
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if the episode exists in history
    const existingIndex = user.history.findIndex(
      item => item.animeId === animeId && item.episodeId === episodeId
    );
    
    if (existingIndex >= 0) {
      // Update existing entry
      user.history[existingIndex].progress = progress;
      user.history[existingIndex].timestamp = new Date();
    } else {
      // Add new entry
      user.history.push({
        animeId,
        episodeId,
        progress,
      });
    }
    
    // Sort by most recent
    user.history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Limit history to 20 entries
    if (user.history.length > 20) {
      user.history = user.history.slice(0, 20);
    }
    
    await user.save();
    return user.history;
  } catch (error) {
    console.error('History update error:', error);
    throw error;
  }
};

// Update favorites
export const toggleFavorite = async (userId: string, animeId: number) => {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if anime already exists in favorites
    const existingIndex = user.favorites.findIndex(item => item.animeId === animeId);
    
    if (existingIndex >= 0) {
      // Remove from favorites
      user.favorites.splice(existingIndex, 1);
    } else {
      // Add to favorites
      user.favorites.push({ animeId });
    }
    
    await user.save();
    return user.favorites;
  } catch (error) {
    console.error('Favorites update error:', error);
    throw error;
  }
};

// Get user data
export const getUserData = async (userId: string): Promise<UserData> => {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };
  } catch (error) {
    console.error('Get user data error:', error);
    throw error;
  }
};
