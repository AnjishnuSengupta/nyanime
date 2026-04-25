import base64, json, gzip, httpx, os
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Miruro API", version="2.0")

# --- Security Configuration ---
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",")
API_KEY_NAME = "x-api-key"
VALID_API_KEY = os.getenv("API_KEY")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://www.miruro.online/",
}
ANILIST_URL = "https://graphql.anilist.co"
MIRURO_PIPE_URL = "https://www.miruro.online/api/secure/pipe"


def _proxy_img(url: str) -> str:
    return url


def _proxy_deep_images(obj):
    return obj


def _inject_source_slugs(data: dict, anilist_id: int):
    providers = data.get("providers", {})
    for provider_name, provider_data in providers.items():
        if not isinstance(provider_data, dict):
            continue
        episodes = provider_data.get("episodes", {})
        if not isinstance(episodes, dict):
            if isinstance(episodes, list):
                provider_data["episodes"] = {"sub": episodes}
                episodes = provider_data["episodes"]
            else:
                continue
        for category, ep_list in episodes.items():
            if not isinstance(ep_list, list):
                continue
            for ep in ep_list:
                if not isinstance(ep, dict):
                    continue
                if "id" in ep and "number" in ep:
                    orig_id = ep["id"]
                    prefix = orig_id.split(":")[0] if ":" in orig_id else orig_id
                    ep["id"] = (
                        f"watch/{provider_name}/{anilist_id}/{category}/{prefix}-{ep['number']}"
                    )
    return data


async def _fetch_raw_episodes(anilist_id: int) -> dict:
    payload = {
        "path": "episodes",
        "method": "GET",
        "query": {"anilistId": anilist_id},
        "body": None,
        "version": "0.1.0",
    }
    encoded_req = _encode_pipe_request(payload)
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(f"{MIRURO_PIPE_URL}?e={encoded_req}", headers=HEADERS)
        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code, detail="Pipe request failed"
            )
        data = _decode_pipe_response(res.text.strip())
        _deep_translate(data)
        return data


MEDIA_LIST_FIELDS = """
    id
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    genres
    source
    countryOfOrigin
    isAdult
    studios(isMain: true) { nodes { name isAnimationStudio } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
"""

MEDIA_FULL_FIELDS = """
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { large extraLarge color }
    bannerImage
    format
    season
    seasonYear
    episodes
    duration
    status
    averageScore
    meanScore
    popularity
    favourites
    trending
    genres
    tags { name rank isMediaSpoiler }
    source
    countryOfOrigin
    isAdult
    hashtag
    synonyms
    siteUrl
    trailer { id site thumbnail }
    studios { nodes { id name isAnimationStudio siteUrl } }
    nextAiringEpisode { episode airingAt timeUntilAiring }
    startDate { year month day }
    endDate { year month day }
    characters(sort: [ROLE, RELEVANCE], perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
            voiceActors(language: JAPANESE) { id name { full native } image { large } languageV2 }
        }
    }
    staff(sort: RELEVANCE, perPage: 25) {
        edges {
            role
            node { id name { full native } image { large } }
        }
    }
    relations {
        edges {
            relationType(version: 2)
            node {
                id
                title { romaji english native }
                coverImage { large }
                format
                type
                status
                episodes
                meanScore
            }
        }
    }
    recommendations(sort: RATING_DESC, perPage: 10) {
        nodes {
            rating
            mediaRecommendation {
                id
                title { romaji english native }
                coverImage { large }
                format
                episodes
                status
                meanScore
                averageScore
                popularity
                genres
                startDate { year }
            }
        }
    }
    externalLinks { url site type }
    streamingEpisodes { title thumbnail url site }
    stats {
        scoreDistribution { score amount }
        statusDistribution { status amount }
    }
"""


def _translate_id(encoded_id: str) -> str:
    try:
        decoded = base64.urlsafe_b64decode(
            encoded_id + "=" * (4 - len(encoded_id) % 4)
        ).decode()
        if ":" in decoded:
            return decoded
        return encoded_id
    except Exception:
        return encoded_id


def _deep_translate(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "id" and isinstance(value, str):
                obj[key] = _translate_id(value)
            elif isinstance(value, (dict, list)):
                _deep_translate(value)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                _deep_translate(item)


def _decode_pipe_response(encoded_str: str) -> dict:
    try:
        encoded_str += "=" * (4 - len(encoded_str) % 4)
        compressed = base64.urlsafe_b64decode(encoded_str)
        return json.loads(gzip.decompress(compressed).decode("utf-8"))
    except Exception:
        raise ValueError("Failed to decode pipe response")


def _encode_pipe_request(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


async def _anilist_query(query: str, variables: dict = None):
    body = {"query": query}
    if variables:
        body["variables"] = variables
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(ANILIST_URL, json=body)
        if res.status_code != 200:
            raise HTTPException(status_code=500, detail="AniList query failed")
        return res.json().get("data", {})


@app.get("/search")
async def search_anime(
    query: str, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=50)
):
    gql = f"""
    query ($search: String, $page: Int, $perPage: Int) {{
        Page(page: $page, perPage: $perPage) {{
            pageInfo {{ total currentPage lastPage hasNextPage perPage }}
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {{
                {MEDIA_LIST_FIELDS}
            }}
        }}
    }}
    """
    data = await _anilist_query(
        gql, {"search": query, "page": page, "perPage": per_page}
    )
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    response = {
        "page": page_info.get("currentPage", page),
        "perPage": page_info.get("perPage", per_page),
        "total": page_info.get("total", 0),
        "hasNextPage": page_info.get("hasNextPage", False),
        "results": page_data.get("media", []),
    }
    return _proxy_deep_images(response)


@app.get("/suggestions")
async def search_suggestions(query: str = Query(..., min_length=1)):
    gql = """
    query ($search: String) {
        Page(page: 1, perPage: 8) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                id
                title { romaji english }
                coverImage { large }
                format
                status
                startDate { year }
                episodes
            }
        }
    }
    """
    data = await _anilist_query(gql, {"search": query})
    results = []
    for item in data.get("Page", {}).get("media", []):
        results.append(
            {
                "id": item["id"],
                "title": item["title"].get("english") or item["title"].get("romaji"),
                "title_romaji": item["title"].get("romaji"),
                "poster": item["coverImage"]["large"],
                "format": item.get("format"),
                "status": item.get("status"),
                "year": (item.get("startDate") or {}).get("year"),
                "episodes": item.get("episodes"),
            }
        )
    return _proxy_deep_images({"suggestions": results})


@app.get("/filter")
async def filter_anime(
    genre: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    season: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort: str = Query("POPULARITY_DESC"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
):
    args = ["type: ANIME", f"sort: [{sort}]"]
    variables = {"page": page, "perPage": per_page}
    if genre:
        args.append("genre: $genre")
        variables["genre"] = genre
    if tag:
        args.append("tag: $tag")
        variables["tag"] = tag
    if year:
        args.append("seasonYear: $seasonYear")
        variables["seasonYear"] = year
    if season:
        args.append("season: $season")
        variables["season"] = season.upper()
    if format:
        args.append("format: $format")
        variables["format"] = format.upper()
    if status:
        args.append("status: $status")
        variables["status"] = status.upper()
    var_types = ["$page: Int", "$perPage: Int"]
    if genre:
        var_types.append("$genre: String")
    if tag:
        var_types.append("$tag: String")
    if year:
        var_types.append("$seasonYear: Int")
    if season:
        var_types.append("$season: MediaSeason")
    if format:
        var_types.append("$format: MediaFormat")
    if status:
        var_types.append("$status: MediaStatus")
    gql = f"query ({', '.join(var_types)}) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} media({', '.join(args)}) {{ {MEDIA_LIST_FIELDS} }} }} }}"
    data = await _anilist_query(gql, variables)
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    response = {
        "page": page_info.get("currentPage", page),
        "perPage": page_info.get("perPage", per_page),
        "total": page_info.get("total", 0),
        "hasNextPage": page_info.get("hasNextPage", False),
        "results": page_data.get("media", []),
    }
    return _proxy_deep_images(response)


@app.get("/trending")
async def get_trending(page: int = Query(1), per_page: int = Query(20)):
    gql = f"query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} media(type: ANIME, sort: TRENDING_DESC) {{ {MEDIA_LIST_FIELDS} }} }} }}"
    data = await _anilist_query(gql, {"page": page, "perPage": per_page})
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "results": page_data.get("media", []),
        }
    )


@app.get("/popular")
async def get_popular(page: int = Query(1), per_page: int = Query(20)):
    gql = f"query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} media(type: ANIME, sort: POPULARITY_DESC) {{ {MEDIA_LIST_FIELDS} }} }} }}"
    data = await _anilist_query(gql, {"page": page, "per_page": per_page})
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "results": page_data.get("media", []),
        }
    )


@app.get("/upcoming")
async def get_upcoming(page: int = Query(1), per_page: int = Query(20)):
    gql = f"query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} media(type: ANIME, sort: POPULARITY_DESC, status: NOT_YET_RELEASED) {{ {MEDIA_LIST_FIELDS} }} }} }}"
    data = await _anilist_query(gql, {"page": page, "perPage": per_page})
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "results": page_data.get("media", []),
        }
    )


@app.get("/recent")
async def get_recent(page: int = Query(1), per_page: int = Query(20)):
    gql = f"query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} media(type: ANIME, sort: START_DATE_DESC, status: RELEASING) {{ {MEDIA_LIST_FIELDS} }} }} }}"
    data = await _anilist_query(gql, {"page": page, "perPage": per_page})
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "results": page_data.get("media", []),
        }
    )


@app.get("/schedule")
async def get_schedule(page: int = Query(1), per_page: int = Query(20)):
    gql = f"query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ pageInfo {{ total currentPage lastPage hasNextPage perPage }} airingSchedules(notYetAired: true, sort: TIME) {{ episode airingAt timeUntilAiring media {{ {MEDIA_LIST_FIELDS} }} }} }} }}"
    data = await _anilist_query(gql, {"page": page, "perPage": per_page})
    page_data = data.get("Page", {})
    page_info = page_data.get("pageInfo", {})
    results = []
    for item in page_data.get("airingSchedules", []):
        entry = item.get("media", {})
        entry["next_episode"] = item.get("episode")
        entry["airingAt"] = item.get("airingAt")
        entry["timeUntilAiring"] = item.get("timeUntilAiring")
        results.append(entry)
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "results": results,
        }
    )


@app.get("/info/{anilist_id}")
async def get_anime_info(anilist_id: int):
    gql = (
        f"query ($id: Int) {{ Media(id: $id, type: ANIME) {{ {MEDIA_FULL_FIELDS} }} }}"
    )
    data = await _anilist_query(gql, {"id": anilist_id})
    media = data.get("Media")
    if not media:
        raise HTTPException(status_code=404, detail="Anime not found")
    return _proxy_deep_images(media)


@app.get("/anime/{anilist_id}/characters")
async def get_anime_characters(
    anilist_id: int, page: int = Query(1), per_page: int = Query(25)
):
    gql = """query ($id: Int, $page: Int, $perPage: Int) { Media(id: $id, type: ANIME) { id title { romaji english } characters(sort: [ROLE, RELEVANCE], page: $page, perPage: $perPage) { pageInfo { total currentPage lastPage hasNextPage perPage } edges { role node { id name { full native } image { large } } voiceActors { id name { full native } image { large } languageV2 } } } } }"""
    data = await _anilist_query(
        gql, {"id": anilist_id, "page": page, "perPage": per_page}
    )
    media = data.get("Media")
    if not media:
        raise HTTPException(status_code=404, detail="Anime not found")
    chars = media.get("characters", {})
    page_info = chars.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "characters": chars.get("edges", []),
        }
    )


@app.get("/anime/{anilist_id}/relations")
async def get_anime_relations(anilist_id: int):
    gql = """query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english } relations { edges { relationType(version: 2) node { id title { romaji english native } coverImage { large } bannerImage format type status episodes meanScore } } } } }"""
    data = await _anilist_query(gql, {"id": anilist_id})
    media = data.get("Media")
    if not media:
        raise HTTPException(status_code=404, detail="Anime not found")
    return _proxy_deep_images(
        {
            "id": media["id"],
            "title": media["title"],
            "relations": media.get("relations", {}).get("edges", []),
        }
    )


@app.get("/anime/{anilist_id}/recommendations")
async def get_anime_recommendations(
    anilist_id: int, page: int = Query(1), per_page: int = Query(10)
):
    gql = """query ($id: Int, $page: Int, $perPage: Int) { Media(id: $id, type: ANIME) { id title { romaji english } recommendations(sort: RATING_DESC, page: $page, perPage: $perPage) { pageInfo { total currentPage lastPage hasNextPage perPage } nodes { rating mediaRecommendation { id title { romaji english native } coverImage { large } format episodes status meanScore averageScore popularity genres startDate { year } } } } } }"""
    data = await _anilist_query(
        gql, {"id": anilist_id, "page": page, "per_page": per_page}
    )
    media = data.get("Media")
    if not media:
        raise HTTPException(status_code=404, detail="Anime not found")
    recs = media.get("recommendations", {})
    page_info = recs.get("pageInfo", {})
    return _proxy_deep_images(
        {
            "page": page_info.get("currentPage", page),
            "perPage": page_info.get("perPage", per_page),
            "total": page_info.get("total", 0),
            "hasNextPage": page_info.get("hasNextPage", False),
            "recommendations": recs.get("nodes", []),
        }
    )


@app.get("/episodes/{anilist_id}")
async def get_episodes(anilist_id: int):
    data = await _fetch_raw_episodes(anilist_id)
    return _proxy_deep_images(_inject_source_slugs(data, anilist_id))


@app.get("/sources")
async def get_sources(
    episodeId: str = Query(...),
    provider: str = Query(...),
    anilistId: int = Query(...),
    category: str = Query("sub"),
):
    enc_id = base64.urlsafe_b64encode(episodeId.encode()).decode().rstrip("=")
    payload = {
        "path": "sources",
        "method": "GET",
        "query": {
            "episodeId": enc_id,
            "provider": provider,
            "category": category,
            "anilistId": anilistId,
        },
        "body": None,
        "version": "0.1.0",
    }
    encoded_req = _encode_pipe_request(payload)
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(f"{MIRURO_PIPE_URL}?e={encoded_req}", headers=HEADERS)
        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code, detail="Pipe request failed"
            )
        return _proxy_deep_images(_decode_pipe_response(res.text.strip()))


@app.get("/watch/{provider}/{anilist_id}/{category}/{slug}")
async def get_watch_sources(provider: str, anilist_id: int, category: str, slug: str):
    data = await _fetch_raw_episodes(anilist_id)
    prov_data = data.get("providers", {}).get(provider, {})
    ep_list = prov_data.get("episodes", {}).get(category, [])
    target_id = None
    for ep in ep_list:
        orig_id = ep.get("id", "")
        prefix = orig_id.split(":")[0] if ":" in orig_id else orig_id
        generated = f"{prefix}-{ep.get('number')}"
        if generated == slug:
            target_id = orig_id
            break
    if not target_id:
        raise HTTPException(
            status_code=404,
            detail=f"Episode slug '{slug}' not found for provider {provider}",
        )
    return await get_sources(
        episodeId=target_id, provider=provider, anilistId=anilist_id, category=category
    )
