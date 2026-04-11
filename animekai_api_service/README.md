# AnimeKAI API Bridge for NyAnime

This Python microservice handles all AnimeKAI scraping server-side to avoid CORS and rate-limiting issues when deployed on Render.

## Why This Exists

The main NyAnime app runs on Node.js and previously scraped AnimeKAI directly. However, on Render:
- Direct scraping from Node.js was getting blocked/rate-limited
- CORS issues prevented frontend from accessing AnimeKAI directly
- Token encoding/decoding via `enc-dec.app` was unreliable from some hosting providers

This Python service centralizes all AnimeKAI scraping logic and provides a clean REST API that the main NyAnime server can call.

## Deployment to Render

### Option 1: Deploy as a Separate Render Service (Recommended)

1. **Deploy the AnimeKAI API service:**
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your repository
   - Set **Root Directory**: `animekai_api_service`
   - Set **Build Command**: `pip install -r requirements.txt`
   - Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Set **Environment**: Python 3
   - Add environment variables:
     - `ANIMEKAI_URL`: `https://anikai.to`
     - `ENCDEC_URL`: `https://enc-dec.app/api/enc-kai`
     - `ENCDEC_DEC_KAI`: `https://enc-dec.app/api/dec-kai`
     - `ENCDEC_DEC_MEGA`: `https://enc-dec.app/api/dec-mega`
   - Deploy

2. **Update the main NyAnime service:**
   - After deployment, copy the AnimeKAI API URL (e.g., `https://animekai-api-xxxx.onrender.com`)
   - Go to the main `nyanime` service settings
   - Add environment variable:
     - `ANIMEKAI_API_URL`: `https://animekai-api-xxxx.onrender.com`
   - Redeploy the main service

3. **Test the integration:**
   ```bash
   # Test AnimeKAI API health
   curl https://animekai-api-xxxx.onrender.com/health
   
   # Test search
   curl "https://animekai-api-xxxx.onrender.com/aniwatch/search?q=naruto"
   ```

### Option 2: Run Locally for Testing

```bash
cd animekai_api_service

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the service
uvicorn main:app --host 0.0.0.0 --port 8789
```

Test endpoints:
```bash
# Health check
curl http://localhost:8789/health

# Search
curl "http://localhost:8789/aniwatch/search?q=naruto"

# Get anime info
curl "http://localhost:8789/aniwatch/info?id=animekai::naruto-9r5k"

# Get episodes
curl "http://localhost:8789/aniwatch/episodes?id=animekai::naruto-9r5k"

# Get servers
curl "http://localhost:8789/aniwatch/servers?episodeId=animekai::naruto-9r5k::TOKEN"

# Get streaming sources
curl "http://localhost:8789/aniwatch/sources?episodeId=animekai::naruto-9r5k::TOKEN&category=sub&server=1"
```

## API Endpoints

All endpoints follow the NyAnime `/aniwatch` action contract:

| Endpoint | Method | Parameters | Description |
|----------|--------|------------|-------------|
| `/health` | GET | - | Health check |
| `/aniwatch/home` | GET | - | Get home page data |
| `/aniwatch/search` | GET | `q`, `page` | Search for anime |
| `/aniwatch/suggestions` | GET | `q` | Get search suggestions |
| `/aniwatch/info` | GET | `id` | Get anime info |
| `/aniwatch/episodes` | GET | `id` | Get episodes list |
| `/aniwatch/servers` | GET | `episodeId` | Get available servers |
| `/aniwatch/sources` | GET | `episodeId`, `category`, `server` | Get streaming sources |

All responses are wrapped as:
```json
{
  "success": true,
  "data": { ... }
}
```

Errors:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANIMEKAI_URL` | `https://anikai.to` | Base URL for AnimeKAI |
| `ENCDEC_URL` | `https://enc-dec.app/api/enc-kai` | Token encoding endpoint |
| `ENCDEC_DEC_KAI` | `https://enc-dec.app/api/dec-kai` | Response decryption endpoint |
| `ENCDEC_DEC_MEGA` | `https://enc-dec.app/api/dec-mega` | MegaCloud decryption endpoint |

## How It Works

1. **Main NyAnime server** receives a request from the frontend (e.g., `/aniwatch/search?q=naruto`)
2. **Server checks** if `ANIMEKAI_API_URL` is configured
3. **If configured**: Server calls the AnimeKAI API backend (`GET ${ANIMEKAI_API_URL}/aniwatch/search?q=naruto`)
4. **If not configured** or API fails: Server falls back to direct scraping (for local dev)
5. **AnimeKAI API** handles all scraping, token encoding/decoding, and returns clean JSON
6. **Main server** returns the data to the frontend

This architecture ensures:
- ✅ No CORS issues (server-to-server communication)
- ✅ Better rate limit handling (centralized retries)
- ✅ Consistent behavior across local and production
- ✅ Easy to monitor and debug

## Troubleshooting

### "Search failed for all providers"

1. Check if the AnimeKAI API service is running: `curl https://your-animekai-api.onrender.com/health`
2. Check if `ANIMEKAI_API_URL` is set correctly in the main NyAnime service
3. Check Render logs for both services

### "No streaming sources found"

1. The episode token may have expired (tokens are time-sensitive)
2. The AnimeKAI server may be temporarily down
3. Check if `enc-dec.app` endpoints are accessible

### Slow response times

- First request after idle period may be slow (Render free tier sleeps after 15 minutes)
- Consider upgrading to Render paid tier for always-on service
- Or use a different hosting provider (Fly.io, Railway, etc.)

## Alternative Hosting

If Render free tier is too slow, you can host this service on:

- **Fly.io**: Similar free tier, often faster
- **Railway**: $5/month, always-on
- **Hugging Face Spaces**: Free, but may have limitations
- **Your own VPS**: Full control

Just update the `ANIMEKAI_API_URL` in the main NyAnime service after deployment.
