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
    case 'sources': return `/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(params.get('episodeId') || '')}&server=${params.get('server') || 'hd-1'}&category=${params.get('category') || 'sub'}`;
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
      const _srv = (u.searchParams.get('server') || 'hd-1') as any;
      const _cat = (u.searchParams.get('category') || 'sub') as any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const srcData = await hianime.getEpisodeSources(eid, _srv, _cat);
          if (srcData?.sources?.length > 0) return ok(srcData, 0);
        } catch {
          if (attempt < 3) { await new Promise(r => setTimeout(r, 800 * attempt)); continue; }
        }
        if (attempt === 3) throw new Error('Scraper failed after 3 attempts');
      }
      return fail(502, 'No sources found');
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
        const srv = (params.get('server') || 'hd-1') as any;
        const cat = (params.get('category') || 'sub') as any;
        // Retry scraper up to 3 times (intermittent "Failed extracting client key" / 403)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const srcData = await hianime.getEpisodeSources(eid, srv, cat);
            if (srcData && srcData.sources && srcData.sources.length > 0) {
              if (attempt > 1) console.log(`[aniwatch] Scraper succeeded on attempt ${attempt}`);
              return ok(srcData, 0);
            }
          } catch (retryErr) {
            console.warn(`[aniwatch] Scraper failed (attempt ${attempt}/3):`, retryErr instanceof Error ? retryErr.message : retryErr);
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 800 * attempt));
              continue;
            }
          }
          if (attempt === 3) {
            throw new Error('Scraper failed after 3 attempts');
          }
        }
        return fail(502, 'No sources found');
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
