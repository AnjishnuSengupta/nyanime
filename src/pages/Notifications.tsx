import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Play, Clock, Radio, RefreshCw, LogIn } from 'lucide-react';
import Header from '../components/Header';
import { SEO } from '../lib/seo';
import { Button } from '@/components/ui/button';
import { getUserData } from '@/services/firebaseAuthService';
import { useAiringCountdown } from '../hooks/useAiringCountdown';
import { getAnimeById } from '../services/animeService';

const BASE_URL = import.meta.env.VITE_API_URL || '';

interface NextEpisodeData {
  anilistId: number;
  nextEpisode: number | null;
  airingAt: number | null;
  source: string | null;
  broadcast: string | null;
}

interface NotificationItem {
  anilistId: number;
  title: string;
  image: string;
  nextEpisode: number | null;
  airingAt: number | null;
  broadcast: string | null;
}

/** Single notification row with its own live countdown */
const NotificationRow = ({ item }: { item: NotificationItem }) => {
  const { countdown } = useAiringCountdown(item.airingAt, item.nextEpisode);
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isWithinHour = item.airingAt !== null && item.airingAt * 1000 - now < 3600 * 1000;
  const isAiringNow = item.airingAt !== null && item.airingAt * 1000 <= now;

  return (
    <div
      className="flex items-center gap-4 p-4 glass-card rounded-xl border border-white/10 hover:border-anime-purple/40 transition-all duration-200 cursor-pointer group hover:bg-white/5 animate-in fade-in slide-in-from-bottom-2 duration-300"
      onClick={() => navigate(`/anime/${item.anilistId}`)}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden">
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-anime-purple transition-colors">
          {item.title}
        </h3>
        {item.nextEpisode && (
          <p className="text-white/50 text-xs mt-0.5">Episode {item.nextEpisode}</p>
        )}
        {item.broadcast && (
          <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
            <Radio className="h-3 w-3" />
            {item.broadcast}
          </p>
        )}
      </div>

      {/* Countdown badge */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        {countdown ? (
          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
              isAiringNow
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : isWithinHour
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-anime-purple/20 text-anime-purple border border-anime-purple/30'
            }`}
          >
            {countdown}
          </span>
        ) : (
          <span className="text-xs text-white/30 px-2">No data</span>
        )}
        <Button
          size="sm"
          className="h-7 px-2 bg-anime-purple/80 hover:bg-anime-purple text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/anime/${item.anilistId}/watch`);
          }}
        >
          <Play className="h-3 w-3 mr-1" />
          Watch
        </Button>
      </div>
    </div>
  );
};

const Notifications = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const userId = localStorage.getItem('userId');
  const isLoggedIn = !!userId;

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Get watch history
      const userData = await getUserData(userId);
      const history = userData?.history || [];

      if (history.length === 0) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      // Deduplicate anime IDs (most recent episode per anime)
      const uniqueIds = [...new Set(history.map((h) => h.animeId))];

      // Fetch batch next-episode data
      const batchRes = await fetch(`${BASE_URL}/api/anime/next-episode-batch?ids=${uniqueIds.join(',')}`);
      const batchData: NextEpisodeData[] = batchRes.ok ? await batchRes.json() : [];

      // Only keep anime that are actually airing (have airingAt data)
      const airingEntries = batchData.filter((d) => d.airingAt !== null);

      // Sort by soonest airing
      airingEntries.sort((a, b) => (a.airingAt ?? 0) - (b.airingAt ?? 0));

      // Fetch anime info for display
      const notificationItems: NotificationItem[] = [];
      for (const entry of airingEntries.slice(0, 20)) {
        try {
          const info = await getAnimeById(entry.anilistId);
          if (info) {
            notificationItems.push({
              anilistId: entry.anilistId,
              title: info.title,
              image: info.image,
              nextEpisode: entry.nextEpisode,
              airingAt: entry.airingAt,
              broadcast: entry.broadcast,
            });
          }
        } catch {
          // skip failed fetches silently
        }
      }

      setItems(notificationItems);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[Notifications] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial load
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      loadNotifications();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const formatLastRefreshed = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-anime-darker">
        <SEO title="Notifications — NyAnime" description="Your upcoming episode notifications" />
        <Header />
        <div className="pt-24 pb-16 container mx-auto px-4 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="glass-card rounded-2xl p-10 text-center max-w-md border border-white/10">
            <Bell className="h-14 w-14 text-anime-purple/50 mx-auto mb-4" />
            <h2 className="text-white text-xl font-semibold mb-2">Sign in to see notifications</h2>
            <p className="text-white/50 text-sm mb-6">
              Track upcoming episodes from anime in your watch history.
            </p>
            <Button asChild className="bg-anime-purple hover:bg-anime-purple/90">
              <Link to="/signin">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-anime-darker">
      <SEO title="Notifications — NyAnime" description="Upcoming episode countdowns for anime you're watching" />
      <Header />

      <div className="pt-24 pb-16 container mx-auto px-4 max-w-2xl">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-anime-purple/20 rounded-xl flex items-center justify-center border border-anime-purple/30">
              <Bell className="h-5 w-5 text-anime-purple" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold">Episode Notifications</h1>
              {lastRefreshed && (
                <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  Updated at {formatLastRefreshed(lastRefreshed)}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-white/10 text-white/60 hover:text-white hover:border-anime-purple/40"
            onClick={loadNotifications}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 glass-card rounded-xl border border-white/10 animate-pulse">
                <div className="w-16 h-20 rounded-lg bg-white/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-2/3" />
                  <div className="h-3 bg-white/10 rounded w-1/3" />
                </div>
                <div className="w-24 h-7 bg-white/10 rounded-full flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Notification list */}
        {!isLoading && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={item.anilistId} style={{ animationDelay: `${i * 50}ms` }}>
                <NotificationRow item={item} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-16 glass-card rounded-2xl border border-white/10">
            <Bell className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-white/60 text-lg font-medium mb-2">No upcoming episodes</h3>
            <p className="text-white/40 text-sm mb-6 max-w-xs mx-auto">
              Anime from your watch history that are currently airing will appear here with live countdowns.
            </p>
            <Button asChild variant="outline" className="border-anime-purple/40 text-anime-purple hover:bg-anime-purple/10">
              <Link to="/anime">Browse Anime</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
