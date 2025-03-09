
// Mock database service for client-side
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
    timestamp: Date;
  }>;
  favorites: Array<{
    animeId: number;
    addedAt: Date;
  }>;
}

// Local storage keys
const USER_STORAGE_KEY = 'anime_streaming_users';
const CURRENT_USER_KEY = 'anime_streaming_current_user';

// Helper to get users from local storage
const getUsers = (): IUser[] => {
  const usersJson = localStorage.getItem(USER_STORAGE_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
};

// Helper to save users to local storage
const saveUsers = (users: IUser[]) => {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
};

// Find user by email
export const findUserByEmail = (email: string): IUser | null => {
  const users = getUsers();
  const user = users.find(u => u.email === email);
  return user || null;
};

// Find user by ID
export const findUserById = (id: string): IUser | null => {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  return user || null;
};

// Find user by username or email
export const findUserByUsernameOrEmail = (identifier: string): IUser | null => {
  const users = getUsers();
  const user = users.find(u => u.email === identifier || u.username === identifier);
  return user || null;
};

// Create a new user
export const createUser = async (userData: Omit<IUser, 'id' | 'createdAt' | 'watchlist' | 'history' | 'favorites'>): Promise<IUser> => {
  const users = getUsers();
  
  // Check if user already exists
  if (users.some(u => u.email === userData.email || u.username === userData.username)) {
    throw new Error('User already exists');
  }
  
  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userData.password, salt);
  
  // Create new user
  const newUser: IUser = {
    id: Date.now().toString(),
    ...userData,
    password: hashedPassword,
    createdAt: new Date(),
    watchlist: [],
    history: [],
    favorites: []
  };
  
  // Save to storage
  users.push(newUser);
  saveUsers(users);
  
  // Return user without password
  const { password, ...userWithoutPassword } = newUser;
  return { ...userWithoutPassword, password: '' } as IUser;
};

// Compare password
export const comparePassword = async (candidatePassword: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

// Update user
export const updateUser = (userId: string, updateData: Partial<IUser>): IUser | null => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return null;
  }
  
  // Update user data
  users[userIndex] = { ...users[userIndex], ...updateData };
  saveUsers(users);
  
  return users[userIndex];
};

// Set current user
export const setCurrentUser = (user: Omit<IUser, 'password'>) => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

// Get current user
export const getCurrentUser = (): Omit<IUser, 'password'> | null => {
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};

// Clear current user
export const clearCurrentUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// Initialize with some demo data if needed
export const initializeDbService = () => {
  // Only initialize if no users exist yet
  if (getUsers().length === 0) {
    console.log('Initializing mock database...');
    // You could add demo users here if needed
  }
};
