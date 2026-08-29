

export interface NyaaTorrentResult {
  magnetLink: string;
  torrentUrl: string;
  title: string;
  seeders: number;
  leechers: number;
  size: string;
  fileName: string;
}

export interface TorrentSearchError extends Error {
  reason: 'not-found' | 'backend-error';
}

interface AnimeToshoResult {
  title: string;
  seeders: number;
  magnet_uri: string;
  torrent_url: string;
  total_size: number;
  torrent_name?: string;
}

/**
 * Search for an anime episode torrent via AnimeTosho JSON API.
 * This runs entirely on the frontend and bypasses any backend requirements.
 */
/**
 * Search for an anime episode or movie torrent via AnimeTosho JSON API.
 * This runs entirely on the frontend and bypasses any backend requirements.
 */
export async function findEpisodeTorrent(
  englishTitle: string,
  romajiTitle: string,
  episode: number,
  dub = false,
  _season?: number,
  isMovie = false
): Promise<NyaaTorrentResult> {
  const ep2 = episode.toString().padStart(2, '0');
  const ep3 = episode.toString().padStart(3, '0');
  
  // Clean up title for better search - remove common noise
  const cleanTitle = (t: string) => t
    .replace(/[.:\-!]/g, ' ')
    .replace(/\s(TV|Season|S\d+)\s?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const title1 = cleanTitle(romajiTitle);
  const title2 = cleanTitle(englishTitle);
  const titles = [title1, title2].filter((t, i, a) => t && a.indexOf(t) === i);
  
  // Construct search queries to try in order
  const queries: string[] = [];
  
  for (const title of titles) {
    if (isMovie) {
      queries.push(`${title} 1080p`);
      queries.push(`${title} Dual Audio`);
      queries.push(`${title}`);
    } else {
      if (dub) {
        queries.push(`${title} ${ep3} 1080p dub`);
        queries.push(`${title} ${ep2} 1080p dub`);
        queries.push(`${title} ${episode} dub`);
      } else {
        // 1. High-quality releases (SubsPlease, Erai-raws)
        queries.push(`[SubsPlease] ${title} - ${ep3} (1080p)`);
        queries.push(`[Erai-raws] ${title} - ${ep3} [1080p]`);
        queries.push(`[Judas] ${title} - ${ep3}`);
        
        // 2. Standard high-quality MP4/MKV
        queries.push(`${title} ${ep3} 1080p`);
        queries.push(`${title} ${ep2} 1080p`);
        queries.push(`${title} ${episode} 1080p`);
        
        // 3. Generic fallbacks
        queries.push(`${title} ${ep3}`);
        queries.push(`${title} ${ep2}`);
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    for (const query of queries) {
      const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: controller.signal });
      
      if (!res.ok) continue;
      
      const data = await res.json() as AnimeToshoResult[];
      
        if (Array.isArray(data) && data.length > 0) {
          // Filter results strictly by episode number and REJECT batches
          const filtered = data.filter((d: AnimeToshoResult) => {
            const t = (d.title || '').toLowerCase();
            
            // REJECT Batch Torrents for episodes (movies can be large)
            if (!isMovie) {
              if (t.includes('~')) return false;
              if (/(\d{2,3})[-–](\d{2,3})/.test(t)) return false;
              if (t.includes('batch') || t.includes('complete')) return false;
              
              // Block 1: Reject volume packs
              if (/\bvol\.?\s*\d+/i.test(t)) return false;

              // Strict episode number check using regex
              const epPattern = new RegExp(`(\\D|^)(0*${episode})(\\D|$)`);
              if (!epPattern.test(t)) return false;

              // Block 2: Title must match — strip release group prefix then check startsWith
              const strippedTitle = (d.title || '')
                .replace(/^\[.*?\]\s*/g, '')   // Remove [SubsPlease], [Erai-raws], etc.
                .replace(/^\(.*?\)[_\s]*/g, '') // Remove (Monkey_D), (group), etc.
                .replace(/_/g, ' ')
                .trim();

              const norm = (s: string) =>
                s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

              const strippedNorm = norm(strippedTitle);
              const enNorm = norm(englishTitle || '');
              const roNorm = norm(romajiTitle || '');

              const titleMatches =
                (enNorm && strippedNorm.startsWith(enNorm)) ||
                (roNorm && strippedNorm.startsWith(roNorm));

              if (!titleMatches) return false;
            } else {
              // For movies, just ensure it's not a sample or trailer
              if (t.includes('sample') || t.includes('trailer')) return false;
            }

            return true;
          });

          const validResults = filtered.length > 0 ? filtered : [];
          if (validResults.length === 0) continue;

          // ── Streaming-optimised scorer ──
          // Goal: find the smallest 1080p file that still has healthy peers.
          // A compact encode (200-500 MB) transcodes faster and buffers less than
          // a large one (1-2 GB) even if it has more seeders.
          //
          // Preferred release groups for compact-but-good quality:
          const PREFERRED_GROUPS = ['subsplease', 'erai-raws', 'judas', 'ember', 'small-subs', 'horriblesubs'];

          const scoredResults = validResults.map((d: AnimeToshoResult) => {
            const sizeMb = (d.total_size || 0) / (1024 * 1024);
            const seeders = d.seeders || 0;
            const titleLower = (d.title || '').toLowerCase();

            // Penalty: files above 3 GB are likely series packs. Soft penalise so single episodes win if available, but keep packs as fallback.
            let sizeScore = 0;
            if (!isMovie && sizeMb > 3072) sizeScore = -20;
            
            // Hard reject: HEVC/x265 files because ffmpeg on the server lacks the HEVC decoder
            if (titleLower.includes('hevc') || titleLower.includes('x265') || titleLower.includes('h265')) return { ...d, _score: -999, _sizeMb: sizeMb };
            // Seeder score (0–50): capped at 200 seeders, logarithmic so 10 vs 200 isn't huge
            const seederScore = Math.min(50, seeders > 0 ? Math.log2(seeders + 1) * 10 : 0);

            // Size score (0–40): reward compact files, penalise large ones
            // Sweet spot: 150–500 MB → full 40 pts; 500–800 MB → partial; >800 MB → 0 or negative
            if (sizeMb <= 500) sizeScore += 40;
            else if (sizeMb <= 800) sizeScore += 40 - ((sizeMb - 500) / 300) * 30; // 40→10
            else sizeScore += Math.max(0, 10 - ((sizeMb - 800) / 600) * 10);        // 10→0

            // Group bonus (0–10): reward known small-but-quality encoders
            const groupBonus = PREFERRED_GROUPS.some(g => titleLower.includes(g)) ? 10 : 0;

            // Penalise zero-seeder torrents heavily
            const zeroSeederPenalty = seeders === 0 ? -30 : 0;

            const totalScore = seederScore + sizeScore + groupBonus + zeroSeederPenalty;

            return { ...d, _score: totalScore, _sizeMb: sizeMb };
          });

          // Sort descending by composite score
          scoredResults.sort((a: AnimeToshoResult & { _score: number }, b: AnimeToshoResult & { _score: number }) => b._score - a._score);

          const best = scoredResults[0];
          clearTimeout(timeoutId);

          console.log(`[nyaa] Best match: "${best.title}" | ${((best.total_size || 0) / 1024 / 1024).toFixed(0)} MB | ${best.seeders || 0} seeders | score: ${(best as AnimeToshoResult & { _score: number })._score?.toFixed(1)}`);
          
          return {
            magnetLink: best.magnet_uri,
            torrentUrl: best.torrent_url,
            title: best.title,
            seeders: best.seeders || 0,
            leechers: 0,
            size: formatBytes(best.total_size || 0),
            fileName: best.torrent_name || best.title,
          };
        }
    }

    clearTimeout(timeoutId);
    const err = new Error('Torrent not found') as TorrentSearchError;
    err.reason = 'not-found';
    throw err;
    
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && 'reason' in e) throw e;
    const err = new Error(String(e)) as TorrentSearchError;
    err.reason = 'backend-error';
    throw err;
  }
}

/**
 * Builds the server-side torrent streaming URL.
 * Enriches the magnet link with high-performance trackers.
 */
export function buildTorrentStreamUrl(magnetLink: string, episode?: number, torrentUrl?: string): string {
  const highQualityTrackers = [
    // WSS (Native Browser)
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.btorrent.xyz",
    "wss://tracker.webtorrent.dev",
    // HTTPS/HTTP (Specialized/Anime)
    "https://tr.nyacat.pw:443/announce",
    "http://nyaa.tracker.wf:7777/announce",
    "http://open.acgnxtracker.com/announce",
    // Top UDP (Proxy handled)
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.theoks.net:6969/announce",
    "udp://tracker.srv00.com:6969/announce",
    "udp://tracker.qu.ax:6969/announce",
    "udp://tracker.dler.org:6969/announce"
  ];


  let enrichedMagnet = magnetLink;
  highQualityTrackers.forEach(tr => {
    if (!enrichedMagnet.includes(encodeURIComponent(tr))) {
      enrichedMagnet += `&tr=${encodeURIComponent(tr)}`;
    }
  });


  const baseUrl = import.meta.env.VITE_API_URL || 'https://nyanime-backend-v2.onrender.com';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  let url = `${normalizedBase}/torrent-stream?magnet=${encodeURIComponent(enrichedMagnet)}&transcode=true`;
  if (episode !== undefined) url += `&episode=${episode}`;
  if (torrentUrl) url += `&torrentFile=${encodeURIComponent(torrentUrl)}`;
  return url;
}





function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return 'Unknown';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
