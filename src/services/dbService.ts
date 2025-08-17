// PostgreSQL database service with browser compatibility
import bcrypt from 'bcryptjs';

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
    timestamp: number; // Changed from Date to number for playback position in seconds
    lastWatched: Date; // Added for the time when the episode was last watched
  }>;
  favorites: Array<{
    animeId: number;
    addedAt: Date;
  }>;
}

// Local storage key for current user session
const CURRENT_USER_KEY = 'anime_streaming_current_user';
const USERS_STORAGE_KEY = 'anime_streaming_users';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Local storage based implementation for browser environments
class LocalStorageDB {
  private users: IUser[] = [];

  constructor() {
    this.loadUsers();
  }

  private loadUsers() {
    const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsers) {
      try {
        this.users = JSON.parse(storedUsers);
        // Convert date strings back to Date objects
        this.users = this.users.map(user => ({
          ...user,
          createdAt: new Date(user.createdAt),
          watchlist: user.watchlist.map(item => ({
            ...item,
            addedAt: new Date(item.addedAt)
          })),
          history: user.history.map(item => ({
            ...item,
            // Keep timestamp as number for playback position
            lastWatched: new Date(item.lastWatched)
          })),
          favorites: user.favorites.map(item => ({
            ...item,
            addedAt: new Date(item.addedAt)
          }))
        }));
      } catch (error) {
        console.error('Error parsing stored users:', error);
        this.users = [];
      }
    }
  }

  private saveUsers() {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users));
  }

  async findUserByEmail(email: string): Promise<IUser | null> {
    const user = this.users.find(u => u.email === email);
    return user || null;
  }

  async findUserById(id: string): Promise<IUser | null> {
    const user = this.users.find(u => u.id === id);
    return user || null;
  }

  async findUserByUsernameOrEmail(identifier: string): Promise<IUser | null> {
    const user = this.users.find(u => u.username === identifier || u.email === identifier);
    return user || null;
  }

  async createUser(userData: Omit<IUser, 'id' | 'createdAt' | 'watchlist' | 'history' | 'favorites'>): Promise<IUser> {
    // Check if user already exists
    const existingUser = await this.findUserByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);
    
    // Create new user
    const newUser: IUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      username: userData.username,
      email: userData.email,
      password: hashedPassword,
      avatar: userData.avatar,
      createdAt: new Date(),
      watchlist: [],
      history: [],
      favorites: []
    };
    
    this.users.push(newUser);
    this.saveUsers();
    
    // Return user without sensitive information
    return {
      ...newUser,
      password: '' // Don't return the actual password
    };
  }

  async updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return null;
    }
    
    const user = this.users[userIndex];
    
    // Update user fields
    const updatedUser = { ...user };
    
    if (updateData.username) updatedUser.username = updateData.username;
    if (updateData.email) updatedUser.email = updateData.email;
    if (updateData.avatar) updatedUser.avatar = updateData.avatar;
    if (updateData.password) updatedUser.password = updateData.password;
    
    if (updateData.watchlist) updatedUser.watchlist = updateData.watchlist;
    if (updateData.history) updatedUser.history = updateData.history;
    if (updateData.favorites) updatedUser.favorites = updateData.favorites;
    
    this.users[userIndex] = updatedUser;
    this.saveUsers();
    
    return {
      ...updatedUser,
      password: '' // Don't return the actual password
    };
  }
}

// Use either PostgreSQL or localStorage based on environment
let dbService: {
  findUserByEmail: (email: string) => Promise<IUser | null>;
  findUserById: (id: string) => Promise<IUser | null>;
  findUserByUsernameOrEmail: (identifier: string) => Promise<IUser | null>;
  createUser: (userData: Omit<IUser, 'id' | 'createdAt' | 'watchlist' | 'history' | 'favorites'>) => Promise<IUser>;
  updateUser: (userId: string, updateData: Partial<IUser>) => Promise<IUser | null>;
};

// Fallback to localStorage in browser environments
if (isBrowser) {
  console.log('Using localStorage for database simulation in browser environment');
  const localStorageDB = new LocalStorageDB();
  dbService = {
    findUserByEmail: (email) => localStorageDB.findUserByEmail(email),
    findUserById: (id) => localStorageDB.findUserById(id),
    findUserByUsernameOrEmail: (identifier) => localStorageDB.findUserByUsernameOrEmail(identifier),
    createUser: (userData) => localStorageDB.createUser(userData),
    updateUser: (userId, updateData) => localStorageDB.updateUser(userId, updateData)
  };
} else {
  // This code will only run in Node.js environments
  // In a real application, you would import and configure pg here
  console.log('Using PostgreSQL database in Node.js environment');
  // For type compatibility, we create a placeholder that will never be used in the browser
  dbService = {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    findUserByUsernameOrEmail: async () => null,
    createUser: async () => {
      throw new Error('PostgreSQL operations not available in browser');
    },
    updateUser: async () => null
  };
}

// Compare password - can be used in both environments
export const comparePassword = async (candidatePassword: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

// Hash password - can be used in both environments
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Session management functions - browser only
export const setCurrentUser = (user: Omit<IUser, 'password'>) => {
  if (isBrowser) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }
};

export const getCurrentUser = (): Omit<IUser, 'password'> | null => {
  if (!isBrowser) return null;
  
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  if (!userJson) return null;
  
  try {
    const user = JSON.parse(userJson);
    // Convert date strings back to Date objects
    return {
      ...user,
      createdAt: new Date(user.createdAt),
      watchlist: user.watchlist.map((item: {addedAt: string | Date}) => ({
        ...item,
        addedAt: new Date(item.addedAt)
      })),
      history: user.history.map((item: {lastWatched: string | Date}) => ({
        ...item,
        // Keep timestamp as number for playback position
        lastWatched: new Date(item.lastWatched)
      })),
      favorites: user.favorites.map((item: {addedAt: string | Date}) => ({
        ...item,
        addedAt: new Date(item.addedAt)
      }))
    };
  } catch (error) {
    console.error('Error parsing current user:', error);
    return null;
  }
};

export const clearCurrentUser = () => {
  if (isBrowser) {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
};

// Initialize database service
export const initializeDbService = async () => {
  console.log('Initializing database service');
  
  if (isBrowser) {
    // In browser, just ensure we have a demo user for testing
    const localStorageDB = new LocalStorageDB();
    const demoUser = await localStorageDB.findUserByEmail('demo@example.com');
    
    if (!demoUser) {
      try {
        await localStorageDB.createUser({
          username: 'demouser',
          email: 'demo@example.com',
          password: 'password123'
        });
        console.log('Demo user created');
      } catch (error) {
        console.log('Demo user may already exist:', error);
      }
    }
  }
};

// Export database service functions
export const { findUserByEmail, findUserById, findUserByUsernameOrEmail, createUser, updateUser } = dbService;
