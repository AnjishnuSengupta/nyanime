
import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<'ok' | 'issue' | 'down'>('ok');
  const [streamingIssueDetected, setStreamingIssueDetected] = useState(false);

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

    // Listen for custom streaming issue events
    const handleStreamingIssue = (event: CustomEvent) => {
      setStreamingIssueDetected(true);
      const { animeId, episodeId } = event.detail || {};
      console.log(`Streaming issue detected for anime: ${animeId}, episode: ${episodeId}`);
      
      toast({
        title: "Streaming Issue Detected",
        description: "Having trouble loading this video. Try a different server or anime.",
        variant: "destructive",
      });
      
      // Auto-reset after 20 seconds
      setTimeout(() => {
        setStreamingIssueDetected(false);
      }, 20000);
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
        // Server errors on API endpoints
        setApiStatus('down');
        toast({
          title: "Video Service Unavailable",
          description: "Our video providers are experiencing issues. Please try again later.",
          variant: "destructive",
        });
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
    window.addEventListener('streaming-issue', handleStreamingIssue as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('streaming-issue', handleStreamingIssue as EventListener);
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

  // Only show alert when offline
  if (isOnline && apiStatus === 'ok' && !streamingIssueDetected) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-5">
      <Alert 
        variant={apiStatus === 'down' ? "destructive" : isOnline ? "default" : "destructive"} 
        className="border border-red-500 bg-background/95 backdrop-blur shadow-lg"
      >
        <div className="flex items-center">
          {!isOnline ? (
            <WifiOff className="h-5 w-5 mr-2" />
          ) : apiStatus !== 'ok' ? (
            <AlertCircle className="h-5 w-5 mr-2" />
          ) : streamingIssueDetected ? (
            <AlertCircle className="h-5 w-5 mr-2 text-yellow-500" />
          ) : (
            <AlertCircle className="h-5 w-5 mr-2 text-yellow-500" />
          )}
          <AlertTitle className="text-sm font-semibold">
            {!isOnline ? "You're Offline" : 
              apiStatus === 'down' ? "Video Service Down" :
              apiStatus === 'issue' ? "API Connection Issues" :
              streamingIssueDetected ? "Streaming Issue Detected" :
              "Connection Issue"}
          </AlertTitle>
        </div>
        <AlertDescription className="text-xs mt-1 mb-2">
          {!isOnline ? (
            "Please check your internet connection and try again."
          ) : apiStatus === 'down' ? (
            "Our video providers are currently unavailable. Please try again later."
          ) : apiStatus === 'issue' ? (
            "Having trouble connecting to our video service. Try refreshing."
          ) : streamingIssueDetected ? (
            "We're having trouble loading this video. Try a different server or anime."
          ) : (
            "Experiencing connection issues. Try refreshing the page."
          )}
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
