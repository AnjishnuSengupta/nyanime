
import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<'ok' | 'issue' | 'down'>('ok');

  // Update online status when it changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back Online",
        description: "Your internet connection has been restored",
        variant: "default",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Connection Lost",
        description: "You are currently offline",
        variant: "destructive",
      });
    };

    // Monitor fetch requests for API issues only
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Check if request is to Jikan API or API endpoints
      let urlString = '';
      if (typeof args[0] === 'string') {
        urlString = args[0];
      } else if (args[0] instanceof Request) {
        urlString = args[0].url;
      } else if (args[0] instanceof URL) {
        urlString = args[0].toString();
      }
      
      const isJikanRequest = urlString.includes('api.jikan.moe');
      const isConsometRequest = urlString.includes('consumet.org') || urlString.includes('consumet.api');
      const isAnimeStreaming = urlString.includes('gogoanime') || urlString.includes('zoro.to') || 
                              urlString.includes('animefox') || urlString.includes('.m3u8') ||
                              urlString.includes('streaming') || urlString.includes('video');
      const isVideoApiRequest = isJikanRequest || isConsometRequest || isAnimeStreaming;
      
      // Handle server errors (HTTP 500+)
      if (response.status >= 500 && isVideoApiRequest) {
        // Server errors on API endpoints - silently handle, don't show toast
        setApiStatus('down');
      } else if (!response.ok && isVideoApiRequest) {
        if (isJikanRequest || isConsometRequest) {
          setApiStatus('issue');
        }
        
        // Special handling for streaming requests
        if (isAnimeStreaming && response.status !== 404) {
          window.dispatchEvent(new CustomEvent('streaming-issue', { 
            detail: { url: urlString } 
          }));
        }
      } else {
        // Successful request
        if (isVideoApiRequest && apiStatus !== 'ok') {
          // Reset API status on successful API request
          setApiStatus('ok');
        }
      }
      
      return response;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Clean up
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.fetch = originalFetch;
    };
  }, [apiStatus]); // Removed checkApiStatus from dependencies to prevent circular dependency

  // Check API status periodically
  const checkApiStatus = useCallback(async () => {
    try {
      // Try both Jikan and GoGoAnime to verify services
      const jikanResponse = await fetch('https://api.jikan.moe/v4/anime/1');
      
      if (jikanResponse.ok) {
        setApiStatus('ok');
      } else {
        setApiStatus('down');
      }
    } catch (error) {
      console.error('API Status Check Failed:', error);
      setApiStatus('down');
    }
  }, []);

  // Check API status on mount
  useEffect(() => {
    checkApiStatus();
  }, [checkApiStatus]);

  // Check API status on mount and when connection status changes
  useEffect(() => {
    if (isOnline) {
      checkApiStatus();
      // Check every 30 seconds when online
      const interval = setInterval(checkApiStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isOnline, checkApiStatus]);

  // Force reload page
  const handleForceReload = () => {
    toast({
      title: "Reloading App",
      description: "Refreshing data from our servers...",
    });
    window.location.reload();
  };

  // Only show alert when actually offline (not for API issues or streaming problems)
  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-5">
      <Alert 
        variant="destructive"
        className="border border-red-500 bg-background/95 backdrop-blur shadow-lg"
      >
        <div className="flex items-center">
          <WifiOff className="h-5 w-5 mr-2" />
          <AlertTitle className="text-sm font-semibold">
            You're Offline
          </AlertTitle>
        </div>
        <AlertDescription className="text-xs mt-1 mb-2">
          Please check your internet connection and try again.
        </AlertDescription>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full mt-1 text-xs"
          onClick={handleForceReload}
        >
          <RefreshCw className="h-3 w-3 mr-2" />
          Refresh App
        </Button>
      </Alert>
    </div>
  );
};

export default NetworkStatus;
