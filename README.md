
<h1 align="center">🌙 NyAnime — Your Gateway to Anime Streaming</h1>

<p align="center">
  <img src="public/og-image.png" alt="NyAnime Banner" width="100%" />
</p>

<p align="center">
  <b>A sleek, modern anime streaming platform.</b><br/>
  Built with love for anime fans. Inspired by Hianime, Zoro, and Ghibli vibes.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-purple" alt="Version 2.0.0" />
  <img src="https://img.shields.io/badge/status-live-green" alt="Status: Live" />
  <img src="https://img.shields.io/badge/platform-nyanime.tech-blue" alt="nyanime.tech" />
</p>

---

> [!TIP]
> **Now fully working on [nyanime.tech](https://nyanime.tech)!** Experience smooth anime streaming with HLS video playback, subtitle support, and user authentication.

---

## 📺 About NyAnime

**NyAnime** is a community-driven anime streaming website with a beautiful dark interface, smooth playback, and real-time scraping for anime content. Designed for accessibility and speed, it's hosted on **Render** with frontend powered by **React + TypeScript + Vite**.

> ❝ Created for fans, by fans. Inspired by the community, backed by clean code. ❞

---

## ✨ Features

- 🎨 Aesthetic, dark-themed UI with modern design
- ⚡️ Fast loading with optimized lazy loading
- 🔍 Browse, search, and stream anime episodes
- 🔐 Firebase Authentication with Google One-Tap Sign-In
- 👤 User profiles with watch history and favorites
- 📊 Real-time sync across devices with Firestore
- 🎬 Multiple streaming sources with automatic fallback
- 🎯 HLS video streaming with error recovery
- 📝 **Subtitle support** with language selection (Off/English/etc.)
- 🔊 **Audio type switching** (Sub/Dub)
- 🖼️ Dynamic episode thumbnails via CDN
- 🧩 Modular, extendable codebase
- 📱 Fully responsive across devices

---

## 🚀 Tech Stack

| Technology | Description |
|------------|-------------|
| `React 18` | Frontend Framework with TypeScript |
| `Vite 7` | Fast build tool & dev server |
| `Tailwind CSS` | Utility-first CSS framework |
| `shadcn/ui` | Beautiful, accessible UI components |
| `HLS.js` | HTTP Live Streaming for video playback |
| `Firebase Auth` | User authentication & Google Sign-In |
| `Firestore` | Real-time database for user data |
| `Jikan API` | Anime metadata from MyAnimeList |
| `Consumet API` | Anime search and episode info |
| `Aniwatch API` | Video streaming sources |
| `Render` | Web service hosting with stream proxy |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ 
- Firebase account (for authentication)
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/nyanime.git
cd nyanime

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev
```

Visit `http://localhost:8080` in your browser.

### Environment Configuration

Create a `.env` file in the root directory (see `.env.example` for all options):

```env
# Required - Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Aniwatch API (your deployed backend)
VITE_ANIWATCH_API_URL=your_backend_url

# Optional - Consumet API for anime metadata
VITE_CONSUMET_API_URL=https://api.consumet.org
```

> [!NOTE]
> Get your Firebase credentials from [Firebase Console](https://console.firebase.google.com/) → Project Settings → Your Apps → Web App

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 8080 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm start` | Start production server (server.js) |

---

## 🚀 Deployment

### Render (Recommended)

This project is configured for **Render Web Service** deployment with stream proxy:

| Setting | Value |
|---------|-------|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Runtime | Node |
| Health check path | `/health` |

The Express server (`server.js`) handles:
- Static file serving from `dist/`
- HLS stream proxying at `/stream`
- Aniwatch API proxying at `/aniwatch`
- Consumet API proxying at `/consumet`

### Environment Variables on Render

Set these in your Render dashboard:

| Variable | Value |
|----------|-------|
| `VITE_ANIWATCH_API_URL` | Your Backend URL |
| `VITE_USE_DIRECT_API` | `false` |
| `VITE_FIREBASE_*` | Your Firebase config values |

### Backend (Aniwatch API)

Deploy your own [aniwatch-api](https://github.com/ghoshRitesh12/aniwatch-api) instance:

```bash
# Clone aniwatch-api
git clone https://github.com/ghoshRitesh12/aniwatch-api.git
cd aniwatch-api

# Deploy to Render as a separate web service
# Build: npm install
# Start: npm start
```

### Other Platforms

NyAnime can also be deployed to:

- Vercel (with API routes)
- Railway
- Fly.io
- Any Node.js hosting service

> [!IMPORTANT]
> Add your production domain to **Firebase Console** → **Authentication** → **Settings** → **Authorized domains**

---

## 📊 Project Structure

```
nyanime/
├── src/
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── services/       # API services
│   ├── hooks/          # Custom React hooks
│   ├── config/         # Configuration files
│   └── lib/            # Utilities
├── public/             # Static assets
├── wrangler.toml       # Cloudflare Pages config
└── .env.example        # Environment template
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🌐 Links

- 🔗 **Website:** [nyanime.tech](https://nyanime.tech)
- 📚 **Aniwatch API:** [aniwatch-api](https://github.com/ghoshRitesh12/aniwatch-api)
- 💬 **Support:** Open an issue on GitHub

---

## 📜 License

MIT License — use freely, just don't forget to give credit!

---

## ⚠️ Disclaimer

This project is for educational purposes only. NyAnime does not host any anime content. All streaming sources are scraped from publicly available third-party providers.

---

> _"In a world full of filler episodes, be the main arc."_ — NyAnime 💜

