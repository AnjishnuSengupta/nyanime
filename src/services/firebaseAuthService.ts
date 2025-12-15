import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { auth, googleProvider, db } from '@/config/firebase';

interface WatchlistItem {
  animeId: number;
  addedAt: Date | Timestamp;
}

interface HistoryItem {
  animeId: number;
  episodeId: number;
  progress: number;
  timestamp: number;
  lastWatched: Date | Timestamp;
}

interface FavoriteItem {
  animeId: number;
  addedAt: Date | Timestamp;
}

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
    timestamp: number;
    lastWatched: Date;
  }>;
  favorites: Array<{
    animeId: number;
    addedAt: Date;
  }>;
}

/**
 * Create or update user document in Firestore
 */
const createUserDocument = async (firebaseUser: FirebaseUser, additionalData?: { username?: string; avatar?: string }): Promise<UserData> => {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // Create new user document
    const userData: UserData = {
      id: firebaseUser.uid,
      username: additionalData?.username || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      email: firebaseUser.email || '',
      avatar: additionalData?.avatar || firebaseUser.photoURL || '',
      createdAt: new Date(),
      watchlist: [],
      history: [],
      favorites: []
    };

    // Build Firestore document, excluding undefined/empty values for optional fields
    const firestoreData: Record<string, unknown> = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      createdAt: serverTimestamp(),
      watchlist: userData.watchlist,
      history: userData.history,
      favorites: userData.favorites
    };

    // Only add avatar if it has a value
    if (userData.avatar) {
      firestoreData.avatar = userData.avatar;
    }

    await setDoc(userRef, firestoreData);

    return userData;
  } else {
    // User exists, return existing data
    const data = userSnap.data();
    return {
      id: firebaseUser.uid,
      username: data.username,
      email: data.email,
      avatar: data.avatar,
      createdAt: data.createdAt?.toDate() || new Date(),
      watchlist: data.watchlist || [],
      history: data.history?.map((item: HistoryItem) => ({
        ...item,
        lastWatched: item.lastWatched instanceof Timestamp ? item.lastWatched.toDate() : item.lastWatched
      })) || [],
      favorites: data.favorites || []
    };
  }
};

/**
 * Get user data from Firestore
 */
export const getUserData = async (userId: string): Promise<UserData | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data();
    return {
      id: userId,
      username: data.username,
      email: data.email,
      avatar: data.avatar,
      createdAt: data.createdAt?.toDate() || new Date(),
      watchlist: data.watchlist || [],
      history: data.history?.map((item: HistoryItem) => ({
        ...item,
        lastWatched: item.lastWatched instanceof Timestamp ? item.lastWatched.toDate() : item.lastWatched
      })) || [],
      favorites: data.favorites || []
    };
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

/**
 * Helper function to notify components about auth state changes
 */
const notifyAuthStateChanged = () => {
  window.dispatchEvent(new Event('authStateChanged'));
};

/**
 * Register user with email and password
 */
export const registerUser = async (username: string, email: string, password: string, avatar?: string): Promise<UserData> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Update display name and photo URL if avatar provided
    await updateProfile(firebaseUser, {
      displayName: username,
      ...(avatar && { photoURL: avatar })
    });

    // Create user document in Firestore with avatar
    const userData = await createUserDocument(firebaseUser, { username, avatar });

    // Store in localStorage for persistence
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Notify components about auth state change
    notifyAuthStateChanged();

    return userData;
  } catch (error) {
    console.error('Registration error:', error);
    
    // Provide user-friendly error messages
    const firebaseError = error as { code?: string; message?: string };
    if (firebaseError.code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered');
    } else if (firebaseError.code === 'auth/weak-password') {
      throw new Error('Password should be at least 6 characters');
    } else if (firebaseError.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    }
    
    throw new Error(firebaseError.message || 'Registration failed');
  }
};

/**
 * Login user with email and password
 */
export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Get or create user document
    const userData = await createUserDocument(firebaseUser);

    // Store in localStorage
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Notify components about auth state change
    notifyAuthStateChanged();

    return userData;
  } catch (error) {
    console.error('Login error:', error);
    
    const firebaseError = error as { code?: string; message?: string };
    if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password');
    } else if (firebaseError.code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please try again later');
    }
    
    throw new Error(firebaseError.message || 'Login failed');
  }
};

/**
 * Sign in with Google (One Tap)
 */
export const signInWithGoogle = async (): Promise<UserData> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    // Get or create user document
    const userData = await createUserDocument(firebaseUser);

    // Store in localStorage
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Notify components about auth state change
    notifyAuthStateChanged();

    return userData;
  } catch (error) {
    console.error('Google sign-in error:', error);
    
    const firebaseError = error as { code?: string; message?: string };
    if (firebaseError.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in cancelled');
    } else if (firebaseError.code === 'auth/popup-blocked') {
      throw new Error('Popup blocked. Please allow popups for this site');
    }
    
    throw new Error(firebaseError.message || 'Google sign-in failed');
  }
};

/**
 * Logout user
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    localStorage.removeItem('userId');
    localStorage.removeItem('user');
    
    // Notify components about auth state change
    notifyAuthStateChanged();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

/**
 * Update user watchlist
 */
export const updateWatchlist = async (userId: string, animeId: number, action: 'add' | 'remove'): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const currentWatchlist = userSnap.data().watchlist || [];

    let updatedWatchlist;
    if (action === 'add') {
      // Add to watchlist if not already present
      if (!currentWatchlist.find((item: WatchlistItem) => item.animeId === animeId)) {
        updatedWatchlist = [...currentWatchlist, { animeId, addedAt: new Date() }];
      } else {
        return; // Already in watchlist
      }
    } else {
      // Remove from watchlist
      updatedWatchlist = currentWatchlist.filter((item: WatchlistItem) => item.animeId !== animeId);
    }

    await updateDoc(userRef, { watchlist: updatedWatchlist });

    // Update localStorage
    const userData = await getUserData(userId);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error updating watchlist:', error);
    throw error;
  }
};

/**
 * Update watch history
 */
export const updateHistory = async (
  userId: string,
  animeId: number,
  episodeId: number,
  progress: number,
  timestamp: number
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const currentHistory = userSnap.data().history || [];
    
    // Find existing entry for this episode
    const existingIndex = currentHistory.findIndex(
      (item: HistoryItem) => item.animeId === animeId && item.episodeId === episodeId
    );

    let updatedHistory;
    if (existingIndex >= 0) {
      // Update existing entry
      updatedHistory = [...currentHistory];
      updatedHistory[existingIndex] = {
        animeId,
        episodeId,
        progress,
        timestamp,
        lastWatched: new Date()
      };
    } else {
      // Add new entry
      updatedHistory = [
        ...currentHistory,
        {
          animeId,
          episodeId,
          progress,
          timestamp,
          lastWatched: new Date()
        }
      ];
    }

    await updateDoc(userRef, { history: updatedHistory });

    // Update localStorage
    const userData = await getUserData(userId);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error updating history:', error);
    throw error;
  }
};

/**
 * Remove item from watch history
 */
export const removeFromHistory = async (userId: string, animeId: number): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const currentHistory = userSnap.data().history || [];
    const updatedHistory = currentHistory.filter((item: HistoryItem) => item.animeId !== animeId);

    await updateDoc(userRef, { history: updatedHistory });

    // Update localStorage
    const userData = await getUserData(userId);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error removing from history:', error);
    throw error;
  }
};

/**
 * Update favorites
 */
export const updateFavorites = async (userId: string, animeId: number, action: 'add' | 'remove'): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const currentFavorites = userSnap.data().favorites || [];

    let updatedFavorites;
    if (action === 'add') {
      if (!currentFavorites.find((item: FavoriteItem) => item.animeId === animeId)) {
        updatedFavorites = [...currentFavorites, { animeId, addedAt: new Date() }];
      } else {
        return;
      }
    } else {
      updatedFavorites = currentFavorites.filter((item: FavoriteItem) => item.animeId !== animeId);
    }

    await updateDoc(userRef, { favorites: updatedFavorites });

    // Update localStorage
    const userData = await getUserData(userId);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error updating favorites:', error);
    throw error;
  }
};

/**
 * Auth state observer
 */
export const onAuthStateChange = (callback: (user: UserData | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const userData = await getUserData(firebaseUser.uid);
      callback(userData);
    } else {
      callback(null);
    }
  });
};

/**
 * Get current user
 */
export const getCurrentUser = (): UserData | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Update user profile (username, avatar)
 */
export const updateUserProfile = async (
  userId: string,
  updates: { username?: string; avatar?: string }
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    // Update Firestore
    await updateDoc(userRef, updates);

    // Update localStorage
    const currentUser = getCurrentUser();
    if (currentUser) {
      const updatedUser = { ...currentUser, ...updates };
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Update user password
 */
export const updateUserPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No user logged in');
    }

    // Re-authenticate user with current password
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);
  } catch (error) {
    console.error('Error updating password:', error);
    if (error instanceof Error) {
      if (error.message.includes('auth/wrong-password') || error.message.includes('auth/invalid-credential')) {
        throw new Error('Current password is incorrect');
      }
    }
    throw error;
  }
};
