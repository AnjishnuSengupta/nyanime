
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startDevToolsProtection, disableConsole } from './lib/devtools-protection'

const UNOFFICIAL_ANIMEKAI_API_URL = (
  import.meta.env.VITE_ANIMEKAI_UNOFFICIAL_API_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:5000' : 'https://animekai.nyanime.tech')
).trim().replace(/\/+$/, '');

// Disable console in production
disableConsole();

// Start DevTools protection
startDevToolsProtection();

// Warm up the local /aniwatch route (Consumet-backed adapter)
const warmUpAniwatchRoute = () => {
  fetch('/aniwatch?action=home', { method: 'GET' })
    .then(() => console.log('[Warm-up] Aniwatch home data pre-cached'))
    .catch(() => {
      // Silently ignore — the route will work when the user needs it
    });
};

const checkUnofficialAnimekaiHealth = () => {
  if (!UNOFFICIAL_ANIMEKAI_API_URL) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  fetch(`${UNOFFICIAL_ANIMEKAI_API_URL}/api/search?keyword=naruto`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      const resultCount = Array.isArray(payload?.results) ? payload.results.length : 0;
      if (response.ok && resultCount > 0) {
        console.log(`[Health] Unofficial AnimeKAI API active (${UNOFFICIAL_ANIMEKAI_API_URL})`);
      } else {
        console.warn(`[Health] Unofficial AnimeKAI API inactive (${UNOFFICIAL_ANIMEKAI_API_URL})`);
      }
    })
    .catch(() => {
      console.warn(`[Health] Unofficial AnimeKAI API inactive (${UNOFFICIAL_ANIMEKAI_API_URL})`);
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
};

// Trigger warm-up quickly (local server, no cold start delay needed)
setTimeout(warmUpAniwatchRoute, 500);
setTimeout(checkUnofficialAnimekaiHealth, 700);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
