# anipy API Bridge for NyAnime

This folder contains a Python microservice that adapts `anipy-api` to NyAnime's `/aniwatch` action contract.

## Why this exists

NyAnime's main app is Node.js. `anipy-api` is Python.
This bridge lets NyAnime use `anipy-api` as a primary provider via HTTP (`ANIPY_API_URL`).

## Local run

```bash
cd anipy_api_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8788
```

Health check:

```bash
curl "http://127.0.0.1:8788/health"
```

## Environment variables

- `ANIPY_PROVIDERS` (default: `allanime`)
  - Comma-separated provider order, e.g. `allanime,animekai`

## Endpoints used by NyAnime

- `GET /aniwatch/home`
- `GET /aniwatch/search?q=...&page=...`
- `GET /aniwatch/suggestions?q=...`
- `GET /aniwatch/info?id=...`
- `GET /aniwatch/episodes?id=...`
- `GET /aniwatch/servers?episodeId=...`
- `GET /aniwatch/sources?episodeId=...&category=sub|dub`

All responses are wrapped as:

```json
{ "success": true, "data": ... }
```

Errors are wrapped as:

```json
{ "success": false, "error": "..." }
```
