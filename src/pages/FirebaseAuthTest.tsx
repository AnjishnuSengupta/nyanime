import React, { useState, useEffect } from 'react';
import { 
  registerUser, 
  loginUser, 
  signInWithGoogle, 
  logoutUser,
  getCurrentUser,
  onAuthStateChange,
  type UserData
} from '@/services/firebaseAuthService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const FirebaseAuthTest = () => {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testPassword, setTestPassword] = useState('test123456');
  const [testUsername, setTestUsername] = useState('TestUser');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check for current user
    const user = getCurrentUser();
    setCurrentUser(user);

    // Listen to auth state changes
    const unsubscribe = onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        console.log('✅ User logged in:', user);
      } else {
        console.log('❌ User logged out');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleEmailSignUp = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 Testing email/password sign-up...');
      const user = await registerUser(testUsername, testEmail, testPassword);
      console.log('✅ Sign-up successful:', user);
      toast({
        title: "✅ Sign-up successful",
        description: `Welcome, ${user.username}!`,
      });
      setCurrentUser(user);
    } catch (error) {
      console.error('❌ Sign-up failed:', error);
      toast({
        title: "❌ Sign-up failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 Testing email/password sign-in...');
      const user = await loginUser(testEmail, testPassword);
      console.log('✅ Sign-in successful:', user);
      toast({
        title: "✅ Sign-in successful",
        description: `Welcome back, ${user.username}!`,
      });
      setCurrentUser(user);
    } catch (error) {
      console.error('❌ Sign-in failed:', error);
      toast({
        title: "❌ Sign-in failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 Testing Google sign-in...');
      const user = await signInWithGoogle();
      console.log('✅ Google sign-in successful:', user);
      toast({
        title: "✅ Google sign-in successful",
        description: `Welcome, ${user.username}!`,
      });
      setCurrentUser(user);
    } catch (error) {
      console.error('❌ Google sign-in failed:', error);
      toast({
        title: "❌ Google sign-in failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('🔄 Signing out...');
      await logoutUser();
      console.log('✅ Sign-out successful');
      toast({
        title: "✅ Signed out",
        description: "You have been signed out successfully",
      });
      setCurrentUser(null);
    } catch (error) {
      console.error('❌ Sign-out failed:', error);
      toast({
        title: "❌ Sign-out failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-anime-darker p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            🔥 Firebase Authentication Test
          </h1>
          <p className="text-white/60">Testing all authentication methods</p>
        </div>

        {/* Current User Status */}
        <Card className="p-6 bg-anime-gray border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">
            Current User Status
          </h2>
          {currentUser ? (
            <div className="space-y-2">
              <p className="text-green-400">✅ User is logged in</p>
              <div className="bg-anime-darker p-4 rounded-lg space-y-1 text-sm">
                <p className="text-white"><strong>ID:</strong> {currentUser.id}</p>
                <p className="text-white"><strong>Username:</strong> {currentUser.username}</p>
                <p className="text-white"><strong>Email:</strong> {currentUser.email}</p>
                {currentUser.avatar && (
                  <p className="text-white"><strong>Avatar:</strong> {currentUser.avatar}</p>
                )}
                <p className="text-white">
                  <strong>Created:</strong> {new Date(currentUser.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                onClick={handleSignOut}
                variant="destructive"
                className="mt-4"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <p className="text-red-400">❌ No user logged in</p>
          )}
        </Card>

        {/* Email/Password Test */}
        <Card className="p-6 bg-anime-gray border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">
            📧 Email/Password Authentication
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/80 block mb-2">Username</label>
              <Input
                value={testUsername}
                onChange={(e) => setTestUsername(e.target.value)}
                placeholder="Username"
                className="bg-anime-darker border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-white/80 block mb-2">Email</label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="bg-anime-darker border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-white/80 block mb-2">Password</label>
              <Input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                className="bg-anime-darker border-white/10 text-white"
              />
            </div>
            <div className="flex gap-4">
              <Button
                onClick={handleEmailSignUp}
                disabled={isLoading}
                className="flex-1 bg-anime-purple hover:bg-anime-purple/90"
              >
                {isLoading ? 'Testing...' : 'Test Sign-Up'}
              </Button>
              <Button
                onClick={handleEmailSignIn}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? 'Testing...' : 'Test Sign-In'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Google Sign-In Test */}
        <Card className="p-6 bg-anime-gray border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">
            🔐 Google Authentication
          </h2>
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full bg-white hover:bg-gray-100 text-gray-900"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isLoading ? 'Testing...' : 'Test Google Sign-In'}
          </Button>
        </Card>

        {/* Console Logs */}
        <Card className="p-6 bg-anime-gray border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">
            📋 Instructions
          </h2>
          <div className="space-y-2 text-sm text-white/80">
            <p>1. Open browser console (F12) to see detailed logs</p>
            <p>2. Test email/password sign-up first</p>
            <p>3. Test email/password sign-in with same credentials</p>
            <p>4. Test Google sign-in (popup will open)</p>
            <p>5. Check Firebase Console to verify users are created</p>
            <p className="mt-4 text-white">
              <strong>Firebase Console:</strong>{' '}
              <a
                href="https://console.firebase.google.com/project/nyanime-tech/authentication/users"
                target="_blank"
                rel="noopener noreferrer"
                className="text-anime-purple hover:underline"
              >
                View Users
              </a>
            </p>
            <p className="text-white">
              <strong>Firestore Console:</strong>{' '}
              <a
                href="https://console.firebase.google.com/project/nyanime-tech/firestore/data"
                target="_blank"
                rel="noopener noreferrer"
                className="text-anime-purple hover:underline"
              >
                View Data
              </a>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FirebaseAuthTest;
