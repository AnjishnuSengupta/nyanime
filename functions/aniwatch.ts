/**
 * Cloudflare Pages / Netlify Function: Aniwatch API (Direct scraper via npm package)
 * Uses the `aniwatch` npm package for direct scraping — no external API needed.
 * 
 * Endpoint: /aniwatch?action=<action>&<params>
 * Legacy:   /aniwatch?path=/api/v2/hianime/... (falls back to old API)
 */

import { HiAnime } from 'aniwatch';

type CFContext = { 
  request: Request;
  env?: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const OLD_API_BASE = 'https://nyanime-backend-v2.onrender.com';
const hianime = new HiAnime.Scraper();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function ok(data: unknown, cacheSecs = 60) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${cacheSecs}, stale-while-revalidate=300`,
      ...corsHeaders,
    },
  });
}

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function proxyOld(apiPath: string): Promise<Response> {
  try {
    const url = `${OLD_API_BASE}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    const data = await r.text();
    return new Response(data, {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch {
    return fail(502, 'Old API fallback failed');
  }
}

function toLegacyPath(params: URLSearchParams): string | null {
  const action = params.get('action');
  switch (action) {
    case 'home': return '/api/v2/hianime/home';
    case 'search': return `/api/v2/hianime/search?q=${encodeURIComponent(params.get('q') || '')}&page=${params.get('page') || 1}`;
    case 'info': return `/api/v2/hianime/anime/${params.get('id')}`;
    case 'episodes': return `/api/v2/hianime/anime/${params.get('id')}/episodes`;
    case 'servers': return `/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(params.get('episodeId') || '')}`;
    case 'sources': return `/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(params.get('episodeId') || '')}&server=${params.get('server') || 'streamtape'}&category=${params.get('category') || 'sub'}`;
    default: return null;
  }
}

async function handleLegacyPath(p: string): Promise<Response> {
  try {
    if (p.includes('/home')) return ok(await hianime.getHomePage(), 300);

    if (p.includes('/search')) {
      const u = new URL('http://x' + p);
      const q = u.searchParams.get('q') || '';
      if (!q) return fail(400, 'Missing q');
      return ok(await hianime.search(q, parseInt(u.searchParams.get('page') || '1')));
    }

    if (p.includes('/episode/sources')) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return fail(400, 'Missing animeEpisodeId');
      const _cat = (u.searchParams.get('category') || 'sub') as any;
      // Try ALL servers, non-MegaCloud first (different CDNs that work from datacenter)
      const serversToTry = ['streamtape', 'streamsb', 'hd-1', 'hd-2'] as const;
      let lastError: any = null;
      for (const server of serversToTry) {
        try {
          const srcData = await hianime.getEpisodeSources(eid, server as any, _cat);
          if (srcData?.sources?.length > 0) {
            (srcData as any)._usedServer = server;
            if (server === 'hd-1' || server === 'hd-2') {
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
                  const targetServerId = srvNameToId[server] || '4';
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
                      if (ajaxData?.link) (srcData as any).embedURL = (ajaxData.link as string).replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                    }
                  }
                }
              } catch { /* ignore embed URL errors */ }
            }
            return ok(srcData, 0);
          }
        } catch (err) {
          console.warn(`[aniwatch] Server "${server}" failed:`, err instanceof Error ? err.message : err);
          lastError = err;
        }
      }
      throw lastError || new Error('All servers failed');
    }

    if (p.includes('/episode/servers')) {
      const u = new URL('http://x' + p);
      const eid = u.searchParams.get('animeEpisodeId') || '';
      if (!eid) return fail(400, 'Missing animeEpisodeId');
      return ok(await hianime.getEpisodeServers(eid));
    }

    const epsMatch = p.match(/\/anime\/([^/]+)\/episodes/);
    if (epsMatch) return ok(await hianime.getEpisodes(epsMatch[1]), 300);

    const infoMatch = p.match(/\/anime\/([^/]+)$/);
    if (infoMatch) return ok(await hianime.getInfo(infoMatch[1]), 600);

    return proxyOld(p);
  } catch (err) {
    console.error('[aniwatch] Legacy handler error:', err);
    return proxyOld(p);
  }
}

export const onRequest = async (context: CFContext) => {
  const { request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' } });
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  try {
    // Legacy path routing
    const legacyPath = params.get('path');
    if (legacyPath) return handleLegacyPath(legacyPath);

    const action = params.get('action');
    if (!action) return fail(400, 'Missing action param');

    switch (action) {
      case 'home':
        return ok(await hianime.getHomePage(), 300);

      case 'search': {
        const q = params.get('q');
        if (!q) return fail(400, 'Missing q');
        return ok(await hianime.search(q, parseInt(params.get('page') || '1')));
      }

      case 'suggestions': {
        const q = params.get('q');
        if (!q) return fail(400, 'Missing q');
        return ok(await hianime.searchSuggestions(q), 30);
      }

      case 'info': {
        const id = params.get('id');
        if (!id) return fail(400, 'Missing id');
        return ok(await hianime.getInfo(id), 600);
      }

      case 'episodes': {
        const id = params.get('id');
        if (!id) return fail(400, 'Missing id');
        return ok(await hianime.getEpisodes(id), 300);
      }

      case 'servers': {
        const eid = params.get('episodeId');
        if (!eid) return fail(400, 'Missing episodeId');
        return ok(await hianime.getEpisodeServers(eid));
      }

      case 'sources': {
        const eid = params.get('episodeId');
        if (!eid) return fail(400, 'Missing episodeId');
        const cat = (params.get('category') || 'sub') as any;
        // Try ALL servers, non-MegaCloud first (different CDNs that work from datacenter)
        const serversToTry = ['streamtape', 'streamsb', 'hd-1', 'hd-2'] as const;
        let lastError: any = null;
        for (const srv of serversToTry) {
          try {
            const srcData = await hianime.getEpisodeSources(eid, srv as any, cat);
            if (srcData && srcData.sources && srcData.sources.length > 0) {
              console.log(`[aniwatch] Sources resolved via server: ${srv}`);
              (srcData as any)._usedServer = srv;
              if (srv === 'hd-1' || srv === 'hd-2') {
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
                    const targetServerId = srvNameToId[srv] || '4';
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
                        if (ajaxData?.link) (srcData as any).embedURL = (ajaxData.link as string).replace('/embed-2/e-1/', '/embed-2/v3/e-1/');
                      }
                    }
                  }
                } catch { /* ignore embed URL errors */ }
              }
              return ok(srcData, 0);
            }
          } catch (err) {
            console.warn(`[aniwatch] Server "${srv}" failed:`, err instanceof Error ? err.message : err);
            lastError = err;
          }
        }
        throw lastError || new Error('All servers failed');
      }

      case 'category': {
        const name = params.get('name');
        if (!name) return fail(400, 'Missing name');
        return ok(await hianime.getCategoryAnime(name as any, parseInt(params.get('page') || '1')), 300);
      }

      case 'schedule': {
        const date = params.get('date');
        if (!date) return fail(400, 'Missing date');
        return ok(await hianime.getEstimatedSchedule(date), 600);
      }

      default:
        return fail(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[aniwatch] Scraper error:', error);
    const legacy = toLegacyPath(params);
    if (legacy) return proxyOld(legacy);
    return fail(500, error instanceof Error ? error.message : 'Internal error');
  }
};
