
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import Header from '../components/Header';
import AvatarSelector from '../components/AvatarSelector';
import {
  UserIcon,
  KeyRound,
  Save,
  Image,
  ArrowLeft,
  AlertTriangle,
  Play,
  Shield,
  Settings2,
  Sparkles
} from 'lucide-react';
import { getUserData, updateUserProfile, updateUserPassword } from '@/services/firebaseAuthService';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

type UserProfile = { id: string; username: string; email: string; avatar?: string };

const Settings = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Profile form state
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // Playback debug settings
  const [hlsCookie, setHlsCookie] = useState('');
  // Avatar selector
  const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const userId = localStorage.getItem('userId');
    if (!userId) {
      navigate('/signin');
      return;
    }

    // Fetch user data
    getUserData(userId)
      .then((userData: UserProfile) => {
        setUser(userData);
        setUsername(userData.username);
        setEmail(userData.email);
        setAvatarUrl(userData.avatar || '');
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error("Failed to fetch user data:", msg);
        toast({
          title: "Error loading profile",
          description: "Please try again later",
          variant: "destructive",
        });
        navigate('/signin');
      });

    // Load previously saved HLS cookie (if any)
    try {
      const stored = localStorage.getItem('nyanime.hlsCookie');
      if (stored) setHlsCookie(stored);
    } catch {/* ignore */}
  }, [navigate, toast]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      await updateUserProfile(user.id, {
        username,
        avatar: avatarUrl
      });
      
      toast({
        title: "Profile Updated",
        description: "Your profile information has been updated successfully",
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.id) return;
    
    // Reset error
    setPasswordError('');
    
    // Validate passwords
    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    
    if (!newPassword) {
      setPasswordError('New password is required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }
    
    setIsSaving(true);
    try {
      await updateUserPassword(user.id, currentPassword, newPassword);
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully",
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Invalid current password';
      console.error("Failed to update password:", msg);
      setPasswordError(msg);
      
      toast({
        title: "Password Update Failed",
        description: msg || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-anime-darker">
        <Header />
        <div className="container mx-auto px-4 py-8 mt-16">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-anime-purple"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-anime-purple/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-anime-purple/5 rounded-full blur-3xl"></div>
      </div>
      
      <main className="relative container mx-auto px-4 py-6 sm:py-8 md:py-10 mt-20 max-w-4xl">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-fit backdrop-blur-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:text-white transition-all duration-300"
            onClick={() => navigate('/profile')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Profile
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-anime-purple/20 backdrop-blur-sm">
              <Settings2 className="h-6 w-6 text-anime-purple" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Account Settings</h1>
              <p className="text-white/50 text-sm">Manage your profile and preferences</p>
            </div>
          </div>
        </div>
        
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full sm:w-auto backdrop-blur-md bg-white/5 border border-white/10 p-1 rounded-xl mb-8 flex flex-wrap justify-start gap-1">
            <TabsTrigger 
              value="profile" 
              className="flex-1 sm:flex-none data-[state=active]:bg-anime-purple data-[state=active]:text-white rounded-lg px-4 py-2.5 text-white/70 hover:text-white transition-all duration-300"
            >
              <UserIcon className="h-4 w-4 mr-2" /> Profile
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="flex-1 sm:flex-none data-[state=active]:bg-anime-purple data-[state=active]:text-white rounded-lg px-4 py-2.5 text-white/70 hover:text-white transition-all duration-300"
            >
              <Shield className="h-4 w-4 mr-2" /> Security
            </TabsTrigger>
            <TabsTrigger 
              value="playback" 
              className="flex-1 sm:flex-none data-[state=active]:bg-anime-purple data-[state=active]:text-white rounded-lg px-4 py-2.5 text-white/70 hover:text-white transition-all duration-300"
            >
              <Play className="h-4 w-4 mr-2" /> Playback
            </TabsTrigger>
          </TabsList>
          
          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-0 animate-fade-in">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {/* Card Header */}
              <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-anime-purple/10 to-transparent">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-anime-purple" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Profile Information</h2>
                    <p className="text-white/50 text-sm">Update your account profile and avatar</p>
                  </div>
                </div>
              </div>
              
              {/* Card Content */}
              <div className="p-6 space-y-8">
                {/* Avatar Section */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-white/5 border border-white/5">
                  <div className="relative group">
                    <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-anime-purple/30 to-anime-dark flex items-center justify-center overflow-hidden ring-2 ring-white/10 group-hover:ring-anime-purple/50 transition-all duration-300">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-14 h-14 text-white/30" />
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="absolute -bottom-2 -right-2 bg-anime-purple hover:bg-anime-purple/90 rounded-xl w-10 h-10 p-0 shadow-lg shadow-anime-purple/30 transition-transform hover:scale-105"
                      onClick={() => setIsAvatarSelectorOpen(true)}
                    >
                      <Image className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-white font-medium">{username || 'User'}</h3>
                    <p className="text-white/50 text-sm mb-3">{email}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAvatarSelectorOpen(true)}
                      className="border-anime-purple/30 text-anime-purple hover:bg-anime-purple/10 hover:text-anime-purple"
                    >
                      Choose Avatar
                    </Button>
                  </div>
                </div>
                
                {/* Form Fields */}
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-white/70">
                      Username
                    </label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-anime-purple/50 focus:ring-anime-purple/20 h-12 rounded-xl transition-all"
                      placeholder="Enter your username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-white/70">
                      Email Address
                    </label>
                    <Input
                      id="email"
                      value={email}
                      disabled
                      className="bg-white/5 border-white/10 text-white/50 h-12 rounded-xl cursor-not-allowed"
                    />
                    <p className="text-white/30 text-xs flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Email address cannot be changed for security
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Card Footer */}
              <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02]">
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving || !username}
                  className="bg-anime-purple hover:bg-anime-purple/90 h-11 px-6 rounded-xl shadow-lg shadow-anime-purple/20 transition-all hover:shadow-anime-purple/30 hover:scale-[1.02]"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </TabsContent>
          
          {/* Security Tab */}
          <TabsContent value="security" className="mt-0 animate-fade-in">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-anime-purple/10 to-transparent">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-anime-purple" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Change Password</h2>
                    <p className="text-white/50 text-sm">Keep your account secure with a strong password</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                {passwordError && (
                  <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-400 rounded-xl">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-white/70">
                      Current Password
                    </label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-anime-purple/50 focus:ring-anime-purple/20 h-12 rounded-xl"
                      placeholder="Enter current password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="newPassword" className="block text-sm font-medium text-white/70">
                      New Password
                    </label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-anime-purple/50 focus:ring-anime-purple/20 h-12 rounded-xl"
                      placeholder="Enter new password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/70">
                      Confirm New Password
                    </label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-anime-purple/50 focus:ring-anime-purple/20 h-12 rounded-xl"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-white/50 text-sm">
                    <strong className="text-white/70">Password requirements:</strong>
                    <br />• At least 8 characters long
                    <br />• Mix of letters and numbers recommended
                  </p>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02]">
                <Button 
                  onClick={handleChangePassword}
                  disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-anime-purple hover:bg-anime-purple/90 h-11 px-6 rounded-xl shadow-lg shadow-anime-purple/20 transition-all hover:shadow-anime-purple/30 hover:scale-[1.02]"
                >
                  {isSaving ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </div>
          </TabsContent>
          
          {/* Playback Tab */}
          <TabsContent value="playback" className="mt-0 animate-fade-in">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-anime-purple/10 to-transparent">
                <div className="flex items-center gap-3">
                  <Play className="h-5 w-5 text-anime-purple" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Playback Settings</h2>
                    <p className="text-white/50 text-sm">Advanced video playback configuration</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-yellow-200/80 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Advanced users only.</strong> This setting is for debugging Cloudflare-protected streams. 
                      Most users don't need to change this.
                    </span>
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="hlsCookie" className="block text-sm font-medium text-white/70">
                    Upstream Cookie
                  </label>
                  <Input
                    id="hlsCookie"
                    value={hlsCookie}
                    onChange={(e) => setHlsCookie(e.target.value)}
                    placeholder="cf_clearance=...; __cf_bm=...; other=..."
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-anime-purple/50 focus:ring-anime-purple/20 h-12 rounded-xl font-mono text-sm"
                  />
                  <p className="text-white/30 text-xs">
                    Stored locally in your browser. Used when the stream proxy needs Cloudflare clearance.
                  </p>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02]">
                <Button 
                  onClick={() => {
                    try {
                      if (hlsCookie && hlsCookie.trim()) {
                        localStorage.setItem('nyanime.hlsCookie', hlsCookie.trim());
                        toast({ title: 'Saved', description: 'Playback cookie stored locally.' });
                      } else {
                        localStorage.removeItem('nyanime.hlsCookie');
                        toast({ title: 'Cleared', description: 'Playback cookie removed.' });
                      }
                    } catch (e) {
                      console.error('Failed to save HLS cookie', e);
                      toast({ title: 'Error', description: 'Failed to save.', variant: 'destructive' });
                    }
                  }}
                  className="bg-anime-purple hover:bg-anime-purple/90 h-11 px-6 rounded-xl shadow-lg shadow-anime-purple/20 transition-all hover:shadow-anime-purple/30 hover:scale-[1.02]"
                >
                  <Save className="h-4 w-4 mr-2" /> Save Settings
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Avatar Selector Modal */}
      <AvatarSelector
        isOpen={isAvatarSelectorOpen}
        onClose={() => setIsAvatarSelectorOpen(false)}
        onSelect={(url) => setAvatarUrl(url)}
        currentAvatar={avatarUrl}
      />
    </div>
  );
};

export default Settings;
