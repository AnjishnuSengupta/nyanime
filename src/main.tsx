
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startDevToolsProtection, disableConsole } from './lib/devtools-protection'

// Disable console in production
disableConsole();

// Start DevTools protection
startDevToolsProtection();

// Warm up the local aniwatch server route (pre-populates server-side cache)
const warmUpAniwatchRoute = () => {
  fetch('/aniwatch?action=home', { method: 'GET' })
    .then(() => console.log('[Warm-up] Aniwatch home data pre-cached'))
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
    <App />
  </React.StrictMode>,
)
