
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeDbService } from './services/dbService'

// Initialize the database service (now browser-compatible)
initializeDbService().catch(error => {
  console.error('Failed to initialize database service:', error);
  console.log('Application will continue with limited functionality');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
