/**
 * DevTools Protection Utility
 * Detects when DevTools is opened and redirects to home page
 * to prevent users from inspecting network requests
 */

let devtoolsOpen = false;
let redirectTimer: NodeJS.Timeout | null = null;

// Detection method 1: Using console API
const detectDevToolsByConsole = (): boolean => {
  const before = new Date().getTime();
  // eslint-disable-next-line no-debugger
  debugger;
  const after = new Date().getTime();
  return after - before > 100; // DevTools slows down debugger
};

// Detection method 2: Window size detection
const detectDevToolsBySize = (): boolean => {
  const threshold = 160;
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  return widthThreshold || heightThreshold;
};

// Detection method 3: DevTools orientation
const detectDevToolsByOrientation = (): boolean => {
  const orientation = window.screen.width < window.screen.height ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';
  const difference = window.outerHeight - window.innerHeight;
  
  if (isPortrait) {
    return difference > 100;
  }
  return difference > 200 || window.outerWidth - window.innerWidth > 200;
};

// Check if currently on video page
const isOnVideoPage = (): boolean => {
  return window.location.pathname.includes('/watch/') || 
         window.location.pathname.includes('/video/');
};

// Redirect to home page
const redirectToHome = (): void => {
  if (isOnVideoPage()) {
    // Clear any stored data
    sessionStorage.removeItem('current-episode');
    sessionStorage.removeItem('video-sources');
    
    // Redirect to home
    window.location.href = '/';
  }
};

// Main detection loop
const checkDevTools = (): void => {
  const isOpen = 
    detectDevToolsByConsole() || 
    detectDevToolsBySize() || 
    detectDevToolsByOrientation();

  if (isOpen && !devtoolsOpen) {
    devtoolsOpen = true;
    
    // Only redirect if on video page
    if (isOnVideoPage()) {
      // Give a small delay before redirect to avoid false positives
      redirectTimer = setTimeout(redirectToHome, 500);
    }
  } else if (!isOpen && devtoolsOpen) {
    devtoolsOpen = false;
    
    if (redirectTimer) {
      clearTimeout(redirectTimer);
      redirectTimer = null;
    }
  }
};

// Start protection
export const startDevToolsProtection = (): () => void => {
  // Only enable in production
  if (import.meta.env.DEV) {
    return () => {}; // No-op in development
  }

  // Check every 1 second
  const intervalId = setInterval(checkDevTools, 1000);

  // Disable right-click context menu on video pages
  const handleContextMenu = (e: MouseEvent): void => {
    if (isOnVideoPage()) {
      e.preventDefault();
    }
  };

  // Disable F12 and other DevTools shortcuts
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!isOnVideoPage()) return;

    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      redirectToHome();
      return;
    }

    // Ctrl+Shift+I / Cmd+Option+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      redirectToHome();
      return;
    }

    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      redirectToHome();
      return;
    }

    // Ctrl+Shift+C / Cmd+Option+C (Inspect Element)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      redirectToHome();
      return;
    }

    // Ctrl+U / Cmd+U (View Source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'U') {
      e.preventDefault();
      return;
    }
  };

  document.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('keydown', handleKeyDown);

  // Cleanup function
  return () => {
    clearInterval(intervalId);
    if (redirectTimer) {
      clearTimeout(redirectTimer);
    }
    document.removeEventListener('contextmenu', handleContextMenu);
    document.removeEventListener('keydown', handleKeyDown);
  };
};

// Disable console in production
export const disableConsole = (): void => {
  if (import.meta.env.DEV) {
    return; // Keep console in development
  }

  // Save original console methods
  const noop = (): void => {};

  // Override console methods
  window.console.log = noop;
  window.console.info = noop;
  window.console.warn = noop;
  window.console.debug = noop;
  // Keep console.error for critical errors
};
