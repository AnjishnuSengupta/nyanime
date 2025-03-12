
// PostgreSQL database service for client-side
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

// User interface
export interface IUser {
  id: string;
  username: string;
  email: string;
  password: string;
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

// Local storage key for current user session
const CURRENT_USER_KEY = 'anime_streaming_current_user';

// Create PostgreSQL pool
const pool = new Pool({
  host: import.meta.env.VITE_POSTGRES_HOST,
  port: parseInt(import.meta.env.VITE_POSTGRES_PORT || '5432'),
  user: import.meta.env.VITE_POSTGRES_USER,
  password: import.meta.env.VITE_POSTGRES_PASSWORD,
  database: import.meta.env.VITE_POSTGRES_DB,
  ssl: process.env.NODE_ENV === 'production'
});

// Check database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

// Find user by email
export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    
    // Get watchlist
    const watchlistResult = await pool.query(
      'SELECT anime_id, added_at FROM watchlist WHERE user_id = $1',
      [user.id]
    );
    
    // Get history
    const historyResult = await pool.query(
      'SELECT anime_id, episode_id, progress, timestamp FROM history WHERE user_id = $1 ORDER BY timestamp DESC',
      [user.id]
    );
    
    // Get favorites
    const favoritesResult = await pool.query(
      'SELECT anime_id, added_at FROM favorites WHERE user_id = $1',
      [user.id]
    );

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      avatar: user.avatar,
      createdAt: new Date(user.created_at),
      watchlist: watchlistResult.rows.map(row => ({
        animeId: row.anime_id,
        addedAt: new Date(row.added_at)
      })),
      history: historyResult.rows.map(row => ({
        animeId: row.anime_id,
        episodeId: row.episode_id,
        progress: row.progress,
        timestamp: new Date(row.timestamp)
      })),
      favorites: favoritesResult.rows.map(row => ({
        animeId: row.anime_id,
        addedAt: new Date(row.added_at)
      }))
    };
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
};

// Find user by ID
export const findUserById = async (id: string): Promise<IUser | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    
    // Get watchlist
    const watchlistResult = await pool.query(
      'SELECT anime_id, added_at FROM watchlist WHERE user_id = $1',
      [user.id]
    );
    
    // Get history
    const historyResult = await pool.query(
      'SELECT anime_id, episode_id, progress, timestamp FROM history WHERE user_id = $1 ORDER BY timestamp DESC',
      [user.id]
    );
    
    // Get favorites
    const favoritesResult = await pool.query(
      'SELECT anime_id, added_at FROM favorites WHERE user_id = $1',
      [user.id]
    );

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      avatar: user.avatar,
      createdAt: new Date(user.created_at),
      watchlist: watchlistResult.rows.map(row => ({
        animeId: row.anime_id,
        addedAt: new Date(row.added_at)
      })),
      history: historyResult.rows.map(row => ({
        animeId: row.anime_id,
        episodeId: row.episode_id,
        progress: row.progress,
        timestamp: new Date(row.timestamp)
      })),
      favorites: favoritesResult.rows.map(row => ({
        animeId: row.anime_id,
        addedAt: new Date(row.added_at)
      }))
    };
  } catch (error) {
    console.error('Error finding user by ID:', error);
    return null;
  }
};

// Find user by username or email
export const findUserByUsernameOrEmail = async (identifier: string): Promise<IUser | null> => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    
    // Get watchlist, history and favorites
    // (Reusing the same code from findUserById)
    return await findUserById(user.id);
  } catch (error) {
    console.error('Error finding user by username or email:', error);
    return null;
  }
};

// Create a new user
export const createUser = async (userData: Omit<IUser, 'id' | 'createdAt' | 'watchlist' | 'history' | 'favorites'>): Promise<IUser> => {
  try {
    // Check if user already exists
    const existingUser = await findUserByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);
    
    // Insert new user
    const result = await pool.query(
      'INSERT INTO users (username, email, password, avatar) VALUES ($1, $2, $3, $4) RETURNING *',
      [userData.username, userData.email, hashedPassword, userData.avatar || null]
    );
    
    const newUser = result.rows[0];
    
    // Return user without sensitive information
    return {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      password: '', // Don't return the actual password
      avatar: newUser.avatar,
      createdAt: new Date(newUser.created_at),
      watchlist: [],
      history: [],
      favorites: []
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

// Compare password
export const comparePassword = async (candidatePassword: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

// Update user
export const updateUser = async (userId: string, updateData: Partial<IUser>): Promise<IUser | null> => {
  try {
    const user = await findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Handle watchlist updates
    if (updateData.watchlist) {
      // Clear current watchlist
      await pool.query('DELETE FROM watchlist WHERE user_id = $1', [userId]);
      
      // Insert new watchlist items
      for (const item of updateData.watchlist) {
        await pool.query(
          'INSERT INTO watchlist (user_id, anime_id, added_at) VALUES ($1, $2, $3)',
          [userId, item.animeId, item.addedAt]
        );
      }
    }
    
    // Handle history updates
    if (updateData.history) {
      // Clear current history
      await pool.query('DELETE FROM history WHERE user_id = $1', [userId]);
      
      // Insert new history items
      for (const item of updateData.history) {
        await pool.query(
          'INSERT INTO history (user_id, anime_id, episode_id, progress, timestamp) VALUES ($1, $2, $3, $4, $5)',
          [userId, item.animeId, item.episodeId, item.progress, item.timestamp]
        );
      }
    }
    
    // Handle favorites updates
    if (updateData.favorites) {
      // Clear current favorites
      await pool.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
      
      // Insert new favorites items
      for (const item of updateData.favorites) {
        await pool.query(
          'INSERT INTO favorites (user_id, anime_id, added_at) VALUES ($1, $2, $3)',
          [userId, item.animeId, item.addedAt]
        );
      }
    }
    
    // Update user fields if needed
    if (updateData.username || updateData.email || updateData.avatar) {
      const updateFields = [];
      const values = [];
      let valueIndex = 1;
      
      if (updateData.username) {
        updateFields.push(`username = $${valueIndex}`);
        values.push(updateData.username);
        valueIndex++;
      }
      
      if (updateData.email) {
        updateFields.push(`email = $${valueIndex}`);
        values.push(updateData.email);
        valueIndex++;
      }
      
      if (updateData.avatar) {
        updateFields.push(`avatar = $${valueIndex}`);
        values.push(updateData.avatar);
        valueIndex++;
      }
      
      if (updateFields.length > 0) {
        values.push(userId);
        await pool.query(
          `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${valueIndex}`,
          values
        );
      }
    }
    
    // Return updated user
    return await findUserById(userId);
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
};

// Set current user in session
export const setCurrentUser = (user: Omit<IUser, 'password'>) => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

// Get current user from session
export const getCurrentUser = (): Omit<IUser, 'password'> | null => {
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};

// Clear current user session
export const clearCurrentUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// Initialize database service
export const initializeDbService = async () => {
  console.log('Initializing PostgreSQL database service');
  
  try {
    // Check if tables exist, if not, create them
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
    
    const tablesExist = tableCheck.rows[0].exists;
    
    if (!tablesExist) {
      console.log('Creating database tables...');
      
      // Create users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          email VARCHAR(100) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          avatar VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create watchlist table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS watchlist (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          anime_id INTEGER NOT NULL,
          added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, anime_id)
        )
      `);
      
      // Create history table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          anime_id INTEGER NOT NULL,
          episode_id INTEGER NOT NULL,
          progress FLOAT DEFAULT 0,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, anime_id, episode_id)
        )
      `);
      
      // Create favorites table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS favorites (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          anime_id INTEGER NOT NULL,
          added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, anime_id)
        )
      `);
      
      console.log('Database tables created successfully');
      
      // Create a demo user
      try {
        await createUser({
          username: 'demouser',
          email: 'demo@example.com',
          password: 'password123'
        });
        console.log('Demo user created');
      } catch (error) {
        console.log('Demo user may already exist:', error);
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    console.warn('Falling back to localStorage simulation');
  }
};
