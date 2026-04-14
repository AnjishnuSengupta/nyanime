"""
AnimeKAI API Bridge for NyAnime

This microservice adapts AnimeKAI scraping to NyAnime's /aniwatch action contract.
It handles all AnimeKAI scraping server-side to avoid CORS and rate-limiting issues.
"""

import os
import re
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AnimeKAI API Bridge")

# Configuration
ANIMEKAI_URL = os.getenv("ANIMEKAI_URL", "https://anikai.to")
ANIMEKAI_SEARCH_URL = f"{ANIMEKAI_URL}/ajax/anime/search"
ANIMEKAI_EPISODES_URL = f"{ANIMEKAI_URL}/ajax/episodes/list"
ANIMEKAI_SERVERS_URL = f"{ANIMEKAI_URL}/ajax/links/list"
ANIMEKAI_LINKS_VIEW_URL = f"{ANIMEKAI_URL}/ajax/links/view"
ENCDEC_URL = os.getenv("ENCDEC_URL", "https://enc-dec.app/api/enc-kai")
ENCDEC_DEC_KAI = os.getenv("ENCDEC_DEC_KAI", "https://enc-dec.app/api/dec-kai")
ENCDEC_DEC_MEGA = os.getenv("ENCDEC_DEC_MEGA", "https://enc-dec.app/api/dec-mega")

ANIMEKAI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

ANIMEKAI_AJAX_HEADERS = {
    **ANIMEKAI_HEADERS,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

ID_SEPARATOR = "::"


async def encode_animekai_token(text: str) -> Optional[str]:
    """Encode token via enc-dec.app"""
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{ENCDEC_URL}?text={text}", headers=ANIMEKAI_HEADERS
                )
                data = response.json()
                if data.get("status") == 200 and data.get("result"):
                    return data["result"]
        except Exception as e:
            print(
                f"[AnimeKAI] Token encoding failed (attempt {attempt}/{max_retries}): {e}"
            )
            if attempt == max_retries:
                return None
            await asyncio.sleep(1.0 * attempt)
    return None


async def decode_animekai_response(encrypted: str) -> Optional[Dict[str, Any]]:
    """Decrypt AnimeKAI response"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                ENCDEC_DEC_KAI, json={"text": encrypted}, headers=ANIMEKAI_HEADERS
            )
            data = response.json()
            if data.get("status") != 200:
                return None
            result = data.get("result")
            if isinstance(result, dict):
                return result
            return json.loads(result)
    except Exception as e:
        print(f"[AnimeKAI] Decryption failed: {e}")
        return None


async def decode_mega_response(encrypted: str) -> Optional[Dict[str, Any]]:
    """Decrypt mega/megacloud media response"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                ENCDEC_DEC_MEGA,
                json={"text": encrypted, "agent": ANIMEKAI_HEADERS["User-Agent"]},
                headers=ANIMEKAI_HEADERS,
            )
            data = response.json()
            if data.get("status") != 200:
                return None
            result = data.get("result")
            if isinstance(result, dict):
                return result
            return json.loads(result)
    except Exception as e:
        print(f"[AnimeKAI] Mega decryption failed: {e}")
        return None


def parse_animekai_info_spans(html: str) -> Dict[str, str]:
    """Parse HTML to extract info spans"""
    if not html:
        return {"sub": "", "dub": "", "type": ""}

    sub_match = re.search(r'<span class="sub">.*?</svg>(\d+)</span>', html)
    dub_match = re.search(r'<span class="dub">.*?</svg>(\d+)</span>', html)
    type_match = re.search(
        r"<b>(TV|MOVIE|OVA|ONA|SPECIAL|MUSIC)</b>", html, re.IGNORECASE
    )

    return {
        "sub": sub_match.group(1) if sub_match else "",
        "dub": dub_match.group(1) if dub_match else "",
        "type": type_match.group(1).upper() if type_match else "TV",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "provider": "animekai"}


@app.get("/aniwatch/home")
async def home():
    """Get home page data"""
    popular_terms = [
        "demon slayer",
        "attack on titan",
        "naruto",
        "one piece",
        "jujutsu kaisen",
        "bleach",
        "dragon ball",
        "my hero academia",
        "death note",
        "fullmetal alchemist",
    ]

    import random

    random_term = random.choice(popular_terms)

    try:
        results = await animekai_search(random_term)
        if results:
            return {
                "success": True,
                "data": {
                    "spotlightAnimes": results[:5],
                    "trendingAnimes": results[:10],
                    "latestEpisodeAnimes": [],
                    "top10Animes": {"today": results[:10], "week": [], "month": []},
                    "provider": "animekai",
                },
            }
    except Exception as e:
        print(f"[AnimeKAI home error]: {e}")

    return {
        "success": True,
        "data": {
            "spotlightAnimes": [],
            "trendingAnimes": [],
            "latestEpisodeAnimes": [],
            "top10Animes": {"today": [], "week": [], "month": []},
            "provider": "animekai",
        },
    }


@app.get("/aniwatch/search")
async def search(q: str = Query(...), page: int = Query(1)):
    """Search for anime"""
    try:
        results = await animekai_search(q)
        if results:
            return {
                "success": True,
                "data": {
                    "currentPage": 1,
                    "totalPages": 1,
                    "hasNextPage": False,
                    "provider": "animekai",
                    "animes": results,
                },
            }
    except Exception as e:
        print(f"[AnimeKAI search error]: {e}")

    raise HTTPException(status_code=502, detail="Search failed")


@app.get("/aniwatch/suggestions")
async def suggestions(q: str = Query(...)):
    """Get search suggestions"""
    try:
        results = await animekai_search(q)
        if results:
            return {
                "success": True,
                "data": [
                    {"id": item["id"], "name": item["name"], "poster": item["poster"]}
                    for item in results[:10]
                ],
            }
    except Exception as e:
        print(f"[AnimeKAI suggestions error]: {e}")

    raise HTTPException(status_code=502, detail="Suggestions failed")


@app.get("/aniwatch/info")
async def info(id: str = Query(...)):
    """Get anime info"""
    if not id.startswith(f"animekai{ID_SEPARATOR}"):
        raise HTTPException(status_code=400, detail="Invalid provider ID")

    slug = id[len(f"animekai{ID_SEPARATOR}") :]

    try:
        info_data = await animekai_info(slug)
        if not info_data.get("aniId"):
            raise HTTPException(status_code=404, detail="Anime not found")

        episodes = await animekai_episodes(info_data["aniId"])

        mapped_sub = [
            {
                "number": ep["number"],
                "title": f"Episode {ep['number']}",
                "episodeId": f"animekai{ID_SEPARATOR}{slug}{ID_SEPARATOR}{ep['token']}",
                "isFiller": False,
            }
            for ep in episodes
            if ep.get("hasSub")
        ]

        mapped_dub = [
            {
                "number": ep["number"],
                "title": f"Episode {ep['number']}",
                "episodeId": f"animekai{ID_SEPARATOR}{slug}{ID_SEPARATOR}{ep['token']}{ID_SEPARATOR}dub",
                "isFiller": False,
            }
            for ep in episodes
            if ep.get("hasDub")
        ]

        return {
            "success": True,
            "data": {
                "id": id,
                "name": info_data.get("title", ""),
                "jname": info_data.get("jname", ""),
                "poster": info_data.get("poster", ""),
                "description": info_data.get("description", ""),
                "stats": {
                    "type": info_data.get("type", "TV"),
                    "status": info_data.get("status", "Unknown"),
                    "episodes": {"sub": len(mapped_sub), "dub": len(mapped_dub)},
                },
                "genres": info_data.get("genres", []),
                "episodes": {"sub": mapped_sub, "dub": mapped_dub},
                "provider": "animekai",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AnimeKAI info error]: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch anime info")


@app.get("/aniwatch/episodes")
async def episodes(id: str = Query(...)):
    """Get episodes list"""
    if not id.startswith(f"animekai{ID_SEPARATOR}"):
        raise HTTPException(status_code=400, detail="Invalid provider ID")

    slug = id[len(f"animekai{ID_SEPARATOR}") :]

    try:
        info_data = await animekai_info(slug)
        if not info_data.get("aniId"):
            raise HTTPException(status_code=404, detail="Anime not found")

        eps = await animekai_episodes(info_data["aniId"])
        mapped = [
            {
                "number": ep["number"],
                "title": f"Episode {ep['number']}",
                "episodeId": f"animekai{ID_SEPARATOR}{slug}{ID_SEPARATOR}{ep['token']}",
                "isFiller": False,
            }
            for ep in eps
            if ep.get("hasSub")
        ]

        return {
            "success": True,
            "data": {
                "totalEpisodes": len(mapped),
                "episodes": mapped,
                "provider": "animekai",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AnimeKAI episodes error]: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch episodes")


@app.get("/aniwatch/servers")
async def servers(episodeId: str = Query(...)):
    """Get available servers for an episode"""
    if not episodeId.startswith(f"animekai{ID_SEPARATOR}"):
        raise HTTPException(status_code=400, detail="Invalid provider ID")

    parts = episodeId[len(f"animekai{ID_SEPARATOR}") :].split(ID_SEPARATOR)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid episode ID format")

    ep_token = parts[1]
    is_dub = len(parts) > 2 and parts[2] == "dub"

    try:
        servers_data = await animekai_servers(ep_token)
        server_list = servers_data.get("dub" if is_dub else "sub", [])

        return {
            "success": True,
            "data": {
                "episodeId": episodeId,
                "episodeNo": 0,
                "sub": []
                if is_dub
                else [
                    {"serverId": i + 1, "serverName": s["name"], "linkId": s["linkId"]}
                    for i, s in enumerate(server_list)
                ],
                "dub": [
                    {"serverId": i + 1, "serverName": s["name"], "linkId": s["linkId"]}
                    for i, s in enumerate(server_list)
                ]
                if is_dub
                else [],
                "raw": [],
            },
        }
    except Exception as e:
        print(f"[AnimeKAI servers error]: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch servers")


@app.get("/aniwatch/sources")
async def sources(
    episodeId: str = Query(...),
    category: str = Query("sub"),
    server: str = Query(""),
):
    """Get streaming sources for an episode"""
    if not episodeId.startswith(f"animekai{ID_SEPARATOR}"):
        raise HTTPException(status_code=400, detail="Invalid provider ID")

    parts = episodeId[len(f"animekai{ID_SEPARATOR}") :].split(ID_SEPARATOR)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid episode ID format")

    ep_token = parts[1]
    is_dub = category == "dub"

    try:
        servers_data = await animekai_servers(ep_token)
        server_list = servers_data.get("dub" if is_dub else "sub", [])

        if not server_list:
            raise HTTPException(status_code=404, detail="No servers available")

        # Find linkId
        link_id = None
        if server and not server.isdigit():
            link_id = server
        else:
            server_num = int(server) if server.isdigit() else 1
            if 0 < server_num <= len(server_list):
                link_id = server_list[server_num - 1]["linkId"]
            else:
                link_id = server_list[0]["linkId"]

        source_data = await animekai_source(link_id)
        if not source_data or not source_data.get("sources"):
            raise HTTPException(status_code=404, detail="No streaming sources found")

        embed_host = "https://megaup.nl"
        if source_data.get("embedUrl"):
            try:
                embed_host = httpx.URL(source_data["embedUrl"]).host
            except:
                pass

        return {
            "success": True,
            "data": {
                "headers": {
                    "Referer": f"{embed_host}/",
                    "Origin": embed_host,
                    "User-Agent": "Mozilla/5.0",
                },
                "sources": [
                    {
                        "url": s.get("file") or s.get("url"),
                        "quality": s.get("label") or "auto",
                        "isM3U8": (s.get("file") or s.get("url") or "").endswith(
                            ".m3u8"
                        ),
                    }
                    for s in source_data["sources"]
                ],
                "tracks": source_data.get("tracks", []),
                "subtitles": [
                    t
                    for t in source_data.get("tracks", [])
                    if t.get("kind") == "captions"
                ],
                "intro": (
                    {
                        "start": source_data["skip"]["intro"][0],
                        "end": source_data["skip"]["intro"][1],
                    }
                    if source_data.get("skip") and source_data["skip"].get("intro")
                    else None
                ),
                "outro": (
                    {
                        "start": source_data["skip"]["outro"][0],
                        "end": source_data["skip"]["outro"][1],
                    }
                    if source_data.get("skip") and source_data["skip"].get("outro")
                    else None
                ),
                "provider": "animekai",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AnimeKAI sources error]: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch sources")


async def animekai_search(query: str) -> List[Dict[str, Any]]:
    """Search AnimeKAI"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            ANIMEKAI_SEARCH_URL,
            params={"keyword": query},
            headers=ANIMEKAI_AJAX_HEADERS,
        )
        data = response.json()

        if data.get("status") != "ok" or not data.get("result", {}).get("html"):
            return []

        html = data["result"]["html"]
        results = []

        item_regex = r'<a class="aitem" href="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)"[\s\S]*?<h6 class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)</h6>[\s\S]*?<div class="info">([\s\S]*?)</div>'

        for match in re.finditer(item_regex, html):
            href, poster, jp_title, title, info_html = match.groups()
            slug = href.replace("/watch/", "")
            info = parse_animekai_info_spans(info_html)

            results.append(
                {
                    "id": f"animekai{ID_SEPARATOR}{slug}",
                    "name": title.strip(),
                    "jname": jp_title,
                    "poster": poster,
                    "type": info["type"],
                    "episodes": {
                        "sub": int(info["sub"]) if info["sub"] else 0,
                        "dub": int(info["dub"]) if info["dub"] else 0,
                    },
                }
            )

        return results


async def animekai_info(slug: str) -> Dict[str, Any]:
    """Get anime info from watch page"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{ANIMEKAI_URL}/watch/{slug}",
            headers=ANIMEKAI_HEADERS,
        )
        html = await response.text()

        # Extract ani_id
        sync_match = re.search(r'<script id="syncData"[^>]*>([^<]+)</script>', html)
        ani_id = ""
        if sync_match:
            try:
                sync_data = json.loads(sync_match.group(1))
                ani_id = sync_data.get("anime_id", "")
            except:
                pass

        # Extract title
        title_match = re.search(
            r'<h1[^>]*class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)</h1>', html
        )
        title = title_match.group(2).strip() if title_match else ""
        jname = title_match.group(1) if title_match else ""

        # Extract description
        desc_match = re.search(r'<div class="desc[^"]*"[^>]*>([\s\S]*?)</div>', html)
        description = (
            re.sub(r"<[^>]+>", "", desc_match.group(1)).strip() if desc_match else ""
        )

        # Extract poster
        poster_match = re.search(r'<img[^>]*itemprop="image"[^>]*src="([^"]+)"', html)
        poster = poster_match.group(1) if poster_match else ""

        # Extract info spans
        info_match = re.search(r'<div class="info">([\s\S]*?)</div>', html)
        info = parse_animekai_info_spans(info_match.group(1) if info_match else "")

        # Extract genres
        genres = []
        genre_section = re.search(
            r"Genres?:\s*<span[^>]*>([\s\S]*?)</span>", html, re.IGNORECASE
        )
        if genre_section:
            genre_links = re.findall(r"<a[^>]*>([^<]+)</a>", genre_section.group(1))
            genres = [link.strip() for link in genre_links]

        # Extract status
        status_match = re.search(
            r"Status:\s*<span[^>]*>[\s\S]*?<a[^>]*>([^<]+)</a>", html, re.IGNORECASE
        )
        status = status_match.group(1).strip() if status_match else "Unknown"

        return {
            "aniId": ani_id,
            "title": title,
            "jname": jname,
            "description": description,
            "poster": poster,
            "sub": int(info["sub"]) if info["sub"] else 0,
            "dub": int(info["dub"]) if info["dub"] else 0,
            "type": info["type"],
            "status": status,
            "genres": genres,
        }


async def animekai_episodes(ani_id: str) -> List[Dict[str, Any]]:
    """Get episodes list"""
    encoded = await encode_animekai_token(ani_id)
    if not encoded:
        return []

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            ANIMEKAI_EPISODES_URL,
            params={"ani_id": ani_id, "_": encoded},
            headers=ANIMEKAI_AJAX_HEADERS,
        )
        data = response.json()

        if not data.get("result"):
            return []

        html = data["result"]
        episodes = []

        a_tag_regex = r'<a\s+[^>]*num="[^"]*"[^>]*>'
        for tag_match in re.finditer(a_tag_regex, html):
            tag = tag_match.group(0)

            num_match = re.search(r'num="(\d+)"', tag)
            langs_match = re.search(r'langs="(\d+)"', tag)
            token_match = re.search(r'token="([^"]*)"', tag)

            if num_match and token_match:
                langs_num = int(langs_match.group(1)) if langs_match else 3
                episodes.append(
                    {
                        "number": int(num_match.group(1)),
                        "token": token_match.group(1),
                        "hasSub": bool(langs_num & 1),
                        "hasDub": bool(langs_num & 2),
                    }
                )

        return episodes


async def animekai_servers(ep_token: str) -> Dict[str, List[Dict[str, str]]]:
    """Get servers for an episode"""
    encoded = await encode_animekai_token(ep_token)
    if not encoded:
        return {"sub": [], "dub": [], "softsub": []}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            ANIMEKAI_SERVERS_URL,
            params={"token": ep_token, "_": encoded},
            headers=ANIMEKAI_AJAX_HEADERS,
        )
        data = response.json()

        html = data.get("result", "")

        def parse_section(data_id: str) -> List[Dict[str, str]]:
            list_items = []
            section_regex = rf'class="server-items[^"]*"[^>]*data-id="{data_id}"[^>]*>([\s\S]*?)(?=<div[^>]*class="server-items|$)'
            match = re.search(section_regex, html)
            if match:
                server_regex = r'data-lid="([^"]*)"[^>]*>([^<]+)'
                for sm in re.finditer(server_regex, match.group(1)):
                    list_items.append(
                        {"linkId": sm.group(1), "name": sm.group(2).strip()}
                    )
            return list_items

        return {
            "sub": parse_section("sub"),
            "softsub": parse_section("softsub"),
            "dub": parse_section("dub"),
        }


async def animekai_source(link_id: str) -> Optional[Dict[str, Any]]:
    """Resolve streaming source"""
    encoded = await encode_animekai_token(link_id)
    if not encoded:
        return None

    async with httpx.AsyncClient(timeout=15.0) as client:
        src_response = await client.get(
            ANIMEKAI_LINKS_VIEW_URL,
            params={"id": link_id, "_": encoded},
            headers=ANIMEKAI_AJAX_HEADERS,
        )
        src_data = src_response.json()

        if not src_data.get("result"):
            return None

        embed_data = await decode_animekai_response(src_data["result"])
        if not embed_data or not embed_data.get("url"):
            return None

        embed_url = embed_data["url"]
        video_id = [x for x in embed_url.split("/") if x][-1].split("?")[0]
        embed_base = (
            embed_url.split("/e/")[0]
            if "/e/" in embed_url
            else embed_url[: embed_url.rfind("/")]
        )

        # Get media data
        media_data = None
        try:
            media_response = await client.get(
                f"{embed_base}/media/{video_id}",
                headers={**ANIMEKAI_HEADERS, "Referer": embed_url},
            )
            if media_response.status_code == 200:
                media_data = media_response.json()
        except:
            pass

        if not media_data:
            return None

        # Decrypt result
        final_data = None
        if media_data.get("result"):
            final_data = await decode_mega_response(media_data["result"])
        elif media_data.get("sources"):
            if isinstance(media_data["sources"], str):
                final_data = await decode_mega_response(media_data["sources"])
            else:
                final_data = media_data

        if not final_data:
            return None

        return {
            "embedUrl": embed_url,
            "skip": embed_data.get("skip", {}),
            "sources": final_data.get("sources", []),
            "tracks": final_data.get("tracks", []),
        }


if __name__ == "__main__":
    import asyncio

    uvicorn.run(app, host="0.0.0.0", port=8789)
