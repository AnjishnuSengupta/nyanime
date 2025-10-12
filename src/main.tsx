
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startDevToolsProtection, disableConsole } from './lib/devtools-protection'

// Disable console in production
disableConsole();

// Start DevTools protection
startDevToolsProtection();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
