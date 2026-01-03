/**
 * Express server for Render deployment
 * Serves static files and proxies API requests to bypass CORS
 */

import express from 'express';
import admin from 'firebase-admin';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy headers (required for Render/Heroku/etc where SSL terminates at load balancer)
// This ensures req.protocol returns 'https' when X-Forwarded-Proto is 'https'
app.set('trust proxy', 1);

// MegaCloud ecosystem domains
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike'  // CDN domains including thunderstrike77.online
];

function getRefererForHost(hostname, customReferer) {
  if (customReferer) return customReferer;
  
  const host = hostname.toLowerCase();
  
  if (MEGACLOUD_DOMAINS.some(domain => host.includes(domain))) {
    return 'https://megacloud.blog/';
  }
  
  if (host.includes('vidcloud') || host.includes('vidstreaming')) {
    return 'https://vidcloud.blog/';
  }
  
  if (host.includes('hianime') || host.includes('aniwatch')) {
    return 'https://hianime.to/';
  }
  
  if (host.includes('gogoanime') || host.includes('gogocdn')) {
    return 'https://gogoanime.cl/';
  }
  
  return 'https://megacloud.blog/';
}

// CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Parse JSON bodies
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Aniwatch API URL - use env var or fallback to deployed backend
const ANIWATCH_API_URL = process.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com';

// Aniwatch API proxy
app.use('/aniwatch', createProxyMiddleware({
  target: ANIWATCH_API_URL,
  changeOrigin: true,
  pathRewrite: (pathStr, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const apiPath = url.searchParams.get('path') || '/api/v2/hianime/home';
    return apiPath;
  },
  onProxyRes: (proxyRes) => {
    proxyRes.headers['access-control-allow-origin'] = '*';
  },
}));

// Consumet API proxy (for anime metadata: search, info, episodes)
const CONSUMET_API_URL = process.env.VITE_CONSUMET_API_URL || 'https://api.consumet.org';

app.use('/consumet', createProxyMiddleware({
  target: CONSUMET_API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/consumet': '', // Remove /consumet prefix when forwarding
  },
  onProxyRes: (proxyRes) => {
    proxyRes.headers['access-control-allow-origin'] = '*';
  },
}));

// Stream proxy for video content - handles M3U8 and video segments
app.get('/stream', async (req, res) => {
  const targetUrl = req.query.url;
  const headersParam = req.query.h;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }
  
  // Parse custom headers if provided (base64 encoded JSON)
  let customHeaders = {};
  if (headersParam) {
    try {
      const decoded = Buffer.from(headersParam, 'base64').toString('utf-8');
      customHeaders = JSON.parse(decoded);
    } catch {
      // Ignore parsing errors
    }
  }
  
  // Get the correct referer for this CDN
  const referer = getRefererForHost(
    target.hostname, 
    customHeaders.Referer || customHeaders.referer
  );
  
  // Build upstream request with browser-like headers
  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Referer': referer,
    'Origin': new URL(referer).origin,
  };
  
  // Merge custom headers
  Object.entries(customHeaders).forEach(([key, value]) => {
    if (value && typeof value === 'string' && key.toLowerCase() !== 'referer') {
      upstreamHeaders[key] = value;
    }
  });
  
  // Forward Range header for partial content requests
  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range;
  }
  
  console.log(`[stream-proxy] Fetching: ${targetUrl.substring(0, 80)}... with Referer: ${referer}`);
  
  // Determine if this is a video segment (may need retry with different referers)
  const pathname = target.pathname.toLowerCase();
  const isVideoSegment = pathname.endsWith('.ts') || pathname.endsWith('.jpg') || 
                         pathname.endsWith('.jpeg') || pathname.endsWith('.mp4') || 
                         pathname.endsWith('.m4s') || pathname.endsWith('.key');
  
  try {
    let response = await fetch(target.toString(), {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow'
    });
    
    // If segment request failed, try with different referers
    if (!response.ok && isVideoSegment) {
      const refererCandidates = [
        'https://megacloud.blog/',
        'https://megacloud.tv/',
        'https://hianime.to/',
        `${target.protocol}//${target.host}/`,
      ];
      
      for (const ref of refererCandidates) {
        const retryHeaders = { ...upstreamHeaders, 'Referer': ref, 'Origin': new URL(ref).origin };
        const retryResp = await fetch(target.toString(), {
          method: 'GET',
          headers: retryHeaders,
          redirect: 'follow'
        });
        if (retryResp.ok) {
          response = retryResp;
          console.log(`[stream-proxy] Segment retry with Referer=${ref} succeeded`);
          break;
        }
      }
    }
    
    if (!response.ok) {
      console.error(`[stream-proxy] Upstream error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.statusText}`,
        status: response.status
      });
    }
    
    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || 
                   contentType.toLowerCase().includes('x-mpegurl') ||
                   target.pathname.endsWith('.m3u8');
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // For non-M3U8 content (video segments), stream directly
    if (!isM3U8) {
      // Copy relevant headers
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
        const val = response.headers.get(h);
        if (val) res.set(h, val);
      });
      
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(response.status);
      
      // Stream the response
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(value);
        }
      };
      pump().catch(err => {
        console.error('[stream-proxy] Stream error:', err);
        res.end();
      });
      return;
    }
    
    // For M3U8 playlists, read and rewrite URLs
    const text = await response.text();
    
    // Validate M3U8 content
    if (!text.includes('#EXTM3U') && !text.includes('#EXT')) {
      res.set('Content-Type', contentType || 'text/plain');
      return res.send(text);
    }
    
    // Rewrite URLs in M3U8 playlist to go through our proxy
    const baseUrl = new URL('.', target.toString()).toString();
    // Use X-Forwarded-Proto header to detect HTTPS (Render/Heroku/etc terminate SSL at load balancer)
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const proxyBase = `${protocol}://${req.get('host')}/stream?`;
    const headersB64 = Buffer.from(JSON.stringify({ Referer: referer })).toString('base64');
    
    const rewritten = text.split('\n').map(line => {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      
      // Handle relative and absolute URLs
      let absoluteUrl;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith('/')) {
        absoluteUrl = `${target.origin}${trimmed}`;
      } else {
        absoluteUrl = `${baseUrl}${trimmed}`;
      }
      
      return `${proxyBase}url=${encodeURIComponent(absoluteUrl)}&h=${headersB64}`;
    }).join('\n');
    
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');
    res.send(rewritten);
    
  } catch (error) {
    console.error('[stream-proxy] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch stream', details: error.message });
  }
});

// ============================================================================
// CLI SYNC API - Synchronize watch history from ny-cli terminal client
// Uses the SAME history field as the website for unified Continue Watching
// ============================================================================

// Initialize Firebase Admin SDK (only once)
let firebaseAdminInitialized = false;
function initFirebaseAdmin() {
  if (firebaseAdminInitialized) return;
  
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[firebase-admin] Initialized with service account');
    } else {
      console.warn('[firebase-admin] No FIREBASE_SERVICE_ACCOUNT env var found');
      return;
    }
    firebaseAdminInitialized = true;
  } catch (error) {
    console.error('[firebase-admin] Failed to initialize:', error.message);
  }
}

// Initialize on module load
initFirebaseAdmin();

// Get Firestore instance
const getDb = () => {
  if (!firebaseAdminInitialized) {
    throw new Error('Firebase Admin not initialized - check FIREBASE_SERVICE_ACCOUNT env var');
  }
  return admin.firestore();
};

// Fetch anime info from aniwatch API to get malId
async function getAnimeInfo(animeSlug) {
  try {
    const response = await fetch(`https://nyanime-backend-v2.onrender.com/api/v2/hianime/anime/${animeSlug}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      malId: data.data?.anime?.info?.malId || 0,
      title: data.data?.anime?.info?.name || animeSlug
    };
  } catch (error) {
    console.error('[getAnimeInfo] Error:', error.message);
    return null;
  }
}

/**
 * Sync watch progress from ny-cli
 * POST /api/cli/sync-watch
 * Headers: X-Firebase-UID (required)
 * Body: { animeSlug, animeTitle, episodeNum, malId (optional) }
 * 
 * Stores in the SAME history field as the website uses
 */
app.post('/api/cli/sync-watch', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const { animeSlug, animeTitle, episodeNum, malId: providedMalId } = req.body;
    
    if (!animeSlug || !animeTitle) {
      return res.status(400).json({ error: 'Missing required fields: animeSlug, animeTitle' });
    }
    
    console.log(`[cli-sync] Syncing for user ${firebaseUid}: ${animeTitle} (${animeSlug}), ep=${episodeNum}`);
    
    // Get malId - either from request or fetch from API
    let malId = parseInt(providedMalId) || 0;
    if (!malId) {
      const animeInfo = await getAnimeInfo(animeSlug);
      if (animeInfo) {
        malId = animeInfo.malId;
      }
    }
    
    const db = getDb();
    const userRef = db.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let history = userData.history || [];
    
    // Use malId as animeId, episodeNum as episodeId (same format as website)
    const animeId = malId;
    const episodeId = parseInt(episodeNum) || 1;
    
    // Find existing entry for this anime (by animeId/malId)
    const existingIndex = history.findIndex(item => item.animeId === animeId);
    
    const now = new Date();
    const newEntry = {
      animeId,
      episodeId,
      progress: 0, // CLI doesn't track exact progress
      timestamp: Math.floor(now.getTime() / 1000),
      lastWatched: now,
      // Add slug for CLI compatibility
      animeSlug,
      animeTitle
    };
    
    if (existingIndex >= 0) {
      // Update existing - keep animeSlug if we have it, update episode
      history[existingIndex] = {
        ...history[existingIndex],
        ...newEntry
      };
    } else {
      // Add new entry at the front
      history.unshift(newEntry);
    }
    
    // Keep only last 100 entries
    history = history.slice(0, 100);
    
    // Update user document
    await userRef.update({ history });
    
    console.log(`[cli-sync] Successfully synced: ${animeTitle} ep ${episodeNum} (malId: ${malId})`);
    res.json({ success: true, message: 'Watch history synced', malId });
    
  } catch (error) {
    console.error('[cli-sync] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * Get watch history for CLI
 * GET /api/cli/history
 * Headers: X-Firebase-UID (required)
 * 
 * Returns the SAME history as the website, with slug info for CLI
 */
app.get('/api/cli/history', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const db = getDb();
    const userRef = db.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let history = userData.history || [];
    
    // Sort by lastWatched, most recent first
    history.sort((a, b) => {
      const dateA = a.lastWatched?.toDate ? a.lastWatched.toDate() : new Date(a.lastWatched || a.timestamp * 1000 || 0);
      const dateB = b.lastWatched?.toDate ? b.lastWatched.toDate() : new Date(b.lastWatched || b.timestamp * 1000 || 0);
      return dateB - dateA;
    });
    
    // Convert to CLI-friendly format
    history = history.map(item => ({
      animeId: item.animeId,
      animeSlug: item.animeSlug || '',
      animeTitle: item.animeTitle || '',
      episodeNum: item.episodeId,
      progress: item.progress || 0,
      lastWatched: item.lastWatched?.toDate ? item.lastWatched.toDate().toISOString() : item.lastWatched
    }));
    
    res.json({ success: true, history });
    
  } catch (error) {
    console.error('[cli-history] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
