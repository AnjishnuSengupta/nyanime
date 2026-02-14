import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const NetworkStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(!navigator.onLine);
  const wasOfflineRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const goOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      wasOfflineRef.current = true;
      // Clear any pending auto-dismiss
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };

    const goOnline = () => {
      setIsOnline(true);
      // Only show "back online" toast if we were actually offline
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        toast({
          title: 'Back Online',
          description: 'Your internet connection has been restored.',
        });
        // Keep the banner visible briefly with "reconnected" state, then auto-dismiss
        dismissTimerRef.current = setTimeout(() => setShowBanner(false), 3000);
      }
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className={`
          pointer-events-auto mt-4 mx-4 flex items-center gap-3 rounded-lg px-5 py-3
          shadow-lg backdrop-blur-md border
          animate-in slide-in-from-top-4 fade-in duration-300
          ${isOnline
            ? 'bg-green-950/90 border-green-700 text-green-100'
            : 'bg-red-950/90 border-red-700 text-red-100'
          }
        `}
      >
        {isOnline ? (
          <Wifi className="h-5 w-5 shrink-0 text-green-400" />
        ) : (
          <WifiOff className="h-5 w-5 shrink-0 text-red-400 animate-pulse" />
        )}

        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">
            {isOnline ? 'Connection Restored' : 'No Internet Connection'}
          </span>
          <span className="text-xs opacity-80 leading-tight mt-0.5">
            {isOnline
              ? 'You are back online.'
              : 'Please check your network and try again.'}
          </span>
        </div>

        {!isOnline && (
          <button
            onClick={() => window.location.reload()}
            className="ml-3 shrink-0 rounded-md bg-red-800 hover:bg-red-700 p-1.5 transition-colors"
            aria-label="Refresh page"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default NetworkStatus;
