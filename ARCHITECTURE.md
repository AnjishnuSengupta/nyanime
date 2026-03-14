# NyAnime — Architecture

> Last updated: March 2026

## Overview

NyAnime is a self-hosted anime streaming frontend that now uses an **unofficial AnimeKai REST API** as the primary resolver for search, episodes, servers, and stream sources. When the unofficial API is unavailable or returns unusable results, NyAnime falls back to its internal `/aniwatch` provider chain. The frontend is a React SPA; video playback goes through a same-origin stream proxy to handle CORS and CDN token validation.

```
┌──────────────────────────────────────────────────────────────┐
│                       USER BROWSER                           │
│                                                              │
│   React SPA  ──API──▶  AnimeKai API (primary)               │
│          │               └─ fallback: /aniwatch?action=...  │
│   HLS.js     ──HLS──▶  /stream?url=...       (same origin)  │
│                                                              │
│   Firebase Auth + Firestore (user data, watch history)       │
└──────────────────────────────────────────────────────────────┘
                 │                      │
                 ▼                      ▼
┌────────────────────────┐    ┌──────────────────────┐
│   server.js (Render)   │    │   MegaCloud CDN      │
│   ├─ provider fallback │    │   (video segments)   │
│   ├─ /aniwatch handler │    │                      │
│   └─ /stream proxy     │──▶│   Proxied via        │
│                        │    │   /stream endpoint   │
└───────────┬────────────┘    └──────────────────────┘
            │ fallback providers
            ▼
   ┌──────────────────┐
   │ Consumet sources │
   └──────────────────┘
```

---

## Deployment

| Platform | Role | Config |
|----------|------|--------|
| **Render** (primary) | Express server: static files + fallback API + stream proxy | `server.js`, auto-deploy from `main` |
| **Vercel** (alternative) | Static hosting + serverless functions | `api/aniwatch.ts`, `api/stream.ts` |
| **Cloudflare Pages** (alternative) | Pages + Functions | `functions/aniwatch.ts`, `functions/stream.ts` |
| **Netlify** (alternative) | Static hosting + serverless functions | `netlify/functions/aniwatch.ts`, `netlify/functions/stream.ts`, `netlify.toml` |
| **Vite dev server** | Local development with proxy | `vite.config.ts` proxy rules |


All four platforms share the same fallback provider adapter logic via `/aniwatch` handlers; unofficial AnimeKai API is consumed directly by frontend service layer when configured.

### Required Environment Variables for Non-Render Platforms

MegaCloud CDN blocks datacenter IPs (AWS/Cloudflare/etc.) used by serverless platforms. The Render backend works because it uses raw `http.request()` which avoids bot-detection headers. Non-Render deployments must route streaming through Render.

| Variable | Set On | Purpose |
|----------|--------|---------|
| `RENDER_STREAM_PROXY` | Vercel, Cloudflare, Netlify | Server-side: URL of your Render deployment (e.g., `https://nyanime.onrender.com`). The serverless functions use this as the **primary** streaming path. |

**Example setup for Vercel / Netlify / Cloudflare:**
```bash
# In dashboard → Settings → Environment Variables
RENDER_STREAM_PROXY=https://your-app.onrender.com
```

---

## Key Components

### 1. Express Server (`server.js`)

Runs on Render. Responsibilities:

- **Static file serving** — serves the Vite-built `dist/` folder
- **`/aniwatch` fallback API handler** — provider-chain fallback used when AnimeKai unofficial API is unavailable
- **`/stream` proxy** — proxies M3U8 playlists and video segments to bypass CORS; rewrites M3U8 URLs so all segment requests also go through the proxy
- **Provider health endpoint** — runtime health checks for fallback provider chain
- **Firebase Admin** — server-side user data operations

### 2. Stream Proxy (`/stream` endpoint)

The stream proxy is the most complex part of the server. It uses **Node.js `http`/`https` modules directly** (not `fetch`/`undici`) to avoid automatic `Sec-Fetch-*` headers that CDN WAFs flag as bot traffic.

Flow for an M3U8 request:
```
Browser → /stream?url=<cdn_m3u8>&h=<base64_headers>
  → server.js builds browser-like headers
  → proxyRequest() via http/https.request()
  → If 200: read M3U8 text, rewrite segment URLs to also go through /stream
  → Return rewritten M3U8 to browser
  → HLS.js fetches each segment via /stream?url=<segment_url>
  → Video plays with adaptive quality
```

**CDN resilience features:**
- **Referer rotation** — tries multiple referer values (megacloud.blog, megacloud.tv, hianime.to, etc.) if the initial request fails
- **Delayed retry for rate-limiting** — when CDN returns 400/403 on M3U8, waits 3s then 5s with alternate User-Agent strings before giving up
- **HTML detection** — catches CDN error pages served with 200 OK and retries with different headers

### 3. Source Extraction (AnimeKai primary, `/aniwatch` fallback)

When the client requests streaming sources for an episode:

1. **AnimeKai-first path** — frontend service calls unofficial AnimeKai API flow: `/api/servers/{ep_token}` -> `/api/source/{link_id}`
2. **Fallback provider chain** — if unofficial API fails or returns unusable data, client uses `/aniwatch?action=sources`
3. **Track normalization** — subtitle tracks are normalized and English preference is applied before returning sources to the player
4. **Client disconnect detection** — source-fetch cancellation propagates via AbortSignal to prevent stale processing

### 4. Frontend Service Layer (`aniwatchApiService.ts`)

Handles all API communication from the browser:

- **AnimeKai unofficial primary integration** — supports search -> anime -> episodes -> servers -> source flow
- **Fallback bridge** — falls back to `/aniwatch` provider chain when unofficial API fails
- **Response caching** — `SimpleCache` with TTL-based expiration; `cache.delete()` for cache-busting on retries
- **AbortSignal forwarding** — caller's AbortSignal is wired into the internal AbortController; when the caller aborts (e.g., episode changed), the in-flight fetch is cancelled and `AbortError` is re-thrown (not swallowed)

### 5. AnimePlayer (`AnimePlayer.tsx`)

Orchestrates episode loading:

- **AbortController per episode** — when the episode changes, the previous in-flight source fetch is immediately aborted via `abortRef`
- **Stale source clearing** — `setSources([])` on episode change prevents the VideoPlayer from playing old sources while new ones load
- **Source re-fetch mechanism** — if `VideoPlayer` reports all proxy attempts failed (`onSourcesFailed`), AnimePlayer re-fetches sources with cache busting (up to 2 retries), getting fresh CDN tokens from a new server-side extraction

### 6. VideoPlayer (`VideoPlayer.tsx`)

~1115 lines. Handles HLS playback with extensive error recovery:

**HLS.js error recovery phases:**
1. **Phase 1: Delayed retry** — on `manifestLoadError`, waits 5s then 10s between `startLoad()` cycles (CDN rate limits are time-based). Timer IDs are tracked via `retryTimerRef` and cleaned up on unmount/source-change.
2. **Phase 2: Direct CDN** — bypasses the proxy and tries the raw CDN URL directly (usually fails due to CORS, but worth attempting)
3. **Phase 3: Source re-fetch** — calls `onSourcesFailed()` to trigger AnimePlayer's re-extraction with fresh CDN tokens
4. **Phase 4: Embed iframe fallback** — renders the MegaCloud embed player in an iframe as last resort

**Other features:**
- Skip intro/outro buttons using API-provided timestamps
- Subtitle rendering with language selection
- Episode navigation controls
- Resume playback from saved position
- `fragParsingError` detection — gives up faster when segments are unparseable (HTML error pages)

---

## Rapid Episode Change Handling

Rapidly clicking through episodes was causing API failures because:
1. Old 60-second source fetches continued running while new ones started
2. The server kept processing extractors for abandoned requests
3. Multiple concurrent extractor requests piled up
4. Stale responses arrived after new episodes loaded, confusing state

**Solution — three-layer cancellation:**

| Layer | Mechanism |
|-------|-----------|
| **AnimePlayer** (React) | `AbortController` ref — previous fetch aborted on episode change, sources cleared immediately |
| **aniwatchApiService** (fetch) | External `AbortSignal` forwarded to internal controller; `AbortError` re-thrown (not swallowed as timeout) |
| **server.js** (Express) | `req.socket.destroyed` check at start of each extractor loop iteration — stops processing when client disconnects |

---

## Data Flow

### Searching
```
SearchBar → aniwatchApiService.searchAnime()
  → unofficial AnimeKai `/api/search?keyword=...` (primary)
  → if needed, fallback `/aniwatch?action=search&q=...`
  → returns merged anime candidates with stable IDs
```

### Watching an Episode
```
AnimeDetails page stores resolved episode IDs from service layer
  → User clicks episode
  → VideoPage renders AnimePlayer with aniwatchEpisodeId
  → AnimePlayer calls getStreamingSources(episodeId, audioType)
  → Service tries unofficial AnimeKai source flow first
  → If unavailable, server fallback returns M3U8 URL + headers + subtitles
  → VideoPlayer builds proxy URL: /stream?url=<m3u8>&h=<base64_headers>
  → HLS.js loads proxied M3U8, all segments also proxied
  → Video plays with adaptive quality
```

### Authentication
```
SignIn/SignUp → firebaseAuthService → Firebase Auth (email/password, Google)
  → Firestore stores: watch history, favorites, avatar, settings
  → Real-time sync across devices via Firestore listeners
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 7 |
| UI | Tailwind CSS, shadcn/ui (Radix primitives) |
| Video | HLS.js (adaptive streaming) |
| State | TanStack Query (data fetching/caching) |
| Routing | React Router |
| Auth | Firebase Auth + Firestore |
| Scraping | Unofficial AnimeKai API (primary) + fallback provider adapters |
| Server | Express 5, Node.js |
| Hosting | Render (primary), Vercel / Cloudflare (alternative) |

---

## File Structure

```
nyanime/
├── server.js                   # Express server (Render deployment)
├── vite.config.ts              # Vite config with dev proxy + aniwatch scraper
├── api/
│   ├── aniwatch.ts             # Vercel serverless — aniwatch API
│   └── stream.ts               # Vercel serverless — stream proxy
├── functions/
│   ├── aniwatch.ts             # Cloudflare Pages function — aniwatch API
│   └── stream.ts               # Cloudflare Pages function — stream proxy
├── src/
│   ├── components/
│   │   ├── AnimePlayer.tsx     # Episode source loading + abort handling
│   │   ├── VideoPlayer.tsx     # HLS.js player with error recovery
│   │   ├── Header.tsx          # Navigation, search, auth
│   │   ├── HeroSection.tsx     # Homepage hero with trending anime
│   │   ├── SearchBar.tsx       # Search with debounce
│   │   ├── AnimeGrid.tsx       # Grid display for anime cards
│   │   └── ui/                 # shadcn/ui components
│   ├── pages/
│   │   ├── Index.tsx           # Homepage
│   │   ├── AnimeDetails.tsx    # Anime info + episode list
│   │   ├── VideoPage.tsx       # Video player page
│   │   ├── AnimeList.tsx       # Browse/category pages
│   │   ├── Profile.tsx         # User profile
│   │   └── Settings.tsx        # User settings
│   ├── services/
│   │   ├── aniwatchApiService.ts   # API client with abort/cache/retry
│   │   ├── firebaseAuthService.ts  # Firebase auth wrapper
│   │   ├── animeDataService.ts     # Firestore data operations
│   │   └── streamProxyService.ts   # Proxy URL builder
│   ├── hooks/
│   │   ├── useAnimeData.tsx    # Data fetching hooks
│   │   ├── useAnimeDetails.ts  # Anime detail queries
│   │   └── useAnimePlayer.ts   # Player state management
│   └── config/
│       ├── apiConfig.ts        # API base URL configuration
│       └── firebase.ts         # Firebase initialization
├── public/                     # Static assets
├── render.yaml                 # Render deployment config
├── vercel.json                 # Vercel deployment config
├── wrangler.toml               # Cloudflare deployment config
└── docker-compose.yml          # Docker config
```
