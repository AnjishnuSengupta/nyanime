import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * RandomAnimeButton
 *
 * Picks a random currently-airing or recently-aired anime from the proxy API
 * and navigates to its detail page. Falls back to AniList popular list if needed.
 */
const RandomAnimeButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRandom = async () => {
    setIsLoading(true);
    try {
      // Random page 1-10 from AniList popular/airing list via proxy
      const randomPage = Math.floor(Math.random() * 10) + 1;
      const res = await fetch(`${BASE_URL}/api/anime/popular?page=${randomPage}&limit=50`);

      if (res.ok) {
        const data = await res.json();
        const list: Array<{ id: number }> = data?.results ?? data?.anime ?? data ?? [];
        if (list.length > 0) {
          const pick = list[Math.floor(Math.random() * list.length)];
          if (pick?.id) {
            navigate(`/anime/${pick.id}`);
            return;
          }
        }
      }

      // Fallback: hit AniList GraphQL directly
      const anilistRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($page: Int) {
            Page(page: $page, perPage: 50) {
              media(type: ANIME, sort: POPULARITY_DESC, status_in: [RELEASING, FINISHED]) {
                id
              }
            }
          }`,
          variables: { page: Math.floor(Math.random() * 10) + 1 },
        }),
      });

      if (anilistRes.ok) {
        const anilistData = await anilistRes.json();
        const media: Array<{ id: number }> = anilistData?.data?.Page?.media ?? [];
        if (media.length > 0) {
          const pick = media[Math.floor(Math.random() * media.length)];
          navigate(`/anime/${pick.id}`);
          return;
        }
      }

      toast({
        title: 'Could not find a random anime',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } catch (err) {
      console.error('[RandomAnime]', err);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="hidden md:flex items-center gap-1.5 text-white/60 hover:text-white hover:bg-white/5 transition-colors rounded-full px-3 h-8"
      onClick={() => void handleRandom()}
      disabled={isLoading}
      title="Discover a random anime"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shuffle className="h-4 w-4" />
      )}
      <span className="text-xs font-medium">Random</span>
    </Button>
  );
};

export default RandomAnimeButton;
