import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowLeft } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { SEO } from '@/lib/seo';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      setIsSent(true);
      toast({
        title: "Email Sent",
        description: "Check your inbox for the password reset link.",
      });
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      console.error("Password reset error:", error);
      toast({
        title: "Failed to send email",
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
        title="Forgot Password | NyAnime"
        description="Reset your NyAnime password."
        robots={{ noindex: true, follow: true }}
      />
      <div className="min-h-screen bg-anime-darker flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-12">
          <div className="w-full max-w-md glass-card p-4 sm:p-6 md:p-8 rounded-xl relative">
            <Link 
              to="/signin" 
              className="absolute top-4 left-4 p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            
            <div className="text-center mb-8 mt-4">
              <Link to="/" className="inline-block">
                <div className="text-white font-bold text-3xl tracking-tighter">
                  <span className="text-anime-purple">Ny</span>Anime
                </div>
              </Link>
              <h2 className="text-2xl font-bold text-white mt-6">Forgot Password</h2>
              <p className="text-white/60 mt-2">Enter your email to receive a reset link</p>
            </div>
            
            {isSent ? (
              <div className="text-center space-y-6">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
                  A password reset link has been sent to <strong>{email}</strong>.
                  The link will expire in 1 hour.
                </div>
                <Button
                  onClick={() => setIsSent(false)}
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                  Send again
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-white block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); }}
                      className="pl-10 bg-anime-gray/50 border-white/10 text-white"
                      required
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  className="w-full bg-anime-purple hover:bg-anime-purple/90 text-white py-2 rounded-lg transition-colors mt-6"
                  disabled={isLoading || !email}
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ForgotPassword;
