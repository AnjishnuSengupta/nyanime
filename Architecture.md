# Architecture

```
┌─────────────────────┐
│   React Frontend    │
│  (localhost:8080)   │
└──────────┬──────────┘
           │
           ├─────────────────────────────────────────┐
           │                                         │
           ▼                                         ▼
┌──────────────────────┐              ┌─────────────────────────┐
│   API Calls (JSON)   │              │  Video Streaming (HLS)  │
│                      │              │                         │
│  Search, Episodes,   │              │   M3U8/HLS URLs from    │
│  Anime Info, etc.    │              │   Aniwatch API          │
└──────────┬───────────┘              └──────────┬──────────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────┐              ┌─────────────────────────┐
│   corsproxy.io       │              │   embed-player.com      │
│   (CORS Proxy)       │              │   (Video Player)        │
│                      │              │                         │
│  Adds CORS headers   │              │  Handles video CORS     │
│  to API responses    │              │  internally             │
└──────────┬───────────┘              └──────────┬──────────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────────────────────────────────────┐
│         Aniwatch API (Render Backend)                │
│         https://aniwatch-latest.onrender.com         │
│                                                      │
│         - No CORS headers configured                 │
│         - Requires proxy for browser API calls       │
│         - Video streams proxied by embed-player      │
└──────────────────────────────────────────────────────┘
```