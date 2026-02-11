/**
 * API Configuration Manager
 * Centralized configuration for all API endpoints with fallback support
 * 
 * Aniwatch: Now uses the `aniwatch` npm package directly on server-side routes.
 * No external hosted API dependency. The old hosted API is used automatically
 * as a fallback by server-side routes if scraping fails.
 */

export interface APIConfig {
  /** Old hosted aniwatch API - used as fallback only */
  aniwatchFallback: string;
  consumet: string;
  jikan: string;
  corsProxy: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  recaptcha: {
    siteKey: string;
  };
}

/**
 * Get API configuration from environment variables with fallbacks
 */
export const getAPIConfig = (): APIConfig => {
  const config: APIConfig = {
    aniwatchFallback: import.meta.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com',
    consumet: import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org',
    jikan: import.meta.env.VITE_JIKAN_API_URL || 'https://api.jikan.moe/v4',
    corsProxy: import.meta.env.VITE_CORS_PROXY_URL || 'https://api.allorigins.win/raw?url=',
    firebase: {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    },
    recaptcha: {
      siteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY || '',
    },
  };

  return config;
};

/**
 * Log API configuration status (only runs in development mode)
 */
export const logAPIStatus = () => {
  // Only log in development mode
  if (import.meta.env.PROD) return;
  
  const config = getAPIConfig();
  
  console.group('API Configuration Status');
  console.log('Aniwatch: Using local /aniwatch route (npm package scraper)');
  console.log('Aniwatch Fallback:', config.aniwatchFallback);
  console.log('Consumet API:', config.consumet);
  console.log('Jikan API:', config.jikan);
  console.log('Firebase Configured:', !!config.firebase.apiKey);
  console.groupEnd();
};

/**
 * Test if an API endpoint is accessible
 */
export const testAPIEndpoint = async (url: string, timeout = 3000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error(`❌ API endpoint test failed for ${url}:`, error);
    return false;
  }
};

/**
 * Get the best available API URL from a list of options
 */
export const getBestAPIUrl = async (urls: string[]): Promise<string> => {
  for (const url of urls) {
    const isAvailable = await testAPIEndpoint(url);
    if (isAvailable) {
      return url;
    }
  }
  
  // Fallback to first URL if all fail
  return urls[0];
};

/**
 * Fallback API endpoints for different services
 */
export const API_FALLBACKS = {
  /** @deprecated Aniwatch now uses local /aniwatch route (npm package). These are server-side fallbacks only. */
  aniwatch: [
    'https://nyanime-backend-v2.onrender.com',
  ],
  consumet: [
    'https://api.consumet.org',
  ],
  jikan: [
    'https://api.jikan.moe/v4',
  ],
  corsProxy: [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/',
  ],
};

// Log configuration on import (development only)
if (import.meta.env.DEV) {
  logAPIStatus();
}

export default getAPIConfig;
