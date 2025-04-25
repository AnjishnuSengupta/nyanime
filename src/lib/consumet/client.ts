import axios from 'axios';

// You can either use the direct API or self-host it
// For this implementation, we'll use the public API endpoint
const BASE_URL = 'https://api.consumet.org'; 

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

// Handle request errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Consumet API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default client;