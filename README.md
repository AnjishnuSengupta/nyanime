
<h1 align="center">🌙 NyAnime — Your Gateway to Anime Streaming</h1>

<p align="center">
  <img src="public/og-image.png" alt="NyAnime Banner" width="100%" />
</p>

<p align="center">
  <b>A sleek, modern anime streaming platform.</b><br/>
  Built with love for anime fans. Inspired by Hianime, Zoro, and Ghibli vibes.
</p>

---

> [!TIP]
> **Best experienced when running locally!** Clone this repo and run it on your machine for the smoothest streaming experience with full control over your environment.

---

## 📺 About NyAnime

**NyAnime** is a community-driven anime streaming website with a beautiful dark interface, smooth playback, and real-time scraping for anime content. Designed for accessibility and speed, it's hosted on **Cloudflare Pages** with frontend powered by **React + TypeScript + Vite**.

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
- 🖼️ Dynamic episode thumbnails via CDN
- 🧩 Modular, extendable codebase
- 📱 Fully responsive across devices

---

## 🚀 Tech Stack

| Technology | Description |
|------------|-------------|
| `React 18` | Frontend Framework with TypeScript |
| `Vite` | Fast build tool & dev server |
| `Tailwind CSS` | Utility-first CSS framework |
| `shadcn/ui` | Beautiful, accessible UI components |
| `Firebase Auth` | User authentication & Google Sign-In |
| `Firestore` | Real-time database for user data |
| `MyAnimeList API` | Anime metadata via Jikan API |
| `Aniwatch API` | Video streaming sources |
| `Cloudflare Pages` | Global CDN hosting & deployments |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ (or Bun runtime)
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

# Required - Aniwatch API
VITE_ANIWATCH_API_URL=https://aniwatch-latest.onrender.com
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

---

## 🚀 Deployment

### Cloudflare Pages (Recommended)

This project is configured for **Cloudflare Pages** deployment:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | `18` |

### Other Platforms

NyAnime is a static Vite app and can be deployed to:
- Netlify
- Vercel
- GitHub Pages
- Any static hosting service

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

