
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUnstable, setIsUnstable] = useState(false);
  const [failedRequests, setFailedRequests] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
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

    // Monitor fetch requests for instability and rate limiting
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
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
        
        // Handle rate limiting (HTTP 429 Too Many Requests)
        if (response.status === 429 && isVideoApiRequest) {
          setIsRateLimited(true);
          if (isJikanRequest) {
            setApiStatus('issue');
          }
          
          toast({
            title: "API Rate Limited",
            description: "Please wait a moment before trying again (API rate limit reached)",
            variant: "destructive",
          });
          
          // Auto-reset rate limited status after 60 seconds
          setTimeout(() => {
            setIsRateLimited(false);
          }, 60000);
        } else if (response.status >= 500 && isVideoApiRequest) {
          // Server errors on API endpoints
          setApiStatus('down');
          toast({
            title: "Video Service Unavailable",
            description: "Our video providers are experiencing issues. Please try again later.",
            variant: "destructive",
          });
        } else if (!response.ok && isVideoApiRequest) {
          handleFailedRequest();
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
          
          if (isVideoApiRequest) {
            // Reset counters only for video API requests
            setFailedRequests(0);
            setIsUnstable(false);
            setIsRateLimited(false);
          }
        }
        
        return response;
      } catch (error) {
        handleFailedRequest();
        throw error;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('streaming-issue', handleStreamingIssue as EventListener);

    // Reset unstable flag on component mount
    setIsUnstable(false);
    setFailedRequests(0);

    // Check API status on mount
    checkApiStatus();

    // Clean up
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('streaming-issue', handleStreamingIssue as EventListener);
      window.fetch = originalFetch;
    };
  }, []);

  // Check API status periodically
  const checkApiStatus = async () => {
    try {
      // Try both Jikan and GoGoAnime to verify services
      const jikanResponse = await fetch('https://api.jikan.moe/v4/anime/1');
      
      // Also check if anime data service is available
      if (!jikanResponse.ok) {
        setApiStatus('issue');
      } else {
        // Only set to OK if we were previously having issues
        if (apiStatus !== 'ok') {
          setApiStatus('ok');
        }
      }
    } catch (error) {
      console.error('API status check failed:', error);
      setApiStatus('down');
    }
  };

  // Handle failed network requests
  const handleFailedRequest = () => {
    setFailedRequests(prev => {
      const newCount = prev + 1;
      // Only show unstable warning after 3 consecutive failures
      if (newCount >= 3) {
        setIsUnstable(true);
        toast({
          title: "Unstable Connection",
          description: "Your connection appears unstable. Content may load slowly.",
          variant: "destructive",
        });
      }
      return newCount;
    });
  };

  // Reset unstable state when we're online and it's been unstable for some time
  useEffect(() => {
    if (isOnline && isUnstable) {
      const timer = setTimeout(() => {
        setIsUnstable(false);
        setFailedRequests(0);
      }, 10000); // Reset unstable state after 10 seconds of being online
      
      return () => clearTimeout(timer);
    }
  }, [isOnline, isUnstable]);

  // Force reload page
  const handleForceReload = () => {
    toast({
      title: "Reloading App",
      description: "Refreshing data from our servers...",
    });
    window.location.reload();
  };

  // If we're online, connection is stable, API is ok, and not rate limited, don't show anything
  if (isOnline && !isUnstable && apiStatus === 'ok' && !isRateLimited && !streamingIssueDetected) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-5">
      <Alert 
        variant={apiStatus === 'down' ? "destructive" : isRateLimited ? "destructive" : isOnline ? "default" : "destructive"} 
        className="border border-red-500 bg-background/95 backdrop-blur shadow-lg"
      >
        <div className="flex items-center">
          {!isOnline ? (
            <WifiOff className="h-5 w-5 mr-2" />
          ) : apiStatus !== 'ok' ? (
            <AlertCircle className="h-5 w-5 mr-2" />
          ) : isRateLimited ? (
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
              isRateLimited ? "API Rate Limited" : 
              streamingIssueDetected ? "Streaming Issue Detected" :
              "Unstable Connection"}
          </AlertTitle>
        </div>
        <AlertDescription className="text-xs mt-1 mb-2">
          {!isOnline ? (
            "Please check your internet connection and try again."
          ) : apiStatus === 'down' ? (
            "Our video providers are currently unavailable. Please try again later."
          ) : apiStatus === 'issue' ? (
            "Having trouble connecting to our video service. Try refreshing."
          ) : isRateLimited ? (
            "Too many requests. Please wait a moment before refreshing."
          ) : streamingIssueDetected ? (
            "We're having trouble loading this video. Try a different server or anime."
          ) : (
            "Your internet connection appears unstable. Content may load slowly."
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
