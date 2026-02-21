# NyAnime — Architecture

> Last updated: July 2025

## Overview

NyAnime is a self-hosted anime streaming frontend that uses the **`aniwatch` npm package** for direct server-side scraping of [hianimez.to](https://hianimez.to). There is **no external hosted API dependency** — all scraping runs inside the same Express process that serves the site. The frontend is a React SPA; video playback goes through a same-origin stream proxy to handle CORS and CDN token validation.

```
┌──────────────────────────────────────────────────────────────┐
│                       USER BROWSER                           │
│                                                              │
│   React SPA  ──API──▶  /aniwatch?action=...  (same origin)  │
│   HLS.js     ──HLS──▶  /stream?url=...       (same origin)  │
│                                                              │
│   Firebase Auth + Firestore (user data, watch history)       │
└──────────────────────────────────────────────────────────────┘
                 │                      │
                 ▼                      ▼
┌────────────────────────┐    ┌──────────────────────┐
│   server.js (Render)   │    │   MegaCloud CDN      │
│   ├─ aniwatch scraper  │    │   (video segments)   │
│   ├─ /aniwatch handler │    │                      │
│   └─ /stream proxy     │──▶│   Proxied via        │
│                        │    │   /stream endpoint   │
└───────────┬────────────┘    └──────────────────────┘
            │ scrapes
            ▼
   ┌──────────────────┐
   │  hianimez.to     │
   └──────────────────┘
```

---

## Deployment

| Platform | Role | Config |
|----------|------|--------|
| **Render** (primary) | Express server: static files + API + stream proxy | `server.js`, auto-deploy from `main` |
| **Vercel** (alternative) | Static hosting + serverless functions | `api/aniwatch.ts`, `api/stream.ts` |
| **Cloudflare Pages** (alternative) | Pages + Functions | `functions/aniwatch.ts`, `functions/stream.ts` |
| **Netlify** (alternative) | Static hosting + serverless functions | `netlify/functions/aniwatch.ts`, `netlify/functions/stream.ts`, `netlify.toml` |
| **Vite dev server** | Local development with proxy | `vite.config.ts` proxy rules |


All four platforms share the same scraping logic — `new HiAnime.Scraper()` from the `aniwatch` npm package.

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

~980 lines. Runs on Render. Responsibilities:

- **Static file serving** — serves the Vite-built `dist/` folder
- **`/aniwatch` API handler** — dispatches `action` query parameter to aniwatch scraper methods (`home`, `search`, `info`, `episodes`, `servers`, `sources`, `category`, `schedule`)
- **`/stream` proxy** — proxies M3U8 playlists and video segments to bypass CORS; rewrites M3U8 URLs so all segment requests also go through the proxy
- **Legacy path handler** — supports old `/api/v2/hianime/...` URL format for backward compatibility
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

### 3. Source Extraction (`/aniwatch?action=sources`)

When the client requests streaming sources for an episode:

1. **Pre-check available servers** — calls `hianime.getEpisodeServers(episodeId)` to see which servers are actually available for the episode
2. **Try extractors in order** — iterates through `['streamtape', 'streamsb', 'hd-1', 'hd-2']`, filtered to only those available
3. **15-second timeout per server** — uses `Promise.race` to cap each extractor attempt
4. **Client disconnect detection** — checks `req.socket.destroyed` before each extractor iteration; stops processing if the client navigated away (prevents wasted server work on rapid episode changes)
5. **Embed URL resolution** — for MegaCloud servers (hd-1/hd-2), resolves an iframe embed URL as fallback

**Server ID mapping** (from the aniwatch npm package):
| Server Name | Server ID | Extractor | Available on hianimez.to |
|-------------|-----------|-----------|--------------------------|
| hd-1 | 4 | MegaCloud | Yes |
| hd-2 | 1 | MegaCloud | Yes |
| streamsb | 5 | StreamSB | No |
| streamtape | 3 | StreamTape | No |

> Both hd-1 and hd-2 use `MegaCloud.extract5()` internally — same CDN infrastructure.

### 4. Frontend Service Layer (`aniwatchApiService.ts`)

~870 lines. Handles all API communication from the browser:

- **Platform-aware routing** — automatically picks the right base URL (`/aniwatch` for Render/dev, `/api/aniwatch` for Vercel)
- **`fetchAction(action, params, timeoutMs, externalSignal)`** — core fetch wrapper with configurable timeout (default 60s) and external AbortSignal support
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
  → fetch /aniwatch?action=search&q=...
  → server.js: hianime.search(query)
  → scrapes hianimez.to search page
  → returns anime list with IDs, posters, episode counts
```

### Watching an Episode
```
AnimeDetails page stores aniwatch episode IDs from hianime.getEpisodes()
  → User clicks episode
  → VideoPage renders AnimePlayer with aniwatchEpisodeId
  → AnimePlayer calls getStreamingSources(episodeId, audioType)
  → server.js tries extractors (hd-1, hd-2) with 15s timeout each
  → Returns M3U8 URL + headers + subtitles + embed URL
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
| Scraping | `aniwatch` npm package (`HiAnime.Scraper`) |
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
