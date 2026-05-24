/**
 * DevTools Protection Utility
 * Detects when DevTools is opened and redirects to home page
 * to prevent users from inspecting network requests
 */

let devtoolsOpen = false;
let redirectTimer: NodeJS.Timeout | null = null;

const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i;

const isLocalhost = (): boolean => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

const isTouchOrMobileDevice = (): boolean => {
  const hasTouch = navigator.maxTouchPoints > 0;
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const mobileUa = MOBILE_UA_REGEX.test(navigator.userAgent || '');
  return hasTouch || coarsePointer || mobileUa;
};

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

// Redirect to home page
const redirectToHome = (): void => {
  // Clear any stored data
  sessionStorage.removeItem('current-episode');
  sessionStorage.removeItem('video-sources');
  
  // Redirect to home immediately (avoid reload loops on root path)
  if (window.location.pathname !== '/') {
    window.location.replace('/');
  }
};

// Main detection loop
const checkDevTools = (): void => {
  // Skip expensive/unstable checks on touch/mobile to avoid false positives.
  if (isTouchOrMobileDevice()) return;

  const isOpen = 
    detectDevToolsByConsole() || 
    detectDevToolsBySize() || 
    detectDevToolsByOrientation();

  if (isOpen && !devtoolsOpen) {
    devtoolsOpen = true;

    // Immediate redirect when DevTools opens.
    redirectTimer = setTimeout(redirectToHome, 0);
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
  // Bypass protection in localhost/dev only.
  if (import.meta.env.DEV || isLocalhost()) {
    return () => {}; // No-op in development
  }

  // Mobile browsers frequently trigger false positives for viewport-based checks.
  if (isTouchOrMobileDevice()) {
    return () => {};
  }

  // Check frequently for near-instant redirect.
  const intervalId = setInterval(checkDevTools, 250);

  // Disable right-click context menu on video pages
  const handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    redirectToHome();
  };

  // Disable F12 and other DevTools shortcuts
  const handleKeyDown = (e: KeyboardEvent): void => {
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
  if (import.meta.env.DEV || isLocalhost()) {
    return; // Keep console in development
  }

  // Save original console methods
  const noop = (): void => {};

  // Override console methods
  window.console.log = noop;
  window.console.info = noop;
  window.console.warn = noop;
  window.console.debug = noop;
  window.console.error = noop;
};
