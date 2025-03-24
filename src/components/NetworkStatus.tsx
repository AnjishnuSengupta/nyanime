
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';

const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUnstable, setIsUnstable] = useState(false);
  const [failedRequests, setFailedRequests] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);

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

    // Monitor fetch requests for instability and rate limiting
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Check if request is to Jikan API - fix the URL type issue
        let urlString = '';
        if (typeof args[0] === 'string') {
          urlString = args[0];
        } else if (args[0] instanceof Request) {
          urlString = args[0].url;
        } else if (args[0] instanceof URL) {
          urlString = args[0].toString();
        }
        
        const isJikanRequest = urlString.includes('api.jikan.moe');
        
        // Handle rate limiting (HTTP 429 Too Many Requests)
        if (response.status === 429 && isJikanRequest) {
          setIsRateLimited(true);
          toast({
            title: "API Rate Limited",
            description: "Please wait a moment before trying again (60 requests/minute limit)",
            variant: "destructive",
          });
          
          // Auto-reset rate limited status after 60 seconds
          setTimeout(() => {
            setIsRateLimited(false);
          }, 60000);
        } else if (!response.ok) {
          handleFailedRequest();
        } else {
          // Successful request
          if (isJikanRequest) {
            // Reset counters only for Jikan API requests
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

    // Reset unstable flag on component mount
    setIsUnstable(false);
    setFailedRequests(0);

    // Clean up
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.fetch = originalFetch;
    };
  }, []);

  // Handle failed network requests
  const handleFailedRequest = () => {
    setFailedRequests(prev => {
      const newCount = prev + 1;
      // Only show unstable warning after 3 consecutive failures instead of 2
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

  // If we're online, connection is stable, and not rate limited, don't show anything
  if (isOnline && !isUnstable && !isRateLimited) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-5">
      <Alert 
        variant={isRateLimited ? "destructive" : isOnline ? "default" : "destructive"} 
        className="border border-red-500 bg-background/95 backdrop-blur"
      >
        <div className="flex items-center">
          {!isOnline ? (
            <WifiOff className="h-5 w-5 mr-2" />
          ) : isRateLimited ? (
            <AlertCircle className="h-5 w-5 mr-2" />
          ) : (
            <AlertCircle className="h-5 w-5 mr-2 text-yellow-500" />
          )}
          <AlertTitle className="text-sm font-semibold">
            {!isOnline ? "You're Offline" : isRateLimited ? "API Rate Limited" : "Unstable Connection"}
          </AlertTitle>
        </div>
        <AlertDescription className="text-xs mt-1">
          {!isOnline ? (
            "Please check your internet connection and try again."
          ) : isRateLimited ? (
            "Too many requests. Please wait a moment before refreshing (60 requests/minute limit)."
          ) : (
            "Your internet connection appears unstable. Content may load slowly."
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default NetworkStatus;
