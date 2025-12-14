import axios from 'axios';

// Consumet API is used for anime metadata (search, info, episodes list)
// In production, use the proxy. In development, use direct URL.
const getBaseUrl = () => {
  // In development, use direct Consumet API or env var
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';
  }
  
  // In production (deployed as web service), use the relative proxy path
  // This works because server.js proxies /consumet to the Consumet API
  if (typeof window !== 'undefined') {
    return '/consumet';
  }
  
  // Fallback
  return import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';
};

const BASE_URL = getBaseUrl();

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

// Handle request errors with retry logic
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Only log errors in development mode
    if (import.meta.env.DEV) {
      console.error('Consumet API Error:', error.response?.data || error.message);
    }
    
    return Promise.reject(error);
  }
);

export default client;