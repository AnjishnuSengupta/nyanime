import os
import uvicorn
import difflib
from typing import Optional
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from anipy_api.provider import LanguageTypeEnum
from anipy_api.provider.providers.allanime_provider import AllAnimeProvider

app = FastAPI(title="Anipy API Bridge")




import re

# Common stopwords to ignore when comparing titles
_STOPWORDS = {"no", "wo", "wa", "ga", "to", "de", "ni", "na", "the", "a", "an", "of"}


def _tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, split into tokens, drop stopwords."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    return [t for t in text.split() if t and t not in _STOPWORDS]


def _extract_season(text: str) -> Optional[int]:
    text = text.lower()
    m = re.search(r'season\s*(\d+)', text)
    if m: return int(m.group(1))
    m = re.search(r'(\d+)(?:st|nd|rd|th)\s*season', text)
    if m: return int(m.group(1))
    m = re.search(r'\bs(\d+)\b', text)
    if m: return int(m.group(1))
    m = re.search(r'part\s*(\d+)', text)
    if m: return int(m.group(1))
    return None

def _clean_title(title: str) -> str:
    """Strip common suffixes to help exact matching."""
    t = title.lower().strip()
    t = re.sub(r'\(tv\)', '', t)
    t = re.sub(r'\(sub\)', '', t)
    t = re.sub(r'\(dub\)', '', t)
    return t.strip()

def _season_penalty(query: str, result_name: str) -> float:
    sq = _extract_season(query)
    sr = _extract_season(result_name)
    
    penalty = 0.0
    if sq is not None and sr is not None:
        if sq != sr: penalty += 2.0  # complete mismatch
    elif sq is not None and sr is None:
        if sq != 1: penalty += 2.0  # query specifies a season 2+, result does not
    elif sq is None and sr is not None:
        if sr != 1: penalty += 2.0  # query has no season (implied 1), result is s2+

    # Heavily penalize movies/specials/ovas if the query does not ask for them
    q_lower = query.lower()
    r_lower = result_name.lower()
    for keyword in ["movie", "special", "ova"]:
        if keyword in r_lower and keyword not in q_lower:
            penalty += 3.0

    return penalty

def _score_match(result_name: str, query: str) -> float:
    """
    Score how well result_name matches query using an F1-style metric:
      - recall    = fraction of query tokens found in result
      - precision = fraction of result tokens that are query tokens
      - F1        = harmonic mean of the two

    This means a result like "Koisuru ONE PIECE" scores lower than "ONE PIECE"
    for the query "One Piece", because precision is penalised by the extra word.
    The raw SequenceMatcher ratio is used as a small tiebreaker.
    """
    q_tokens = _tokenize(query)
    r_tokens = _tokenize(result_name)
    if not q_tokens or not r_tokens:
        return 0.0

    q_set = set(q_tokens)
    r_set = set(r_tokens)

    matches = len(q_set & r_set)
    recall = matches / len(q_set)        # did we find all the words we asked for?
    precision = matches / len(r_set)     # how much of the result is "on topic"?

    if recall + precision == 0:
        f1 = 0.0
    else:
        f1 = 2 * recall * precision / (recall + precision)

    # Fuzzy ratio as a secondary tiebreaker (weight: 10%)
    fuzzy = difflib.SequenceMatcher(None, query.lower().strip(), result_name.lower().strip()).ratio()
    base_score = f1 * 0.9 + fuzzy * 0.1
    
    # Apply season penalty
    penalty = _season_penalty(query, result_name)
    
    return max(0.0, base_score - penalty)

def find_best_match(search_results, query_title: str, query_title_ro: str = ""):
    """
    Find the best matching anime from search results.

    ProviderSearchResult objects expose:
      .name       — display title
      .identifier — opaque ID used for episode/stream lookups
      .languages  — set of LanguageTypeEnum values
    """
    query_lower = _clean_title(query_title)
    query_ro_lower = _clean_title(query_title_ro) if query_title_ro else ""

    if not search_results:
        return None

    best_match = None
    highest_score = -1.0

    for result in search_results:
        result_name = getattr(result, "name", "") or ""
        result_clean = _clean_title(result_name)

        # Exact match (case-insensitive) wins immediately
        if result_clean == query_lower or (query_ro_lower and result_clean == query_ro_lower):
            return result

        score1 = _score_match(result_name, query_title)
        score2 = _score_match(result_name, query_title_ro) if query_title_ro else -1.0
        score = max(score1, score2)
        if score > highest_score:
            highest_score = score
            best_match = result

    return best_match if best_match else search_results[0]



@app.head("/")
@app.get("/")
async def root():
    """Root endpoint to prevent 404s"""
    return {"message": "Anipy API Service is running.", "status": "online"}

@app.head("/health")
@app.get("/health")
async def health_check():
    """Health check endpoint for Render"""
    return {"status": "healthy", "service": "anipy-api"}


@app.get("/episodes")
async def get_episodes_list(
    title: str = Query(..., description="Anime title to search"),
    title_ro: Optional[str] = Query(None, description="Anime title to search (Romaji)"),
    audio: str = Query("sub", description="Audio type (sub or dub)"),
    total_episodes: Optional[int] = Query(None, description="Authoritative episode count from Jikan/MAL")
):
    """
    Fetch episode list.

    If total_episodes is provided (from Jikan), generate a full sequential list
    (1..N) instead of relying on the provider's potentially incomplete scrape.
    """
    try:
        if total_episodes and total_episodes > 0:
            # Use Jikan-supplied count as the authoritative episode list
            formatted_episodes = [{"number": ep} for ep in range(1, total_episodes + 1)]
            return {"episodes": formatted_episodes, "source": "jikan_count"}

        # Fallback: ask the provider for its own episode list
        provider = AllAnimeProvider()
        lang = LanguageTypeEnum.DUB if audio.lower() == "dub" else LanguageTypeEnum.SUB

        # Hardcoded dictionary to map problematic titles to their exact AllAnime identifiers
        # This bypasses fuzzy matching for titles known to have typos in the provider's database
        known_aliases = {
            "one piece": "ReooPAxPMsHM4KPMY",
            "naruto shippuuden": "vDTSJHSpYnrkZnAvG",
            "naruto shippuden": "vDTSJHSpYnrkZnAvG",
            "naruto: shippuuden": "vDTSJHSpYnrkZnAvG",
            "naruto: shippuden": "vDTSJHSpYnrkZnAvG",
        }

        query_clean = title.lower().strip()
        if query_clean in known_aliases:
            from collections import namedtuple
            MockResult = namedtuple("MockResult", ["name", "identifier"])
            # Provide a dummy name, we only care about the identifier
            best_match = MockResult(name=title, identifier=known_aliases[query_clean])
        else:
            search_results = list(provider.get_search(title))
            if not search_results:
                return JSONResponse(
                    status_code=404,
                    content={"error": "No search results found", "episodes": []}
                )
            best_match = find_best_match(search_results, title, title_ro or "")
        # get_episodes returns a list of plain ints (episode numbers)
        episodes = list(provider.get_episodes(best_match.identifier, lang))

        formatted_episodes = [{"number": int(ep)} for ep in episodes]
        return {"episodes": formatted_episodes, "source": "provider"}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "episodes": []})


@app.get("/sources")
async def get_sources(
    title: str = Query(..., description="Anime title to search"),
    title_ro: Optional[str] = Query(None, description="Anime title to search (Romaji)"),
    episode: int = Query(..., description="Episode number"),
    audio: str = Query("sub", description="Audio type (sub or dub)")
):
    """
    Fetch streaming sources using anipy-api AllAnimeProvider.

    ProviderStream objects expose:
      .url        — stream URL
      .resolution — int resolution (e.g. 1080), may be None
      .referrer   — Referer header value, may be None
      .language   — LanguageTypeEnum
    """
    try:
        provider = AllAnimeProvider()
        lang = LanguageTypeEnum.DUB if audio.lower() == "dub" else LanguageTypeEnum.SUB

        # 1. Search for the anime
        known_aliases = {
            "one piece": "ReooPAxPMsHM4KPMY",
            "naruto shippuuden": "vDTSJHSpYnrkZnAvG",
            "naruto shippuden": "vDTSJHSpYnrkZnAvG",
            "naruto: shippuuden": "vDTSJHSpYnrkZnAvG",
            "naruto: shippuden": "vDTSJHSpYnrkZnAvG",
        }

        query_clean = title.lower().strip()
        if query_clean in known_aliases:
            from collections import namedtuple
            MockResult = namedtuple("MockResult", ["name", "identifier"])
            best_match = MockResult(name=title, identifier=known_aliases[query_clean])
        else:
            search_results = list(provider.get_search(title))
            if not search_results:
                return JSONResponse(
                    status_code=404,
                    content={"error": "No search results found", "sources": []}
                )
            best_match = find_best_match(search_results, title, title_ro or "")

        # 2. Fetch video streams directly — skip episode list validation
        #    because provider.get_episodes() can return an incomplete list.
        streams = list(provider.get_video(best_match.identifier, episode, lang))

        if not streams:
            return JSONResponse(
                status_code=404,
                content={"error": f"No streams found for episode {episode}", "sources": []}
            )

        sources = []
        for s in streams:
            resolution = getattr(s, "resolution", None)
            referrer = getattr(s, "referrer", None)
            quality = f"anipy-cli ({resolution}p)" if resolution else "anipy-cli"
            source_entry = {
                "url": s.url,
                "quality": quality,
                "type": "hls" if ".m3u8" in s.url else "mp4",
                "isM3U8": ".m3u8" in s.url,
                "score": 75,
            }
            if referrer:
                source_entry["headers"] = {"Referer": referrer}
            sources.append(source_entry)

        return {"sources": sources, "matched_title": best_match.name}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "sources": []})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
