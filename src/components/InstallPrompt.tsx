import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'nyanime_install_prompt_dismissed';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or already installed
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so it doesn't pop up immediately on page load
      setTimeout(() => setIsVisible(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="glass-card border border-anime-purple/40 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-[0_8px_32px_rgba(147,51,234,0.25)] backdrop-blur-xl max-w-sm">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 bg-anime-purple/20 rounded-xl flex items-center justify-center border border-anime-purple/30">
          <Download className="h-5 w-5 text-anime-purple" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Install NyAnime</p>
          <p className="text-white/50 text-xs">Add to home screen for the best experience</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            className="h-8 px-3 bg-anime-purple hover:bg-anime-purple/90 text-white text-xs font-semibold"
            onClick={handleInstall}
          >
            Install
          </Button>
          <button
            onClick={handleDismiss}
            className="text-white/40 hover:text-white/70 transition-colors p-1 rounded-md hover:bg-white/5"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
