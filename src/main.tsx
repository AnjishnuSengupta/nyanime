
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startDevToolsProtection, disableConsole } from './lib/devtools-protection'

// Disable console in production
disableConsole();

// Start DevTools protection
startDevToolsProtection();

// Wake up backend servers on Render free tier (they sleep after inactivity)
// This sends a ping request to warm up the servers before user needs them
const wakeUpBackends = () => {
  const backendUrls = [
    'https://nyanime-backend-v2.onrender.com/api/v2/hianime/home',
    'https://nyanime-backend.vercel.app/api/health',
  ];
  
  backendUrls.forEach(url => {
    fetch(url, { method: 'GET', mode: 'cors' })
      .then(() => console.log(`[Backend Wake-up] ${new URL(url).hostname} is ready`))
      .catch(() => {
        // Silently ignore errors - backend might still be waking up
        // User will see loading state if they try to use it before ready
      });
  });
};

// Trigger backend wake-up immediately when app loads
wakeUpBackends();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
