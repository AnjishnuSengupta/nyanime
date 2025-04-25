import React from 'react';
import { AlertCircle, RefreshCcw, ServerIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PROVIDERS, AnimeProvider } from '../services/consumetService';

interface StreamErrorProps {
  message?: string;
  onRetry?: () => void;
  onChangeServer?: (provider: AnimeProvider) => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  hasNextEpisode?: boolean;
  hasPreviousEpisode?: boolean;
}

const StreamError: React.FC<StreamErrorProps> = ({ 
  message = "We're having trouble loading this video. Try a different server or anime.",
  onRetry,
  onChangeServer,
  onNextEpisode,
  onPreviousEpisode,
  hasNextEpisode = false,
  hasPreviousEpisode = false
}) => {
  const handleServerChange = (provider: AnimeProvider) => {
    if (onChangeServer) {
      onChangeServer(provider);
    }
  };

  return (
    <div className="w-full aspect-video flex items-center justify-center bg-anime-dark/70 rounded-xl">
      <Alert className="max-w-md bg-anime-dark border-anime-purple text-white">
        <AlertCircle className="h-4 w-4 text-anime-purple" />
        <AlertTitle>Streaming Issue Detected</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        <div className="mt-4 flex flex-col gap-2">
          {onRetry && (
            <Button 
              variant="outline"
              className="border-anime-purple/50 text-white"
              onClick={onRetry}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh App
            </Button>
          )}
          
          {onChangeServer && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleServerChange(PROVIDERS.GOGOANIME)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 1
              </Button>
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleServerChange(PROVIDERS.ZORO)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 2
              </Button>
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleServerChange(PROVIDERS.ANIMEFOX)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 4
              </Button>
              <Button 
                variant="outline"
                className="border-anime-purple/50 text-white"
                onClick={() => handleServerChange(PROVIDERS.ANIMEPAHE)}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Server 3
              </Button>
            </div>
          )}
          
          {(hasPreviousEpisode || hasNextEpisode) && (
            <div className="flex gap-2 mt-2">
              {hasPreviousEpisode && onPreviousEpisode && (
                <Button 
                  variant="outline"
                  className="border-anime-purple/50 text-white flex-1"
                  onClick={onPreviousEpisode}
                >
                  Previous Episode
                </Button>
              )}
              
              {hasNextEpisode && onNextEpisode && (
                <Button 
                  variant="outline"
                  className="border-anime-purple/50 text-white flex-1"
                  onClick={onNextEpisode}
                >
                  Next Episode
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>
    </div>
  );
};

export default StreamError;