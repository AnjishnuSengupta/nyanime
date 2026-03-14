<div align="center">

<img src="public/og-image.png" alt="NyAnime Banner" width="100%" />

# ✦ NyAnime

<samp>ネコアニメ — Your Cozy Corner for Anime Streaming</samp>

<br/>

[![Version](https://img.shields.io/badge/v2.3.1-a855f7?style=flat-square&label=release)](https://github.com/AnjishnuSengupta/nyanime/releases)
[![Live](https://img.shields.io/badge/nyanime.tech-online-22c55e?style=flat-square&logo=render&logoColor=white)](https://nyanime.tech)
[![License](https://img.shields.io/badge/MIT-3b82f6?style=flat-square&label=license)](LICENSE)
[![Stars](https://img.shields.io/github/stars/AnjishnuSengupta/nyanime?style=flat-square&color=fbbf24)](https://github.com/AnjishnuSengupta/nyanime/stargazers)
[![Instagram](https://img.shields.io/badge/anjishnu.prolly-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/anjishnu.prolly)

<br/>

<kbd>[🌐 **Live Demo**](https://nyanime.tech)</kbd>&nbsp;&nbsp;
<kbd>[🖥️ **Terminal Client**](https://github.com/AnjishnuSengupta/ny-cli)</kbd>&nbsp;&nbsp;
<kbd>[🐛 **Report Bug**](https://github.com/AnjishnuSengupta/nyanime/issues)</kbd>

<br/>

</div>

---

<br/>

## 🎯 What's New in v2.3.1

<table>
<tr>
<td>🔧</td>
<td><b>AnimeKai-First Resolver</b></td>
<td>Uses unofficial AnimeKai REST API first, then falls back to internal provider chain if unavailable</td>
</tr>
<tr>
<td>🎥</td>
<td><b>HLS.js Streaming</b></td>
<td>Native HLS.js player with adaptive quality, replacing iframe embeds</td>
</tr>
<tr>
<td>🛡️</td>
<td><b>CDN Resilience</b></td>
<td>Delayed retry with backoff, referer rotation, and source re-fetch for MegaCloud CDN blocking</td>
</tr>
<tr>
<td>⚡</td>
<td><b>Rapid Episode Switch</b></td>
<td>Three-layer request cancellation (AbortController + signal forwarding + server disconnect detection)</td>
</tr>
<tr>
<td>🎬</td>
<td><b>Skip Intro & Outro</b></td>
<td>One-click skip buttons using API-provided timestamps</td>
</tr>
</table>

<br/>

---

<br/>

## ✨ Features

<div align="center">

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                 │
│   🎬  STREAMING          👤  EXPERIENCE        🔧  TECHNICAL    │
│   ───────────────        ───────────────       ───────────────  │
│                                                                 │
│   ▸ HLS Adaptive         ▸ User Accounts       ▸ React 18 + TS  │
│   ▸ Multi-Server         ▸ Watch History       ▸ Vite 7 Build   │
│   ▸ Sub/Dub Toggle       ▸ Favorites List      ▸ Express 5 API  │
│   ▸ Skip Intro/Outro     ▸ Cross-Device        ▸ HLS.js Player  │
│   ▸ Auto Subtitles       ▸ Custom Avatars      ▸ Self-Hosted    │
│   ▸ Resume Playback      ▸ Dark/Light Mode     ▸ Tailwind CSS   │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯
```

</div>

<br/>

<details>
<summary><b>📺 Video Player Highlights</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🔄 Adaptive Streaming** | HLS.js with automatic quality switching and same-origin stream proxy |
| **⏭️ Skip Intro/Outro** | Smart buttons appear during intro and outro segments |
| **📝 Smart Subtitles** | Auto-selects English, with dropdown for 10+ languages |
| **🔁 Auto-Retry** | Multi-phase error recovery: delayed retry, source re-fetch, embed fallback |
| **📍 Resume Playback** | Continue from exactly where you left off |
| **🎚️ Source Selector** | Switch between multiple streaming servers |

</details>

<details>
<summary><b>👤 User Features</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🔐 Secure Auth** | Firebase authentication with email/password |
| **📜 Watch History** | Track all watched episodes with timestamps |
| **❤️ Favorites** | Save your favorite anime for quick access |
| **☁️ Cloud Sync** | Seamless sync across all your devices |
| **🎨 Customization** | Choose from 50+ anime character avatars |
| **🌓 Themes** | Beautiful dark and light mode support |

</details>

<br/>

---

<br/>

## 🖥️ NY-CLI — Watch from Your Terminal

<div align="center">

```
╔══════════════════════════════════════════╗
║                                          ║
║   $ ny-cli search "one piece"            ║
║                                          ║
║   Searching...                           ║
║   Found: One Piece (1120 eps)            ║
║   Playing episode 1120...                ║
║                                          ║
╚══════════════════════════════════════════╝
```

[![NY-CLI](https://img.shields.io/badge/NY--CLI-Terminal%20Client-a855f7?style=for-the-badge&logo=gnometerminal&logoColor=white)](https://github.com/AnjishnuSengupta/ny-cli)

</div>

Love the command line? **NY-CLI** brings the full NyAnime experience to your terminal!

```bash
# One-line install
curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh

# Or via npm
npm install -g ny-cli
```

<div align="center">

**Features:** `Search` · `Trending` · `Continue Watching` · `Cloud Sync` · `MPV/VLC Support`

👉 [**Get NY-CLI →**](https://github.com/AnjishnuSengupta/ny-cli)

</div>

<br/>

---

<br/>

## 🚀 Quick Start

<br/>

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Firebase** project (for auth & database)

<br/>

### Installation

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/nyanime.git

# Navigate to project
cd nyanime

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev
```

<br/>

### Environment Setup

Create a `.env` file with your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

<br/>

Open **[localhost:8080](http://localhost:8080)** and start watching! 🎉

<br/>

---

<br/>

## 🛠️ Tech Stack

<br/>

<div align="center">

| Layer | Technologies |
|:-----:|:-------------|
| **Frontend** | ![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=flat-square&logo=vite&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) |
| **Backend** | ![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) |
| **Services** | ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black) ![HLS.js](https://img.shields.io/badge/HLS.js-FF6600?style=flat-square&logo=javascript&logoColor=white) |
| **Scraping** | ![AnimeKai API](https://img.shields.io/badge/AnimeKai-API-22c55e?style=flat-square) ![Fallback Chain](https://img.shields.io/badge/Fallback-Consumet%20Providers-a855f7?style=flat-square) |

</div>

<br/>

---

<br/>

## 📦 Deployment

<br/>

### Render (Recommended)

<table>
<tr>
<td><b>Build Command</b></td>
<td><code>npm install && npm run build</code></td>
</tr>
<tr>
<td><b>Start Command</b></td>
<td><code>npm start</code></td>
</tr>
<tr>
<td><b>Health Check</b></td>
<td><code>/health</code></td>
</tr>
</table>

> **Note:** Free tier has ~50s cold start. The app automatically pings the backend on load to minimize delays.

#### Required Env Vars (Render Web Service)

- `NODE_ENV=production`
- `VITE_USE_DIRECT_API=false`
- `VITE_CONSUMET_API_URL=https://consumet.nyanime.tech`
- `CONSUMET_ANIME_PROVIDER=animekai`
- `CONSUMET_ANIME_FALLBACK_PROVIDERS=hianime,kickassanime,animesaturn,animepahe`
- `VITE_ANIMEKAI_UNOFFICIAL_API_URL=https://<your-animekai-python-api-domain>` (optional but recommended)

### Vercel

Vercel is supported via `/api/*` serverless routes in this repo.

#### Required Env Vars (Vercel Project)

- `VITE_CONSUMET_API_URL=https://consumet.nyanime.tech`
- `CONSUMET_ANIME_PROVIDER=animekai`
- `CONSUMET_ANIME_FALLBACK_PROVIDERS=hianime,kickassanime,animesaturn,animepahe`
- `VITE_ANIMEKAI_UNOFFICIAL_API_URL=https://<your-animekai-python-api-domain>` (optional but recommended)

### Do I need to host the Python AnimeKAI API?

Yes, if you want unofficial AnimeKAI scraping in production.

- NyAnime now supports this API as a primary source path.
- If it is unreachable, NyAnime automatically falls back to `/aniwatch` provider flow.
- For production, host it on a separate HTTPS endpoint (Render/Railway/Fly). Do not rely on `localhost`.
- Vercel-hosted Python deployments can return upstream `403` from `anikai.to` for `/api/search` in some regions/IP ranges. If this happens, deploy the Python API on Render and use that URL in `VITE_ANIMEKAI_UNOFFICIAL_API_URL`.

### Host AnimeKAI Python API (Render) - Step by Step

1. Create a new Render **Web Service** from `walterwhite-69/AnimeKAI-API` (or your fork).
2. Set Runtime to `Python 3.10+`.
3. Set Build Command:
	`pip install flask flask-cors requests beautifulsoup4`
4. Set Start Command:
	`python app.py`
5. Set Health Check Path:
	`/`
6. Deploy and copy the public URL, e.g. `https://animekai-api.onrender.com`.
7. In NyAnime deployment (Render or Vercel), set:
	`VITE_ANIMEKAI_UNOFFICIAL_API_URL=https://animekai-api.onrender.com`
8. Redeploy NyAnime.

### Production Checklist

- Use HTTPS for both NyAnime and Python API.
- Keep `VITE_ANIMEKAI_UNOFFICIAL_API_URL` pointing to a stable domain.
- Verify startup logs include:
  `[Health] Unofficial AnimeKAI API active (...)`
- Keep provider fallback env set so playback still works if unofficial API is temporarily down.

<br/>

<br/>

---

<br/>

## 📁 Project Structure

```
nyanime/
├── 📂 src/
│   ├── 📂 components/     # React components
│   │   ├── VideoPlayer    # HLS player with skip buttons
│   │   ├── AnimePlayer    # Episode management
│   │   └── ui/            # shadcn/ui components
│   ├── 📂 pages/          # Route pages
│   ├── 📂 services/       # API services
│   ├── 📂 hooks/          # Custom React hooks
│   └── 📂 config/         # Firebase & API config
├── 📂 api/                # Serverless functions
├── 📂 public/             # Static assets
├── 📄 server.js           # Express server
└── 📄 vite.config.ts      # Vite configuration
```

<br/>

---

<br/>

## 🤝 Contributing

<br/>

Contributions are welcome! Here's how you can help:

```bash
# 1. Fork the repository

# 2. Create your feature branch
git checkout -b feature/amazing-feature

# 3. Commit your changes
git commit -m "feat: add amazing feature"

# 4. Push to the branch
git push origin feature/amazing-feature

# 5. Open a Pull Request
```

<br/>

---

<br/>

## 🔗 Links & Resources

<br/>

<div align="center">

| | |
|:-:|:-:|
| 🌐 **Website** | [nyanime.tech](https://nyanime.tech) |
| 🖥️ **Terminal Client** | [NY-CLI](https://github.com/AnjishnuSengupta/ny-cli) |
| 🎬 **AnimeKai Unofficial API** | [walterwhite-69/animekai-api-unofficial](https://github.com/walterwhite-69/animekai-api-unofficial) |
| 🏗️ **Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md) |

</div>

<br/>

---

<br/>

## 📜 License

<br/>

<div align="center">

This project is licensed under the **MIT License**.

Use freely. Give credit. Build cool things. 💜

</div>

<br/>

---

<br/>

<div align="center">

### ⚠️ Disclaimer

<samp>
This is an educational project. No video content is hosted on our servers.<br/>
All streams are fetched from third-party sources. Use responsibly.
</samp>

<br/>
<br/>

---

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=a855f7&height=100&section=footer" width="100%" />

<br/>

<samp>

*"In a world full of filler episodes, be the main arc."* ✦

</samp>

<br/>

**Made with 💜 by [Anjishnu](https://github.com/AnjishnuSengupta)**

[![Instagram](https://img.shields.io/badge/@anjishnu.prolly-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/anjishnu.prolly)

<br/>

⭐ Star this repo if you found it useful!

</div>
