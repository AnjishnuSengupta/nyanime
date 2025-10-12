
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
  Play
} from 'lucide-react';
import { getUserData, updateUserProfile, updateUserPassword } from '@/services/firebaseAuthService';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
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
            <p className="text-white">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-anime-darker">
      <Header />
      
      <main className="container mx-auto px-4 py-8 mt-20">
        <div className="flex items-center mb-6">
          <Button 
            variant="outline" 
            size="sm" 
            className="mr-4 bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => navigate('/profile')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Profile
          </Button>
          <h1 className="text-2xl font-bold text-white">Account Settings</h1>
        </div>
        
        <Tabs defaultValue="profile" className="w-full max-w-3xl mx-auto">
          <TabsList className="bg-anime-dark h-10 mb-8">
            <TabsTrigger value="profile" className="text-sm">
              <UserIcon className="h-4 w-4 mr-2" /> Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="text-sm">
              <KeyRound className="h-4 w-4 mr-2" /> Security
            </TabsTrigger>
            <TabsTrigger value="playback" className="text-sm">
              <Play className="h-4 w-4 mr-2" /> Playback
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="mt-0">
            <Card className="glass-card bg-transparent border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Profile Information</CardTitle>
                <CardDescription className="text-white/70">
                  Update your account profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center mb-6">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-anime-gray/50 flex items-center justify-center text-white text-5xl overflow-hidden">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-12 h-12" />
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="absolute bottom-0 right-0 bg-anime-purple hover:bg-anime-purple/90 rounded-full w-8 h-8 p-0"
                      onClick={() => setIsAvatarSelectorOpen(true)}
                    >
                      <Image className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-white/70 text-sm mt-2">
                    Click the icon to choose an anime avatar
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="username" className="block text-sm font-medium text-white/70">
                    Username
                  </label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-anime-gray/50 border-white/10 text-white"
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
                    className="bg-anime-gray/50 border-white/10 text-white opacity-70"
                  />
                  <p className="text-white/50 text-xs">
                    Email address cannot be changed
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving || !username}
                  className="bg-anime-purple hover:bg-anime-purple/90"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="security" className="mt-0">
            <Card className="glass-card bg-transparent border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Change Password</CardTitle>
                <CardDescription className="text-white/70">
                  Update your account password
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {passwordError && (
                  <Alert variant="destructive" className="bg-red-900/20 border-red-900/50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-white/70">
                    Current Password
                  </label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="bg-anime-gray/50 border-white/10 text-white"
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
                    className="bg-anime-gray/50 border-white/10 text-white"
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
                    className="bg-anime-gray/50 border-white/10 text-white"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleChangePassword}
                  disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-anime-purple hover:bg-anime-purple/90"
                >
                  {isSaving ? 'Updating...' : 'Update Password'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="playback" className="mt-0">
            <Card className="glass-card bg-transparent border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Playback (Advanced)</CardTitle>
                <CardDescription className="text-white/70">
                  Optional cookie for Cloudflare-protected HLS streams. Paste the Cookie header captured from a successful provider session.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="hlsCookie" className="block text-sm font-medium text-white/70">
                    Upstream Cookie
                  </label>
                  <Input
                    id="hlsCookie"
                    value={hlsCookie}
                    onChange={(e) => setHlsCookie(e.target.value)}
                    placeholder="cf_clearance=...; __cf_bm=...; other=..."
                    className="bg-anime-gray/50 border-white/10 text-white"
                  />
                  <p className="text-white/50 text-xs">
                    Stored locally. If present, the player will forward it via the /stream proxy.
                  </p>
                </div>
              </CardContent>
              <CardFooter>
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
                  className="bg-anime-purple hover:bg-anime-purple/90"
                >
                  <Save className="h-4 w-4 mr-2" /> Save
                </Button>
              </CardFooter>
            </Card>
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
