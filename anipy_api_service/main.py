from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from anipy_api.provider import get_provider, LanguageTypeEnum

APP_VERSION = "1.0.0"
ID_PREFIX = "anipy"
DEFAULT_PROVIDER_LIST = "allanime"

app = FastAPI(title="nyanime-anipy-bridge", version=APP_VERSION)


def provider_order() -> List[str]:
    raw = os.getenv("ANIPY_PROVIDERS", DEFAULT_PROVIDER_LIST)
    items = [p.strip().lower() for p in raw.split(",") if p.strip()]
    if not items:
        return ["allanime"]
    seen = set()
    out: List[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def encode_id(provider: str, identifier: str) -> str:
    return f"{ID_PREFIX}::{provider}::{identifier}"


def encode_episode_id(provider: str, identifier: str, episode: str) -> str:
    return f"{ID_PREFIX}::{provider}::{identifier}::{episode}"


def parse_id(value: str) -> Tuple[str, str]:
    parts = value.split("::", 2)
    if len(parts) != 3 or parts[0] != ID_PREFIX:
        raise ValueError("invalid anipy id")
    _prefix, provider, identifier = parts
    return provider, identifier


def parse_episode_id(value: str) -> Tuple[str, str, str]:
    parts = value.split("::", 3)
    if len(parts) != 4 or parts[0] != ID_PREFIX:
        raise ValueError("invalid anipy episode id")
    _prefix, provider, identifier, episode = parts
    return provider, identifier, episode


def list_languages(lang_set: Any) -> List[str]:
    names: List[str] = []
    for item in list(lang_set or []):
        lower = str(item).lower()
        if "dub" in lower:
            names.append("dub")
        if "sub" in lower:
            names.append("sub")
    if not names:
        names = ["sub"]
    return sorted(set(names))


def to_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"ongoing", "currently airing", "airing"}:
        return "Ongoing"
    if raw in {"completed", "finished", "finished airing"}:
        return "Completed"
    if raw:
        return raw.title()
    return "Unknown"


def choose_lang(category: str) -> Any:
    return LanguageTypeEnum.DUB if category == "dub" else LanguageTypeEnum.SUB


def safe_provider(name: str):
    provider = get_provider(name)
    if not provider:
        raise ValueError(f"provider not available: {name}")
    return provider


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "version": APP_VERSION,
        "providers": provider_order(),
    }


@app.get("/aniwatch/home")
def home() -> Dict[str, Any]:
    order = provider_order()
    return {
        "success": True,
        "data": {
            "spotlightAnimes": [],
            "trendingAnimes": [],
            "latestEpisodeAnimes": [],
            "top10Animes": {"today": [], "week": [], "month": []},
            "provider": f"{ID_PREFIX}:{order[0]}",
            "providerPriority": [f"{ID_PREFIX}:{p}" for p in order],
        },
    }


@app.get("/aniwatch/search")
def search(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
) -> Dict[str, Any]:
    # anipy-api does not expose explicit paging in get_search, so page is accepted for API compatibility.
    del page

    last_error: Optional[str] = None
    for provider_name in provider_order():
        try:
            provider = safe_provider(provider_name)
            results = provider.get_search(q)
            if not results:
                continue

            animes = []
            for item in results:
                langs = list_languages(getattr(item, "languages", []))
                animes.append(
                    {
                        "id": encode_id(provider_name, str(item.identifier)),
                        "name": str(item.name),
                        "poster": "",
                        "type": "TV",
                        "episodes": {
                            "sub": 0,
                            "dub": 0,
                        },
                        "_langs": langs,
                    }
                )

            return {
                "success": True,
                "data": {
                    "currentPage": 1,
                    "totalPages": 1,
                    "hasNextPage": False,
                    "provider": f"{ID_PREFIX}:{provider_name}",
                    "animes": animes,
                },
            }
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            continue

    raise HTTPException(status_code=502, detail=last_error or "anipy search failed")


@app.get("/aniwatch/suggestions")
def suggestions(q: str = Query(..., min_length=1)) -> Dict[str, Any]:
    payload = search(q=q, page=1)
    animes = payload["data"]["animes"][:10]
    return {"success": True, "data": [{"id": a["id"], "name": a["name"], "poster": a["poster"]} for a in animes]}


@app.get("/aniwatch/info")
def info(id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    try:
        provider_name, identifier = parse_id(id)
        provider = safe_provider(provider_name)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        info_result = provider.get_info(identifier)

        sub_eps = provider.get_episodes(identifier, LanguageTypeEnum.SUB)
        try:
            dub_eps = provider.get_episodes(identifier, LanguageTypeEnum.DUB)
        except Exception:  # noqa: BLE001
            dub_eps = []

        def map_eps(values: List[Any]) -> List[Dict[str, Any]]:
            out = []
            for ep in values:
                ep_str = str(ep)
                out.append(
                    {
                        "number": float(ep) if isinstance(ep, float) else int(ep),
                        "title": f"Episode {ep_str}",
                        "episodeId": encode_episode_id(provider_name, identifier, ep_str),
                        "isFiller": False,
                    }
                )
            return out

        mapped_sub = map_eps(sub_eps)
        mapped_dub = map_eps(dub_eps)

        return {
            "success": True,
            "data": {
                "id": encode_id(provider_name, identifier),
                "name": str(getattr(info_result, "name", "")),
                "poster": str(getattr(info_result, "image", "") or ""),
                "description": str(getattr(info_result, "synopsis", "") or ""),
                "genres": list(getattr(info_result, "genres", []) or []),
                "stats": {
                    "type": str(getattr(info_result, "type", "TV") or "TV"),
                    "status": to_status(getattr(info_result, "status", "Unknown")),
                    "episodes": {"sub": len(mapped_sub), "dub": len(mapped_dub)},
                },
                "episodes": {
                    "sub": mapped_sub,
                    "dub": mapped_dub,
                },
                "provider": f"{ID_PREFIX}:{provider_name}",
            },
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/aniwatch/episodes")
def episodes(id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    payload = info(id=id)
    sub = payload["data"]["episodes"]["sub"]
    return {
        "success": True,
        "data": {
            "totalEpisodes": len(sub),
            "episodes": sub,
            "provider": payload["data"]["provider"],
        },
    }


@app.get("/aniwatch/servers")
def servers(episodeId: str = Query(..., min_length=1)) -> Dict[str, Any]:
    try:
        provider_name, _identifier, _episode = parse_episode_id(episodeId)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "success": True,
        "data": {
            "episodeId": episodeId,
            "episodeNo": 0,
            "sub": [{"serverId": 1, "serverName": f"anipy-{provider_name}"}],
            "dub": [{"serverId": 1, "serverName": f"anipy-{provider_name}"}],
            "raw": [],
        },
    }


@app.get("/aniwatch/sources")
def sources(
    episodeId: str = Query(..., min_length=1),
    category: str = Query("sub", pattern="^(sub|dub)$"),
) -> Dict[str, Any]:
    try:
        provider_name, identifier, episode = parse_episode_id(episodeId)
        provider = safe_provider(provider_name)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        streams = provider.get_video(identifier, float(episode) if "." in episode else int(episode), choose_lang(category))
        if not isinstance(streams, list):
            streams = [streams]

        seen = set()
        mapped_sources = []
        selected_referrer = None
        subtitle_url = None
        for stream in streams:
            url = str(getattr(stream, "url", "") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)

            resolution = getattr(stream, "resolution", None)
            quality = f"{resolution}p" if isinstance(resolution, int) and resolution > 0 else "auto"
            is_m3u8 = ".m3u8" in url.lower()

            mapped_sources.append(
                {
                    "url": url,
                    "quality": quality,
                    "isM3U8": is_m3u8,
                }
            )
            if not selected_referrer:
                selected_referrer = str(getattr(stream, "referrer", "") or "")
            if not subtitle_url:
                subtitle_url = str(getattr(stream, "subtitle", "") or "")

        if not mapped_sources:
            raise HTTPException(status_code=404, detail="no sources")

        headers = {
            "Referer": selected_referrer or "https://allanime.day",
            "User-Agent": "Mozilla/5.0",
        }
        tracks = []
        if subtitle_url:
            tracks = [{"lang": "English", "url": subtitle_url}]

        return {
            "success": True,
            "data": {
                "headers": headers,
                "sources": mapped_sources,
                "tracks": tracks,
                "subtitles": tracks,
                "provider": f"{ID_PREFIX}:{provider_name}",
            },
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.exception_handler(HTTPException)
def http_exception_handler(_request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": str(exc.detail)})


@app.exception_handler(Exception)
def generic_exception_handler(_request, exc: Exception):
    return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})
