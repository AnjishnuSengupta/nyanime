import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/lib/seo';
import { getCurrentUser, UserData } from '@/services/firebaseAuthService';
import { Terminal, CheckCircle, XCircle } from 'lucide-react';

const CliLogin = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [status, setStatus] = useState<'idle' | 'authorizing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const handleAuthorize = async () => {
    if (!user) return;
    
    setStatus('authorizing');
    try {
      // Send the token (uid) and username to the local CLI server
      const response = await fetch('http://localhost:4000/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: user.id,
          username: user.username,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect to CLI. Make sure the CLI is waiting for authorization.');
      }

      setStatus('success');
      toast({
        title: 'Authorization Successful',
        description: 'You can now return to your terminal.',
      });
    } catch (error) {
      console.error('CLI Authorization Error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred.');
      toast({
        title: 'Authorization Failed',
        description: 'Could not connect to the local CLI server.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <SEO
        title="Authorize CLI | NyAnime"
        description="Authorize Ny-CLI to access your NyAnime account."
        robots={{ noindex: true, follow: false }}
      />
      <div className="min-h-screen bg-anime-darker flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md glass-card p-8 rounded-xl text-center space-y-6">
          <div className="flex justify-center">
            <Terminal className="h-16 w-16 text-anime-purple" />
          </div>
          
          <h1 className="text-2xl font-bold text-white">Authorize Ny-CLI</h1>
          
          {!user ? (
            <div className="space-y-4">
              <p className="text-white/70">
                You need to sign in to authorize the terminal application.
              </p>
              <Button 
                onClick={() => navigate('/signin', { state: { returnTo: '/cli-login' } })}
                className="w-full bg-anime-purple hover:bg-anime-purple/90 text-white"
              >
                Sign In to Continue
              </Button>
            </div>
          ) : status === 'success' ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <p className="text-white text-lg font-medium">Successfully Authorized!</p>
              <p className="text-white/70">
                You can now safely close this window and return to your terminal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-anime-gray/50 p-4 rounded-lg border border-white/10">
                <p className="text-sm text-white/60 mb-1">Signed in as</p>
                <p className="text-lg font-medium text-white">{user.username}</p>
                <p className="text-sm text-white/60">{user.email}</p>
              </div>
              
              <p className="text-white/70 text-sm">
                Ny-CLI is requesting access to your account to sync your watchlist and history.
              </p>

              {status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-md text-sm text-left">
                  <XCircle className="h-5 w-5 shrink-0" />
                  <p>{errorMessage}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  onClick={() => navigate('/')}
                  variant="outline"
                  className="w-full bg-transparent border-white/20 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAuthorize}
                  disabled={status === 'authorizing'}
                  className="w-full bg-anime-purple hover:bg-anime-purple/90 text-white"
                >
                  {status === 'authorizing' ? 'Authorizing...' : 'Authorize CLI'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CliLogin;
