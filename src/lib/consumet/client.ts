import axios from 'axios';

// Use environment variable with fallback to public API
const BASE_URL = import.meta.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';

console.log(`🔧 Consumet Client: Using API URL: ${BASE_URL}`);

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
    console.error('❌ Consumet API Error:', error.response?.data || error.message);
    console.error('🌐 Request URL:', error.config?.url);
    console.error('📡 Base URL:', error.config?.baseURL);
    
    // Log helpful debugging info
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Headers:', error.response.headers);
    }
    
    return Promise.reject(error);
  }
);

export default client;