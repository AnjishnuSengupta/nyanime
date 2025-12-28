<div align="center">

# 🌙 NyAnime

### Your Gateway to Anime Streaming

<img src="public/og-image.png" alt="NyAnime" width="100%" />

[![Version](https://img.shields.io/badge/version-2.1.0-a855f7?style=for-the-badge)](https://github.com/AnjishnuSengupta/nyanime)
[![Live](https://img.shields.io/badge/status-live-22c55e?style=for-the-badge)](https://nyanime.tech)
[![License](https://img.shields.io/badge/license-MIT-3b82f6?style=for-the-badge)](LICENSE)

[**🌐 Visit Website**](https://nyanime.tech) · [**🖥️ Terminal Client**](https://github.com/AnjishnuSengupta/ny-cli) · [**🐛 Report Bug**](https://github.com/AnjishnuSengupta/nyanime/issues)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎬 Streaming
- HLS video with auto-quality
- Multiple servers & fallback
- Sub/Dub audio switching
- Multi-language subtitles
- Resume from where you left

</td>
<td width="50%">

### 👤 User Experience
- Firebase Authentication
- Watch history & favorites
- Cross-device sync
- Profile customization
- Responsive on all devices

</td>
</tr>
</table>

---

## 🖥️ NY-CLI — Watch from Terminal

<div align="center">

[![NY-CLI](https://img.shields.io/badge/NY--CLI-Terminal%20Client-a855f7?style=for-the-badge&logo=gnometerminal&logoColor=white)](https://github.com/AnjishnuSengupta/ny-cli)

</div>

Love the command line? **NY-CLI** lets you stream anime directly from your terminal with full sync support!

```sh
# Install with one command
curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```

**Features:** Search, trending, continue watching, cloud sync, mpv/vlc support

👉 [**Get NY-CLI**](https://github.com/AnjishnuSengupta/ny-cli)

---

## 🚀 Quick Start

```sh
# Clone & install
git clone https://github.com/AnjishnuSengupta/nyanime.git
cd nyanime && npm install

# Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials

# Run development server
npm run dev
```

Open [localhost:8080](http://localhost:8080) to view.

---

## 🛠️ Tech Stack

| Frontend | Backend | Services |
|:--------:|:-------:|:--------:|
| React 18 + TypeScript | Express.js | Firebase Auth |
| Vite 7 | HLS Proxy | Firestore DB |
| Tailwind CSS | Stream Proxy | Jikan API |
| shadcn/ui | | Aniwatch API |

---

## 📦 Deployment

### Render (Recommended)

| Setting | Value |
|---------|-------|
| **Build** | npm install && npm run build |
| **Start** | npm start |
| **Health** | /health |

Set environment variables in Render dashboard (see \`.env.example\`).

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch (\`git checkout -b feature/cool-feature\`)
3. Commit changes (\`git commit -m 'Add cool feature'\`)
4. Push & open PR

---

## 🔗 Links

<div align="center">

[🌐 Website](https://nyanime.tech) · [🖥️ NY-CLI](https://github.com/AnjishnuSengupta/ny-cli) · [📦 Aniwatch API](https://github.com/ghoshRitesh12/aniwatch-api)

</div>

---

## 📜 License

MIT License — Use freely, give credit.

---

<div align="center">

**⚠️ Disclaimer:** Educational project only. No content is hosted. All streams from third-party sources.

---

*"In a world full of filler episodes, be the main arc."* 💜

</div>
