
// PostgreSQL database service for client-side
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

// Local storage key for current user session
const CURRENT_USER_KEY = 'anime_streaming_current_user';

// API base URL - would be an environment variable in production
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://anime-streaming-api.example.com';

// Helper to handle API responses
const handleApiResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

// For development/demo purposes - simulate API with localStorage
// In production, these functions would make actual API calls to PostgreSQL
const simulateApiCall = <T>(endpoint: string, method: string, data?: any): Promise<T> => {
  console.log(`Simulating API call: ${method} ${endpoint}`, data);
  
  // Create a unique localStorage key based on the endpoint
  const storageKey = `pg_${endpoint.replace(/\//g, '_')}`;
  
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        switch (method) {
          case 'GET': {
            const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (data && data.id) {
              // If ID is provided, return specific item
              const item = items.find((i: any) => i.id === data.id);
              if (!item) {
                return reject(new Error('Item not found'));
              }
              resolve(item as T);
            } else if (data && data.email) {
              // If email is provided, return by email
              const item = items.find((i: any) => i.email === data.email);
              if (!item) {
                return reject(new Error('User not found'));
              }
              resolve(item as T);
            } else {
              // Return all items
              resolve(items as T);
            }
            break;
          }
          case 'POST': {
            const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const newItem = { ...data, id: data.id || Date.now().toString() };
            items.push(newItem);
            localStorage.setItem(storageKey, JSON.stringify(items));
            resolve(newItem as T);
            break;
          }
          case 'PUT': {
            const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const index = items.findIndex((i: any) => i.id === data.id);
            if (index === -1) {
              return reject(new Error('Item not found'));
            }
            items[index] = { ...items[index], ...data };
            localStorage.setItem(storageKey, JSON.stringify(items));
            resolve(items[index] as T);
            break;
          }
          case 'DELETE': {
            const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const newItems = items.filter((i: any) => i.id !== data.id);
            localStorage.setItem(storageKey, JSON.stringify(newItems));
            resolve({ success: true } as unknown as T);
            break;
          }
          default:
            reject(new Error(`Unsupported method: ${method}`));
        }
      } catch (error) {
        reject(error);
      }
    }, 300); // Simulate network delay
  });
};

// Find user by email
export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  try {
    // In production: const user = await fetch(`${API_BASE_URL}/users?email=${email}`).then(handleApiResponse);
    const user = await simulateApiCall<IUser | null>('users', 'GET', { email });
    return user;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
};

// Find user by ID
export const findUserById = async (id: string): Promise<IUser | null> => {
  try {
    // In production: const user = await fetch(`${API_BASE_URL}/users/${id}`).then(handleApiResponse);
    const user = await simulateApiCall<IUser | null>('users', 'GET', { id });
    return user;
  } catch (error) {
    console.error('Error finding user by ID:', error);
    return null;
  }
};

// Find user by username or email
export const findUserByUsernameOrEmail = async (identifier: string): Promise<IUser | null> => {
  try {
    // In production: const users = await fetch(`${API_BASE_URL}/users?username=${identifier}&email=${identifier}`).then(handleApiResponse);
    const users = await simulateApiCall<IUser[]>('users', 'GET');
    return users.find(u => u.email === identifier || u.username === identifier) || null;
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
    
    // Create new user object
    const newUser: Omit<IUser, 'id'> = {
      ...userData,
      password: hashedPassword,
      createdAt: new Date(),
      watchlist: [],
      history: [],
      favorites: []
    };
    
    // In production: const createdUser = await fetch(`${API_BASE_URL}/users`, { method: 'POST', body: JSON.stringify(newUser) }).then(handleApiResponse);
    const createdUser = await simulateApiCall<IUser>('users', 'POST', newUser);
    
    // Return user without password
    const { password, ...userWithoutPassword } = createdUser;
    return { ...userWithoutPassword, password: '' } as IUser;
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
    // In production: const updated = await fetch(`${API_BASE_URL}/users/${userId}`, { method: 'PUT', body: JSON.stringify(updateData) }).then(handleApiResponse);
    const updated = await simulateApiCall<IUser>('users', 'PUT', { id: userId, ...updateData });
    return updated;
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
export const initializeDbService = () => {
  console.log('Initializing PostgreSQL database service (simulated)');
  
  // Create some initial data if needed for demo purposes
  const usersData = localStorage.getItem('pg_users');
  if (!usersData || JSON.parse(usersData).length === 0) {
    // Create a demo user
    createUser({
      username: 'demouser',
      email: 'demo@example.com',
      password: 'password123'
    }).catch(console.error);
  }
};
