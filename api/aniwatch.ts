import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HiAnime } from 'aniwatch';

/**
 * Vercel Serverless Function: Aniwatch API (Direct scraper via npm package)
 * Uses the `aniwatch` npm package to scrape anime data directly — no external API server needed.
 * 
 * Endpoint: /api/aniwatch?action=<action>&<params>
 * 
 * Actions:
 *   home                                → Home page data
 *   search&q=<query>&page=<n>           → Search anime
 *   suggestions&q=<query>               → Search suggestions
 *   info&id=<animeId>                   → Anime details
 *   episodes&id=<animeId>               → Episode list
 *   servers&episodeId=<episodeId>       → Episode servers
 *   sources&episodeId=<id>&server=<s>&category=<c>  → Streaming sources
 *   category&name=<name>&page=<n>       → Category listing
 * 
 * Legacy: ?path=/api/v2/hianime/... still works (falls back to old API proxy)
 */

const OLD_API_BASE = process.env.VITE_ANIWATCH_API_URL || 'https://nyanime-backend-v2.onrender.com';
const hianime = new HiAnime.Scraper();

function corsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function ok(res: VercelResponse, data: unknown, cacheSecs = 60) {
  corsHeaders(res);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSecs}, stale-while-revalidate=300`);
  return res.status(200).json({ success: true, data });
}

function fail(res: VercelResponse, status: number, message: string) {
  corsHeaders(res);
  return res.status(status).json({ success: false, error: message });
}

/** Fallback: proxy to old hosted API */
async function proxyOld(apiPath: string, res: VercelResponse) {
  try {
    const url = `${OLD_API_BASE}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    clearTimeout(t);
    corsHeaders(res);
    res.setHeader('Content-Type', 'application/json');
    if (!r.ok) return res.status(r.status).json({ error: r.statusText });
    return res.status(200).json(await r.json());
  } catch {
    return fail(res, 502, 'Old API fallback failed');
  }
}

/** Map action query params to a legacy path for fallback */
function toLegacyPath(q: Record<string, any>): string | null {
  switch (q.action) {
    case 'home': return '/api/v2/hianime/home';
    case 'search': return `/api/v2/hianime/search?q=${encodeURIComponent(q.q || '')}&page=${q.page || 1}`;
    case 'info': return `/api/v2/hianime/anime/${q.id}`;
    case 'episodes': return `/api/v2/hianime/anime/${q.id}/episodes`;
    case 'servers': return `/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(q.episodeId || '')}`;
    case 'sources': return `/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(q.episodeId || '')}&server=${q.server || 'hd-2'}&category=${q.category || 'sub'}`;
    default: return null;
  }
}

/** Handle legacy ?path=/api/v2/hianime/... style */
async function handleLegacyPath(path: string, res: VercelResponse) {
  const p = path.startsWith('/') ? path : '/' + path;
  try {
    if (p.includes('/home')) return ok(res, await hianime.getHomePage(), 300);

    if (p.includes('/search')) {
      const u = new URL('http://x' + p);
      const q = u.searchParams.get('q') || '';
      if (!q) return fail(res, 400, 'Missing q');
      return ok(res, await hianime.search(q, parseInt(u.searchParams.get('page') || '1')));
    }

    const epSrcMatch = p.includes('/episode/sources');
    if (epSrcMatch) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return fail(res, 400, 'Missing animeEpisodeId');
      const _srv = (u.searchParams.get('server') || 'hd-2') as any;
      const _cat = (u.searchParams.get('category') || 'sub') as any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const srcData = await hianime.getEpisodeSources(eid, _srv, _cat);
          if (srcData?.sources?.length > 0) {
            // Best-effort: resolve embed URL for iframe fallback.
            // getEpisodeServers() returns data-server-id (type), not data-id (source).
            try {
              const epNum = eid.includes('?ep=') ? eid.split('?ep=')[1] : eid;
              const srvResp = await fetch(
                `https://hianimez.to/ajax/v2/episode/servers?episodeId=${epNum}`,
                { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://hianimez.to/watch/${eid}` } }
              );
              if (srvResp.ok) {
                const srvJson = await srvResp.json() as any;
                const srvHtml: string = srvJson?.html || '';
                const srvNameToId: Record<string, string> = { 'hd-1': '4', 'hd-2': '1' };
                const targetServerId = srvNameToId[String(_srv).toLowerCase()] || '4';
                const re = new RegExp(`data-type="${_cat}"\\s+data-id="(\\d+)"\\s+data-server-id="${targetServerId}"`);
                const match = re.exec(srvHtml);
                const sourceId = match?.[1];
                if (sourceId) {
                  const ajaxResp = await fetch(
                    `https://hianimez.to/ajax/v2/episode/sources?id=${sourceId}`,
                    { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://hianimez.to/' } }
                  );
                  if (ajaxResp.ok) {
                    const ajaxData = await ajaxResp.json() as any;
                    // AJAX returns embed-2/e-1/ but actual page requires embed-2/v3/e-1/
                    if (ajaxData?.link) (srcData as any).embedURL = (ajaxData.link as string).replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                  }
                }
              }
            } catch { /* ignore embed URL errors */ }
            return ok(res, srcData, 0);
          }
        } catch {
          if (attempt < 3) { await new Promise(r => setTimeout(r, 800 * attempt)); continue; }
        }
        if (attempt === 3) throw new Error('Scraper failed after 3 attempts');
      }
      return fail(res, 502, 'No sources found');
    }

    if (p.includes('/episode/servers')) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return fail(res, 400, 'Missing animeEpisodeId');
      return ok(res, await hianime.getEpisodeServers(eid));
    }

    const epsMatch = p.match(/\/anime\/([^/]+)\/episodes/);
    if (epsMatch) return ok(res, await hianime.getEpisodes(epsMatch[1]), 300);

    const infoMatch = p.match(/\/anime\/([^/]+)$/);
    if (infoMatch) return ok(res, await hianime.getInfo(infoMatch[1]), 600);

    // Unknown path → proxy old API
    return proxyOld(p, res);
  } catch (err) {
    console.error('[aniwatch] Legacy handler error, falling back:', err);
    return proxyOld(p, res);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') { corsHeaders(res); return res.status(204).end(); }

  try {
    const q = req.query as Record<string, any>;

    // Legacy path routing
    if (q.path && typeof q.path === 'string') return handleLegacyPath(q.path, res);

    const action = q.action as string;
    if (!action) return fail(res, 400, 'Missing action param');

    switch (action) {
      case 'home':
        return ok(res, await hianime.getHomePage(), 300);

      case 'search': {
        if (!q.q) return fail(res, 400, 'Missing q');
        return ok(res, await hianime.search(q.q, parseInt(q.page) || 1));
      }

      case 'suggestions': {
        if (!q.q) return fail(res, 400, 'Missing q');
        return ok(res, await hianime.searchSuggestions(q.q), 30);
      }

      case 'info': {
        if (!q.id) return fail(res, 400, 'Missing id');
        return ok(res, await hianime.getInfo(q.id), 600);
      }

      case 'episodes': {
        if (!q.id) return fail(res, 400, 'Missing id');
        return ok(res, await hianime.getEpisodes(q.id), 300);
      }

      case 'servers': {
        if (!q.episodeId) return fail(res, 400, 'Missing episodeId');
        return ok(res, await hianime.getEpisodeServers(q.episodeId));
      }

      case 'sources': {
        if (!q.episodeId) return fail(res, 400, 'Missing episodeId');
        const eid = q.episodeId as string;
        const srv = (q.server || 'hd-2') as any;
        const cat = (q.category || 'sub') as any;
        // Retry scraper up to 3 times (intermittent "Failed extracting client key" / 403)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const srcData = await hianime.getEpisodeSources(eid, srv, cat);
            if (srcData && srcData.sources && srcData.sources.length > 0) {
              if (attempt > 1) console.log(`[aniwatch] Scraper succeeded on attempt ${attempt}`);
              // Best-effort: resolve embed URL for iframe fallback.
              // getEpisodeServers() returns data-server-id (type), not data-id (source).
              try {
                const epNum = eid.includes('?ep=') ? eid.split('?ep=')[1] : eid;
                const srvResp = await fetch(
                  `https://hianimez.to/ajax/v2/episode/servers?episodeId=${epNum}`,
                  { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://hianimez.to/watch/${eid}` } }
                );
                if (srvResp.ok) {
                  const srvJson = await srvResp.json() as any;
                  const srvHtml: string = srvJson?.html || '';
                  const srvNameToId: Record<string, string> = { 'hd-1': '4', 'hd-2': '1' };
                  const targetServerId = srvNameToId[String(srv).toLowerCase()] || '4';
                  const re = new RegExp(`data-type="${cat}"\\s+data-id="(\\d+)"\\s+data-server-id="${targetServerId}"`);
                  const match = re.exec(srvHtml);
                  const sourceId = match?.[1];
                  if (sourceId) {
                    const ajaxResp = await fetch(
                      `https://hianimez.to/ajax/v2/episode/sources?id=${sourceId}`,
                      { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://hianimez.to/' } }
                    );
                    if (ajaxResp.ok) {
                      const ajaxData = await ajaxResp.json() as any;
                      // AJAX returns embed-2/e-1/ but actual page requires embed-2/v3/e-1/
                      if (ajaxData?.link) (srcData as any).embedURL = (ajaxData.link as string).replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                    }
                  }
                }
              } catch { /* ignore embed URL errors */ }
              return ok(res, srcData, 0);
            }
          } catch (retryErr) {
            console.warn(`[aniwatch] Scraper failed (attempt ${attempt}/3):`, retryErr instanceof Error ? retryErr.message : retryErr);
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 800 * attempt));
              continue;
            }
          }
          if (attempt === 3) {
            // Fall through to the outer catch which handles old API fallback
            throw new Error('Scraper failed after 3 attempts');
          }
        }
        return fail(res, 502, 'No sources found');
      }

      case 'category': {
        if (!q.name) return fail(res, 400, 'Missing name');
        return ok(res, await hianime.getCategoryAnime(q.name as any, parseInt(q.page) || 1), 300);
      }

      case 'schedule': {
        if (!q.date) return fail(res, 400, 'Missing date');
        return ok(res, await hianime.getEstimatedSchedule(q.date), 600);
      }

      default:
        return fail(res, 400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[aniwatch] Scraper error:', error);
    // Try old API fallback
    const legacy = toLegacyPath(req.query as Record<string, any>);
    if (legacy) {
      console.log('[aniwatch] Falling back to old API...');
      return proxyOld(legacy, res);
    }
    return fail(res, 500, error instanceof Error ? error.message : 'Internal error');
  }
}

export const config = { api: { bodyParser: false }, maxDuration: 30 };
