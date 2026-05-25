import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { SEO } from '@/lib/seo';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValidCode, setIsValidCode] = useState(false);
  const [email, setEmail] = useState('');
  
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');
  
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!oobCode) {
      setIsVerifying(false);
      return;
    }

    // Verify the password reset code
    verifyPasswordResetCode(auth, oobCode)
      .then((emailRes) => {
        setEmail(emailRes);
        setIsValidCode(true);
      })
      .catch((error) => {
        console.error("Invalid or expired action code.", error);
        setIsValidCode(false);
      })
      .finally(() => {
        setIsVerifying(false);
      });
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    if (!oobCode) return;

    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      toast({
        title: "Password Reset Successful",
        description: "You can now sign in with your new password.",
      });
      navigate('/signin');
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      console.error("Password reset error:", error);
      toast({
        title: "Failed to reset password",
        description: firebaseError.message || "An unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SEO
        title="Set New Password | NyAnime"
        description="Set your new NyAnime password."
        robots={{ noindex: true, follow: true }}
      />
      <div className="min-h-screen bg-anime-darker flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-12">
          <div className="w-full max-w-md glass-card p-4 sm:p-6 md:p-8 rounded-xl">
            <div className="text-center mb-8">
              <Link to="/" className="inline-block">
                <div className="text-white font-bold text-3xl tracking-tighter">
                  <span className="text-anime-purple">Ny</span>Anime
                </div>
              </Link>
              <h2 className="text-2xl font-bold text-white mt-6">Set New Password</h2>
            </div>
            
            {isVerifying ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-anime-purple mx-auto mb-4"></div>
                <p className="text-white/60">Verifying link...</p>
              </div>
            ) : !isValidCode ? (
              <div className="text-center space-y-6">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  This password reset link is invalid or has expired. Links are only valid for 1 hour.
                </div>
                <Button
                  onClick={() => navigate('/forgot-password')}
                  className="w-full bg-anime-purple hover:bg-anime-purple/90"
                >
                  Request a new link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="p-3 bg-anime-purple/10 border border-anime-purple/20 rounded-lg text-sm text-white/80 mb-4 text-center">
                  Resetting password for <strong>{email}</strong>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-white block">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); }}
                      className="pl-10 bg-anime-gray/50 border-white/10 text-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => { setShowPassword(!showPassword); }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-white block">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); }}
                      className="pl-10 bg-anime-gray/50 border-white/10 text-white"
                      required
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  className="w-full bg-anime-purple hover:bg-anime-purple/90 text-white py-2 rounded-lg transition-colors mt-6"
                  disabled={isLoading || !password || !confirmPassword}
                >
                  {isLoading ? "Saving..." : "Reset Password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ResetPassword;
