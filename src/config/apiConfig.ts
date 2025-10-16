/**
 * API Configuration Manager
 * Centralized configuration for all API endpoints with fallback support
 */

export interface APIConfig {
  consumet: string;
  aniwatch: string;
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
    consumet: import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org',
    aniwatch: import.meta.env.VITE_ANIWATCH_API_URL || 'http://localhost:4000',
    jikan: import.meta.env.VITE_JIKAN_API_KEY || 'https://api.jikan.moe/v4',
    corsProxy: import.meta.env.VITE_CORS_PROXY_URL || 'https://corsproxy.io/?',
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
 * Log API configuration status (useful for debugging)
 */
export const logAPIStatus = () => {
  const config = getAPIConfig();
  
  console.group('🔧 API Configuration Status');
  console.log('📡 Consumet API:', config.consumet);
  console.log('🎬 Aniwatch API:', config.aniwatch);
  console.log('📊 Jikan API:', config.jikan);
  console.log('🌐 CORS Proxy:', config.corsProxy);
  console.log('🔥 Firebase Configured:', !!config.firebase.apiKey);
  console.log('🔒 reCAPTCHA Configured:', !!config.recaptcha.siteKey);
  console.groupEnd();
  
  // Warn about missing critical configs
  if (!config.firebase.apiKey) {
    console.warn('⚠️ Firebase API Key is not configured!');
  }
  if (!config.recaptcha.siteKey) {
    console.warn('⚠️ reCAPTCHA Site Key is not configured!');
  }
};

/**
 * Test if an API endpoint is accessible
 */
export const testAPIEndpoint = async (url: string, timeout = 5000): Promise<boolean> => {
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
  console.log('🔍 Testing API endpoints...', urls);
  
  for (const url of urls) {
    const isAvailable = await testAPIEndpoint(url);
    if (isAvailable) {
      console.log(`✅ Using API: ${url}`);
      return url;
    }
    console.log(`❌ API unavailable: ${url}`);
  }
  
  console.warn('⚠️ All API endpoints failed, using first as fallback');
  return urls[0];
};

/**
 * Fallback API endpoints for different services
 */
export const API_FALLBACKS = {
  consumet: [
    'https://api.consumet.org',
    'https://consumet-api.herokuapp.com',
    'https://api-consumet.azurewebsites.net',
  ],
  aniwatch: [
    'http://localhost:4000',
    'https://nyanime-backend.vercel.app',
    'https://aniwatch-api.vercel.app',
    'https://api.aniwatch.to',
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
