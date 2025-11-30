import axios from 'axios';

// Use environment variable with fallback to public API
const BASE_URL = import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';

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