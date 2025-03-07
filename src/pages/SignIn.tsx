
import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate authentication - this would connect to your backend in production
    setTimeout(() => {
      // Mock successful login for demo purposes
      localStorage.setItem('user', JSON.stringify({ email, id: 'user-123', username: email.split('@')[0] }));
      setIsLoggedIn(true);
      
      toast({
        title: "Login successful",
        description: "You are now signed in",
      });
      
      setIsLoading(false);
    }, 1000);
  };

  if (isLoggedIn) {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-anime-darker flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md glass-card p-8 rounded-xl">
          <div className="text-center mb-8">
            <Link to="/" className="inline-block">
              <div className="text-white font-bold text-3xl tracking-tighter">
                <span className="text-anime-purple">Ani</span>Stream
              </div>
            </Link>
            <h2 className="text-2xl font-bold text-white mt-6">Welcome back</h2>
            <p className="text-white/60 mt-2">Sign in to your account to continue</p>
          </div>
          
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-white block">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-anime-gray/50 border-white/10 text-white"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <label htmlFor="password" className="text-sm font-medium text-white block">
                  Password
                </label>
                <Link to="/forgot-password" className="text-sm text-anime-purple hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-anime-gray/50 border-white/10 text-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full bg-anime-purple hover:bg-anime-purple/90 text-white py-2 rounded-lg transition-colors"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
            
            <div className="text-center mt-6">
              <p className="text-white/60">
                Don't have an account?{" "}
                <Link to="/signup" className="text-anime-purple hover:underline">
                  Sign up
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
