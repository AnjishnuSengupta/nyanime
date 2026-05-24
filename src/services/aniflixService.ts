export interface AniflixEpisode {
  id: string;
  number: number;
  title?: string;
}

/**
 * Normalizes the highly variable Aniflix API episodes response into a standard list.
 *
 * Aniflix can return completely different JSON structures depending on the upstream source:
 * - Miruro: { mappings: {...}, providers: { ally: { episodes: { sub: [...] } } } }
 * - AnimeKai: { provider: "animekai", aniId: "cA", episodes: [{ number, slug, token, episodeId }] }
 * - ReAnime: { provider: "reanime", episodes: [...] }
 *
 * @param resData      Raw JSON response from /api/aniflix/episodes/:id
 * @param audioType    'sub' | 'dub'
 * @param realAnilistId The real AniList numeric ID (e.g. 59708) — passed by the caller so
 *                      we don't accidentally use AniFlix's own internal short code (e.g. "cA")
 *                      which produces invalid /watch URLs that AniFlix rejects with 404.
 */
export function parseAniflixEpisodes(
  resData: Record<string, unknown> | null,
  audioType: 'sub' | 'dub' = 'sub',
  realAnilistId?: number | string
): AniflixEpisode[] {
  let episodes: Array<Record<string, unknown>> = [];

  if (!resData) return [];

  // Format 1: Miruro nested providers
  if (resData.providers) {
    const categoryKey = audioType === 'dub' ? 'dub' : 'sub';
    const providers = resData.providers as Record<string, unknown>;
    // Walk providers in order; use first with episodes for the requested category
    for (const prov of Object.values(providers) as Array<Record<string, unknown>>) {
      const episodesList = (prov?.episodes as Record<string, unknown>)?.[categoryKey];
      if (Array.isArray(episodesList) && episodesList.length > 0) {
        episodes = episodesList as Array<Record<string, unknown>>;
        break;
      }
    }
    // Fallback: try 'sub' if dub was empty
    if (episodes.length === 0 && categoryKey === 'dub') {
      for (const prov of Object.values(providers) as Array<Record<string, unknown>>) {
        const episodesList = (prov?.episodes as Record<string, unknown>)?.[categoryKey];
        if (Array.isArray(episodesList) && episodesList.length > 0) {
          episodes = episodesList as Array<Record<string, unknown>>;
          break;
        }
      }
    }

    return episodes.map(ep => ({
      id: String(ep.id),
      number: Number(ep.number),
      title: ep.title ? String(ep.title) : undefined
    }));
  }

  // Format 2: AnimeKai / ReAnime flat episodes array
  if (resData.provider && Array.isArray(resData.episodes)) {
    return resData.episodes.map((ep: Record<string, unknown>) => {
      const epId = ep.token || ep.slug || ep.episodeId || ep.id;
      const provider = String(resData.provider).toLowerCase();

      // CRITICAL: Use the real AniList ID from the caller (e.g. 59708), NOT AniFlix's
      // internal short code (e.g. "cA" from resData.aniId). The AniFlix /watch endpoint
      // requires the real numeric AniList ID; using the short code returns 404.
      const anilistId = realAnilistId || resData.aniId || 'unknown';

      return {
        id: `watch/${provider}/${anilistId}/${audioType}/${epId}`,
        number: Number(ep.number),
        title: ep.title ? String(ep.title) : (ep.japaneseTitle ? String(ep.japaneseTitle) : undefined)
      };
    });
  }

  return [];
}
