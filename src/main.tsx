
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeDbService } from './services/dbService'
import { installConsoleSanitizer } from './lib/console-sanitizer'

// Initialize the database service (now browser-compatible)
initializeDbService().catch(error => {
  console.error('Failed to initialize database service:', error);
  console.log('Application will continue with limited functionality');
});

// Install console sanitizer (no-op in dev unless localStorage['nyanime.debug'] = '1')
installConsoleSanitizer();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
