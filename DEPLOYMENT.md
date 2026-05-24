# Production Deployment Guide for NyAnime v2.5.1

## Overview

NyAnime is a **fully self-contained** streaming application that requires:
- **Frontend:** React + Vite (serves static assets)
- **Backend:** Express.js server (handles API + streaming)
- **No external microservices** — AnimeKAI API is queried directly

## Pre-Deployment Checklist ✅

- [x] Frontend builds successfully (`npm run build`)
- [x] Built assets are in `dist/` folder
- [x] Backend serves static files from `dist/` (line 2511 in server.js)
- [x] All API endpoints tested and working
- [x] Streaming works end-to-end (search → episodes → servers → sources → M3U8)
- [x] No external anime API backend needed

## Deployment Platforms

### Option 1: Render (Recommended for Hobby Projects)

#### Setup Steps

1. **Create Web Service (NOT Static Site)**
   - Connect your GitHub repository
   - Runtime: Node.js
   - Build Command: `npm install --include=dev && npm run build`
   - Start Command: `npm start` (or `node server.js`)

2. **Environment Variables**
   Set these in Render dashboard:
   ```
   VITE_FIREBASE_API_KEY=<your_firebase_api_key>
   VITE_FIREBASE_AUTH_DOMAIN=<your_firebase_auth_domain>
   VITE_FIREBASE_PROJECT_ID=<your_firebase_project_id>
   VITE_FIREBASE_STORAGE_BUCKET=<your_firebase_storage_bucket>
   VITE_FIREBASE_MESSAGING_SENDER_ID=<your_firebase_messaging_sender_id>
   VITE_FIREBASE_APP_ID=<your_firebase_app_id>
   VITE_USE_DIRECT_API=false
   CONSUMET_ANIME_PROVIDER=animesaturn
   CONSUMET_ANIME_FALLBACK_PROVIDERS=animepahe,animekai,kickassanime,animeunity
   ```

3. **Deploy**
   - Push to your repository
   - Render automatically deploys on push
   - Takes ~3-5 minutes for first deploy

### Option 2: Vercel

#### Setup Steps

1. **Import Project**
   - Connect your GitHub repository to Vercel
   - Framework: Other (or create custom build)

2. **Build & Deploy Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - **Important:** For streaming to work, you MUST use a Node.js function as a fallback

3. **serverless.yml / API Route Alternative**
   
   If you want full Node.js API support on Vercel, create `api/stream.js`:
   ```javascript
   // Vercel Function to proxy streaming requests
   export default async (req, res) => {
     // Your stream proxy logic
   };
   ```

4. **Environment Variables**
   Same as Render, plus:
   ```
   RENDER_STREAM_PROXY=<your_render_url>
   VITE_STREAM_PROXY_URL=<your_render_url>
   ```

### Option 3: Self-Hosted (Docker)

#### Create Dockerfile
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "server.js"]
```

#### Build & Deploy
```bash
docker build -t nyanime .
docker run -p 3000:3000 -e VITE_FIREBASE_API_KEY=xxx nyanime
```

## Key Configuration Notes

### 1. Static Files Serving
- Backend serves frontend from `dist/` folder (see `server.js:2511`)
- No separate web server needed
- CORS headers automatically set

### 2. Streaming Proxy
- Express.js includes `/stream` proxy endpoint
- Bypasses CORS restrictions for M3U8 playlists
- Rewrite headers to maintain compatibility

### 3. AnimeKAI Integration
- Queries public API at `https://anikai.to`
- No backend hosting needed
- Frontend intelligent server selection (linkId extraction)
- Fallback to Allanime + Consumet if AnimeKAI unavailable

## Post-Deployment Testing

### Test All Endpoints
```bash
# Health check
curl https://your-domain/health

# Search
curl https://your-domain/aniwatch?action=search&q=naruto

# Episodes
curl https://your-domain/aniwatch?action=episodes&id=animekai::naruto-9r5k

# Servers
curl https://your-domain/aniwatch?action=servers&episodeId=animekai::naruto-9r5k::TOKEN&category=sub

# Sources & Stream
curl https://your-domain/aniwatch?action=sources&episodeId=animekai::naruto-9r5k::TOKEN&server=LINKID&category=sub
```

### Test Frontend
1. Open `https://your-domain` in browser
2. Search for an anime
3. Click on an episode
4. Click play button
5. Video should load and stream

## Troubleshooting

### Issue: Build fails with "Module not found"
**Solution:** Run `npm install` before building
```bash
npm install --include=dev
npm run build
```

### Issue: Frontend blank/API 404
**Solution:** Ensure `npm run build` completed successfully and `dist/` exists

### Issue: Streaming returns 404
**Solution:** Check that:
1. Backend is running (port 3000 or env PORT)
2. AnimeKAI API is accessible (`https://anikai.to`)
3. Frontend is sending correct linkId (check browser console)

### Issue: Free-tier server slow/timing out
**Solution:** 
- AnimeKAI queries take 2-3 seconds (normal)
- Add to Render: `TIMEOUT=30` (30 seconds)
- Consider upgrading to Standard plan

## Performance Tips

### For Production
1. Enable gzip compression (Express default)
2. Set `NODE_ENV=production` 
3. Use CDN for static assets (optional, not critical)
4. Monitor API response times in server logs

### Free Tier Optimization
- AnimeKAI caching: Built-in (within request)
- Database: None needed (uses Firebase for user data)
- Memory: ~200MB (fits free tier)
- Network: Reasonable for hobby use

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│         Browser / Client                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│     NyAnime Express.js Server            │
│  (Serves static files + API routes)      │
│                                          │
│  ✓ Frontend (dist/)                     │ 
│  ✓ /aniwatch API endpoints              │
│  ✓ /stream proxy                        │
└──────────────┬───────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
   🎬         📊          🔐
 AnimeKAI  Allanime   Firebase
 (Primary) (Fallback) (Auth + DB)
```

## Summary

- ✅ **Zero external backends needed** — AnimeKAI API is public
- ✅ **Single deployment unit** — Frontend + Backend in one repo
- ✅ **Free tier compatible** — Works on Render/Vercel free plans
- ✅ **Fully tested** — All endpoints verified working
- ✅ **Production ready** — Ready to deploy now

## Next Steps

1. Set up deployment platform (Render recommended)
2. Configure Firebase environment variables
3. Deploy repository
4. Test streaming in browser
5. (Optional) Point custom domain to deployment URL
