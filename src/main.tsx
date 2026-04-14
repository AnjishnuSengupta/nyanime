
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import './index.css'
import { startDevToolsProtection, disableConsole } from './lib/devtools-protection'

// Disable console in production
disableConsole();

// Start DevTools protection
startDevToolsProtection();

// Warm up the local /aniwatch route (AnimeKAI-backed adapter)
const warmUpAniwatchRoute = () => {
  fetch('/aniwatch?action=home', { method: 'GET' })
    .then(() => { /* pre-cached */ })
    .catch(() => {
      // Silently ignore — the route will work when the user needs it
    });
};

// Trigger warm-up quickly (local server, no cold start delay needed)
setTimeout(warmUpAniwatchRoute, 500);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
