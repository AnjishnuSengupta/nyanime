import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK (only once)
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: 'nyanime-tech',
      });
    }
  } catch (e) {
    console.error('Firebase Admin SDK init error:', e);
  }
}

let db: FirebaseFirestore.Firestore | null = null;
try {
  db = getFirestore();
} catch (e) {
  console.error('Firestore init error:', e);
}

interface SyncWatchRequest {
  animeId: string;      // Anime ID from ny-cli (e.g., "one-piece-100")
  episodeId: string;    // Episode ID (e.g., "one-piece-100?ep=1234")
  timestamp: number;    // Unix timestamp when watched
  episodeNum: number;   // Episode number
  progress?: number;    // Progress percentage (0-100)
}

interface HistoryItem {
  animeId: number;
  episodeId: number;
  progress: number;
  timestamp: number;
  lastWatched: FirebaseFirestore.Timestamp | Date;
  source?: string;
}

// Aniwatch API for fetching anime info
const ANIWATCH_API = process.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com'\;

/**
 * Extract numeric anime ID from ny-cli anime ID string
 * Example: "one-piece-100" -> 100
 */
function extractNumericAnimeId(animeIdStr: string): number | null {
  const match = animeIdStr.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert numeric anime ID back to the string format by searching
 */
async function getAnimeSlugFromId(numericId: number): Promise<{slug: string, title: string} | null> {
  try {
    // Search using the API - this is a workaround since we don't have a direct ID lookup
    const response = await fetch(`${ANIWATCH_API}/api/v2/hianime/anime/${numericId}`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const animeInfo = data?.data?.anime?.info;
    
    if (animeInfo?.id && animeInfo?.name) {
      return {
        slug: animeInfo.id, // This should be the slug like "one-piece-100"
        title: animeInfo.name
      };
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-UID');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!db) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  try {
    const firebaseUid = req.headers['x-firebase-uid'] as string;
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }

    // GET: Fetch user's history with anime slugs for ny-cli
    if (req.method === 'GET') {
      const userRef = db.collection('users').doc(firebaseUid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      const history: HistoryItem[] = userData?.history || [];

      // Convert numeric IDs to slugs for ny-cli compatibility
      const historyWithSlugs = await Promise.all(
        history.slice(0, 20).map(async (item) => {
          const animeInfo = await getAnimeSlugFromId(item.animeId);
          return {
            animeId: item.animeId,
            animeSlug: animeInfo?.slug || null,
            animeTitle: animeInfo?.title || null,
            episodeId: item.episodeId,
            progress: item.progress,
            timestamp: item.timestamp,
            lastWatched: item.lastWatched
          };
        })
      );

      return res.status(200).json({
        success: true,
        history: historyWithSlugs.filter(h => h.animeSlug !== null)
      });
    }

    // POST: Sync watch history from ny-cli
    const body = req.body as SyncWatchRequest;
    
    if (!body.animeId || !body.episodeId) {
      return res.status(400).json({ error: 'Missing animeId or episodeId' });
    }

    const numericAnimeId = extractNumericAnimeId(body.animeId);
    if (!numericAnimeId) {
      return res.status(400).json({ error: 'Invalid animeId format' });
    }

    const episodeNum = body.episodeNum;
    const progress = body.progress || 0;

    const userRef = db.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const currentHistory: HistoryItem[] = userData?.history || [];

    // Find existing entry for this anime (not episode-specific for dedup)
    const existingIndex = currentHistory.findIndex(
      (item) => item.animeId === numericAnimeId
    );

    const newHistoryItem: HistoryItem = {
      animeId: numericAnimeId,
      episodeId: episodeNum,
      progress: progress,
      timestamp: body.timestamp || Date.now() / 1000,
      lastWatched: new Date(),
      source: 'ny-cli'
    };

    let updatedHistory: HistoryItem[];
    if (existingIndex >= 0) {
      updatedHistory = [...currentHistory];
      updatedHistory[existingIndex] = newHistoryItem;
    } else {
      updatedHistory = [newHistoryItem, ...currentHistory];
    }

    await userRef.update({ history: updatedHistory });

    return res.status(200).json({
      success: true,
      message: 'Watch history synced successfully',
      animeId: numericAnimeId,
      episodeId: episodeNum
    });

  } catch (error) {
    console.error('[sync-watch] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
