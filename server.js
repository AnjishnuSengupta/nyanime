/**
 * Express server for Render deployment
 * Serves static files and proxies API requests to bypass CORS
 */

import express from 'express';
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
// CLI SYNC API - Sync watch history from ny-cli terminal client
// ============================================================================

// Firebase Admin SDK setup for server-side Firestore access
// We use the Firebase REST API since we don't want to add firebase-admin as a dependency
const FIREBASE_PROJECT_ID = 'nyanime-tech';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Sync watch progress from ny-cli
 * POST /api/cli/sync-watch
 * Headers: X-Firebase-UID (required)
 * Body: { animeId, episodeId, timestamp, episodeNum }
 */
app.post('/api/cli/sync-watch', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const { animeId, episodeId, timestamp, episodeNum } = req.body;
    
    if (!animeId || !episodeId) {
      return res.status(400).json({ error: 'Missing required fields: animeId, episodeId' });
    }
    
    console.log(`[cli-sync] Syncing watch for user ${firebaseUid}: anime=${animeId}, ep=${episodeNum}`);
    
    // First, get the current user document to update history
    const userDocUrl = `${FIRESTORE_BASE}/users/${firebaseUid}`;
    
    const userResponse = await fetch(userDocUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('[cli-sync] Failed to fetch user:', errorText);
      return res.status(404).json({ error: 'User not found or unauthorized' });
    }
    
    const userData = await userResponse.json();
    
    // Parse existing history
    let history = [];
    if (userData.fields?.history?.arrayValue?.values) {
      history = userData.fields.history.arrayValue.values.map(item => {
        const fields = item.mapValue?.fields || {};
        return {
          animeId: parseInt(fields.animeId?.integerValue || '0'),
          episodeId: parseInt(fields.episodeId?.integerValue || '0'),
          progress: parseFloat(fields.progress?.doubleValue || fields.progress?.integerValue || '0'),
          timestamp: parseInt(fields.timestamp?.integerValue || '0'),
          lastWatched: fields.lastWatched?.timestampValue || new Date().toISOString()
        };
      });
    }
    
    // Find or create history entry for this episode
    const existingIndex = history.findIndex(
      item => item.animeId === parseInt(animeId) && item.episodeId === parseInt(episodeId)
    );
    
    const now = new Date().toISOString();
    const newEntry = {
      animeId: parseInt(animeId),
      episodeId: parseInt(episodeId),
      progress: 0, // CLI doesn't track exact progress, just that they watched
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      lastWatched: now
    };
    
    if (existingIndex >= 0) {
      history[existingIndex] = newEntry;
    } else {
      history.push(newEntry);
    }
    
    // Convert history back to Firestore format
    const historyFirestore = {
      arrayValue: {
        values: history.map(item => ({
          mapValue: {
            fields: {
              animeId: { integerValue: String(item.animeId) },
              episodeId: { integerValue: String(item.episodeId) },
              progress: { doubleValue: item.progress },
              timestamp: { integerValue: String(item.timestamp) },
              lastWatched: { timestampValue: item.lastWatched }
            }
          }
        }))
      }
    };
    
    // Update the user document with new history
    const updateUrl = `${userDocUrl}?updateMask.fieldPaths=history`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          history: historyFirestore
        }
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[cli-sync] Failed to update history:', errorText);
      return res.status(500).json({ error: 'Failed to update watch history' });
    }
    
    console.log(`[cli-sync] Successfully synced: anime=${animeId}, ep=${episodeNum}`);
    res.json({ success: true, message: 'Watch history synced' });
    
  } catch (error) {
    console.error('[cli-sync] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * Get user watch history for CLI
 * GET /api/cli/history
 * Headers: X-Firebase-UID (required)
 */
app.get('/api/cli/history', async (req, res) => {
  try {
    const firebaseUid = req.headers['x-firebase-uid'];
    
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Missing X-Firebase-UID header' });
    }
    
    const userDocUrl = `${FIRESTORE_BASE}/users/${firebaseUid}`;
    
    const response = await fetch(userDocUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = await response.json();
    
    // Parse history from Firestore format
    let history = [];
    if (userData.fields?.history?.arrayValue?.values) {
      history = userData.fields.history.arrayValue.values.map(item => {
        const fields = item.mapValue?.fields || {};
        return {
          animeId: parseInt(fields.animeId?.integerValue || '0'),
          episodeId: parseInt(fields.episodeId?.integerValue || '0'),
          progress: parseFloat(fields.progress?.doubleValue || fields.progress?.integerValue || '0'),
          timestamp: parseInt(fields.timestamp?.integerValue || '0'),
          lastWatched: fields.lastWatched?.timestampValue || null
        };
      });
    }
    
    // Sort by lastWatched, most recent first
    history.sort((a, b) => {
      const dateA = a.lastWatched ? new Date(a.lastWatched) : new Date(0);
      const dateB = b.lastWatched ? new Date(b.lastWatched) : new Date(0);
      return dateB - dateA;
    });
    
    res.json({ history });
    
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
