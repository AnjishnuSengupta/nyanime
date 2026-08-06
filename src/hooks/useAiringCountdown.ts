import { useEffect, useState } from 'react';

/**
 * useAiringCountdown
 *
 * Given a Unix timestamp (seconds) of when an episode airs and the episode number,
 * returns a human-readable live countdown string that ticks every second.
 *
 * Returns '' when airingAt is null/0.
 * Returns 'Airing now!' when the target time has passed.
 *
 * Examples:
 *   "Ep 12 in 2d 4h 15m 32s"
 *   "Ep 3 in 45m 12s"
 *   "Airing now!"
 */
export function useAiringCountdown(
  airingAt: number | null,
  episodeNumber: number | null
): { countdown: string } {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!airingAt) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = airingAt * 1000 - now.getTime();

      if (diff <= 0) {
        setCountdown('Airing now!');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const epLabel = episodeNumber ? `Ep ${episodeNumber} in ` : 'Next ep in ';

      if (days > 0) {
        setCountdown(`${epLabel}${days}d ${hours}h ${minutes}m ${seconds}s`);
      } else if (hours > 0) {
        setCountdown(`${epLabel}${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${epLabel}${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [airingAt, episodeNumber]);

  return { countdown };
}
