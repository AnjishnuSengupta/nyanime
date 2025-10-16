
<h1 align="center">🌙 NyAnime — Your Gateway to Anime Streaming</h1>

<p align="center">
  <img src="public/og-image.png" alt="NyAnime Banner" width="100%" />
</p>

<p align="center">
  <b>A sleek, modern anime streaming platform.</b><br/>
  Built with love for anime fans. Inspired by Hianime, Zoro, and Ghibli vibes.
</p>

---

## 📺 About NyAnime

**NyAnime** is a community-driven anime streaming website with a beautiful dark interface, smooth playback, and real-time scraping for anime content. Designed for accessibility and speed, it's hosted on **Vercel** with frontend powered by **React + TypeScript + Vite**.

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

| Technology        | Description                       |
|-------------------|-----------------------------------|
| `React + TypeScript` | Frontend Framework              |
| `Vite`            | Fast build tool for development   |
| `Tailwind CSS`    | Utility-first CSS framework       |
| `Radix UI`        | Accessible UI components          |
| `Firebase Auth`   | User authentication & Google Sign-In |
| `Firestore`       | Real-time database for user data  |
| `MyAnimeList API` | Anime metadata & information      |
| `Aniwatch API`    | Video streaming sources           |
| `Vercel`          | Hosting & deployments             |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ or Bun runtime
- Firebase account (for authentication)
- Docker (for running Aniwatch API locally)

### Installation

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/nyanime.git

# Navigate into the project directory
cd nyanime

# Install dependencies (using bun)
bun install

# Or using npm
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Aniwatch API URL (local development)
VITE_ANIWATCH_API_URL=http://localhost:4000
```

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable **Authentication** → Email/Password and Google Sign-In
4. Enable **Firestore Database**
5. Deploy security rules:
```bash
bun run firebase:deploy:rules
```

### Aniwatch API Setup (Local Development)

The app uses the [Aniwatch API](https://github.com/ghoshRitesh12/aniwatch-api) for video streaming sources.

**Start the API using Docker:**

```bash
# Start the API
docker compose up -d

# Check if running
docker ps | grep nyanime-api

# View logs
docker compose logs -f
```

The API will be available at `http://localhost:4000`.

### Development

```bash
# Start development server
bun run dev

# Or with npm
npm run dev
```

Visit `http://localhost:8080` in your browser.

### Build for Production

```bash
# Build the project
bun run build

# Preview production build
bun run preview
```

---

## 🚀 Production Deployment

For detailed production deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Quick Overview:

1. **Deploy Aniwatch API** to Render/Railway (see DEPLOYMENT.md)
2. **Update `.env.production`** with your production API URL
3. **Deploy Frontend** to Vercel/Netlify
4. **Configure CORS** on your API to allow your frontend domain

---

## 💡 Why NyAnime?

- ✅ No ads. No paywall. Pure streaming.
- 🔐 Secure authentication with Google Sign-In
- 💾 Save your watch history and favorites
- 🔄 Real-time sync across all your devices
- 🎬 Multiple streaming sources for reliability
- 🧩 Open-source — contribute & fork freely.
- 🌐 Perfect for anime fans who want a better experience
- ❤️ Built with love by anime lovers

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🔧 Available Scripts

```bash
# Development
bun run dev              # Start dev server

# Building
bun run build            # Build for production
bun run preview          # Preview production build

# Firebase
bun run firebase:deploy:rules    # Deploy Firestore rules
bun run firebase:deploy:indexes  # Deploy Firestore indexes
bun run firebase:deploy          # Deploy all Firebase configs
```

---

## 🌐 Links

- 🔗 **Website:** [nyanime.tech](https://nyanime.tech)
- � **Firebase Project:** nyanime-tech
- 📚 **API Used:** [Consumet API](https://consumet.org/)
- 💬 **Support:** Open an issue on GitHub

---

## � Authentication Features

- **Email/Password Authentication**: Traditional sign-up and login
- **Google One-Tap Sign-In**: Quick and secure authentication
- **Persistent Sessions**: Stay logged in across browser sessions
- **User Profiles**: Personalized experience with watch history
- **Real-time Sync**: Firestore keeps your data updated everywhere

## 📊 Firestore Database Structure

```
users/
  └── {userId}/
      ├── id: string
      ├── username: string
      ├── email: string
      ├── avatar?: string
      ├── createdAt: Timestamp
      ├── watchlist: Array
      ├── history: Array
      └── favorites: Array
```

## 🚀 Deployment

### Vercel (Recommended)

1. Import your repository to Vercel
2. Add environment variables in project settings
3. Deploy

### Other Platforms

The app is a static Vite app and can be deployed to:
- Netlify
- Cloudflare Pages
- GitHub Pages
- Any static hosting service

**Important**: Add your production domain to Firebase Console → Authentication → Authorized domains

---

## 📜 License

MIT License — use freely, just don't forget to give credit!

---

## ⚠️ Disclaimer

This project is for educational purposes only. NyAnime does not host any anime content. All streaming sources are scraped from publicly available third-party providers.

---

> _"In a world full of filler episodes, be the main arc."_ — NyAnime 💜

