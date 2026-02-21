/**
 * Netlify Function: HLS/M3U8 Stream Proxy
 * Handles CORS, header forwarding, and playlist URL rewriting
 * Endpoint: /stream?url=<encoded_video_url>&h=<base64_headers>
 */

import type { Handler, HandlerEvent } from '@netlify/functions';

// MegaCloud ecosystem domains — all require megacloud.blog referer
const MEGACLOUD_DOMAINS = [
  'megacloud', 'haildrop', 'rapid-cloud', 'megaup',
  'lightningspark', 'sunshinerays', 'surfparadise',
  'moonjump', 'skydrop', 'wetransfer', 'bicdn',
  'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
  'statics', 'mgstatics', 'lasercloud', 'cloudrax',
  'stormshade', 'thunderwave', 'raincloud', 'snowfall',
  'rainveil', 'thunderstrike', 'sunburst', 'clearskyline',
];

function getRefererForHost(hostname: string, customReferer?: string): string {
  if (customReferer) return customReferer;
  const host = hostname.toLowerCase();
  if (MEGACLOUD_DOMAINS.some(d => host.includes(d))) return 'https://megacloud.blog/';
  if (host.includes('vidcloud') || host.includes('vidstreaming')) return 'https://vidcloud.blog/';
  if (host.includes('hianime') || host.includes('aniwatch')) return 'https://hianime.to/';
  if (host.includes('gogoanime') || host.includes('gogocdn')) return 'https://gogoanime.cl/';
  if (host.includes('kwik') || host.includes('animepahe')) return 'https://animepahe.ru/';
  return 'https://megacloud.blog/';
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export const handler: Handler = async (event: HandlerEvent) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
      body: '',
    };
  }

  const qs = event.queryStringParameters || {};
  const targetParam = qs.url;
  const headersParam = qs.h;

  if (!targetParam) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ error: 'Invalid url parameter' }),
    };
  }

  // Parse custom headers (base64 JSON)
  let customHeaders: Record<string, string> = {};
  if (headersParam) {
    try {
      customHeaders = JSON.parse(Buffer.from(headersParam, 'base64').toString('utf-8'));
    } catch { /* ignore */ }
  }

  const referer = getRefererForHost(
    target.hostname,
    customHeaders.Referer || customHeaders.referer
  );

  // Determine request origin for M3U8 rewriting
  const host = event.headers?.host || 'localhost';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const requestOrigin = `${protocol}://${host}`;

  // ── Render backend PRIMARY path ──
  // Netlify runs on AWS IPs which are frequently blocked by MegaCloud CDN.
  // The Render backend uses raw http.request() which avoids bot detection.
  const renderBase = process.env.RENDER_STREAM_PROXY;
  if (renderBase) {
    console.log(`[stream-proxy] Using Render backend as primary: ${renderBase}`);
    try {
      const renderUrl = new URL(`${renderBase}/stream`);
      renderUrl.searchParams.set('url', targetParam);
      if (headersParam) renderUrl.searchParams.set('h', headersParam);

      const renderController = new AbortController();
      const renderTimeout = setTimeout(() => renderController.abort(), 25000);

      const renderResp = await fetch(renderUrl.toString(), {
        headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
        signal: renderController.signal,
      });
      clearTimeout(renderTimeout);

      if (renderResp.ok || renderResp.status === 206) {
        console.log(`[stream-proxy] Render primary succeeded (${renderResp.status})`);
        const ct = renderResp.headers.get('content-type') || 'application/octet-stream';
        const isM3U8 = ct.includes('mpegurl') || ct.includes('x-mpegurl') || target.pathname.toLowerCase().endsWith('.m3u8');

        if (isM3U8) {
          // Read and rewrite playlist so segment URLs go through THIS proxy
          const text = await renderResp.text();
          const hQuery = headersParam ? `&h=${encodeURIComponent(headersParam)}` : '';
          const lines = text.split(/\r?\n/).map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
              return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                try {
                  const abs = new URL(uri, target);
                  return `URI="${requestOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hQuery}"`;
                } catch { return _match; }
              });
            }
            if (trimmed.startsWith('#') || trimmed === '') return line;
            try {
              const abs = new URL(trimmed, target);
              return `${requestOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hQuery}`;
            } catch { return line; }
          });
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache', ...corsHeaders },
            body: lines.join('\n'),
          };
        }

        // Binary segment — return as base64
        const buf = Buffer.from(await renderResp.arrayBuffer());
        const respHeaders: Record<string, string> = { ...corsHeaders, 'Cache-Control': 'public, max-age=3600' };
        const cl = renderResp.headers.get('content-length');
        if (cl) respHeaders['Content-Length'] = cl;
        respHeaders['Content-Type'] = ct;

        return {
          statusCode: renderResp.status,
          headers: respHeaders,
          body: buf.toString('base64'),
          isBase64Encoded: true,
        };
      }
      console.warn(`[stream-proxy] Render primary returned ${renderResp.status}, falling back to direct`);
    } catch (err) {
      console.error('[stream-proxy] Render primary error:', err instanceof Error ? err.message : err);
    }
  }

  // ── Direct fetch fallback ──
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: referer,
  };
  // Merge custom headers (skip referer — already set)
  Object.entries(customHeaders).forEach(([k, v]) => {
    if (v && typeof v === 'string' && k.toLowerCase() !== 'referer') upstreamHeaders[k] = v;
  });
  // Forward Range header
  const rangeHeader = event.headers?.range || event.headers?.Range;
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  const pathLower = target.pathname.toLowerCase();
  const isM3U8File = pathLower.endsWith('.m3u8');
  const looksLikeSegment = pathLower.endsWith('.ts') || pathLower.endsWith('.m4s') ||
    pathLower.endsWith('.mp4') || pathLower.endsWith('.html') ||
    pathLower.endsWith('.key') || pathLower.endsWith('.jpg');

  const refererCandidates = [
    'https://megacloud.blog/',
    'https://megacloud.tv/',
    'https://hianime.to/',
    'https://aniwatch.to/',
    `${target.protocol}//${target.host}/`,
  ];

  let workingHeadersParam = headersParam || '';

  console.log(`[stream-proxy] Direct fetch: ${targetParam.substring(0, 80)}... Referer: ${referer}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // ── Retry with different referers when upstream fails ──
    if (!upstreamResp.ok) {
      console.warn(`[stream-proxy] Upstream ${upstreamResp.status} — retrying`);
      for (const ref of refererCandidates) {
        const rh: Record<string, string> = { ...upstreamHeaders, Referer: ref };
        try { rh['Origin'] = new URL(ref).origin; } catch { /* ignore */ }
        try {
          const rr = await fetch(target.toString(), { method: 'GET', headers: rh, redirect: 'follow' });
          if (rr.ok) {
            if (isM3U8File) {
              const preview = await rr.clone().text();
              if (/^#EXTM3U/m.test(preview)) {
                upstreamResp = rr;
                try { workingHeadersParam = Buffer.from(JSON.stringify({ Referer: ref, Origin: new URL(ref).origin })).toString('base64'); } catch { /* */ }
                break;
              }
            } else {
              const ct = (rr.headers.get('content-type') || '').toLowerCase();
              if (!ct.includes('text/html')) { upstreamResp = rr; break; }
            }
          }
        } catch { /* */ }
      }

      // M3U8 retry without Origin
      if (!upstreamResp.ok && isM3U8File) {
        for (const ref of refererCandidates) {
          const rh: Record<string, string> = { ...upstreamHeaders, Referer: ref };
          delete rh['Origin'];
          try {
            const rr = await fetch(target.toString(), { method: 'GET', headers: rh, redirect: 'follow' });
            if (rr.ok) {
              const preview = await rr.clone().text();
              if (/^#EXTM3U/m.test(preview)) {
                upstreamResp = rr;
                try { workingHeadersParam = Buffer.from(JSON.stringify({ Referer: ref })).toString('base64'); } catch { /* */ }
                break;
              }
            }
          } catch { /* */ }
        }
      }

      if (!upstreamResp.ok) {
        return {
          statusCode: upstreamResp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ error: `Upstream error: ${upstreamResp.statusText}`, status: upstreamResp.status }),
        };
      }
    }

    const contentType = upstreamResp.headers.get('content-type') || '';
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || contentType.toLowerCase().includes('x-mpegurl') || isM3U8File;

    // Reject HTML responses for segments
    if (looksLikeSegment && contentType.toLowerCase().includes('text/html')) {
      let htmlRetried = false;
      for (const ref of refererCandidates) {
        const rh: Record<string, string> = { ...upstreamHeaders, Referer: ref };
        try { rh['Origin'] = new URL(ref).origin; } catch { /* */ }
        try {
          const rr = await fetch(target.toString(), { method: 'GET', headers: rh, redirect: 'follow' });
          const ct = (rr.headers.get('content-type') || '').toLowerCase();
          if (rr.ok && !ct.includes('text/html')) { upstreamResp = rr; htmlRetried = true; break; }
        } catch { /* */ }
      }
      if (!htmlRetried) {
        return {
          statusCode: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ error: 'CDN returned HTML instead of video data' }),
        };
      }
    }

    // ── Return non-M3U8 binary data ──
    if (!isM3U8 && (!contentType.includes('text') || looksLikeSegment)) {
      const buf = Buffer.from(await upstreamResp.arrayBuffer());
      const respHeaders: Record<string, string> = { ...corsHeaders, 'Cache-Control': 'public, max-age=3600' };
      const ct = upstreamResp.headers.get('content-type');
      if (ct) respHeaders['Content-Type'] = ct;
      const cl = upstreamResp.headers.get('content-length');
      if (cl) respHeaders['Content-Length'] = cl;

      return {
        statusCode: upstreamResp.status,
        headers: respHeaders,
        body: buf.toString('base64'),
        isBase64Encoded: true,
      };
    }

    // ── Rewrite M3U8 playlist ──
    const text = await upstreamResp.text();
    if (!text.includes('#EXTM3U') && !text.includes('#EXT')) {
      return {
        statusCode: upstreamResp.status,
        headers: { 'Content-Type': contentType || 'text/plain', ...corsHeaders },
        body: text,
      };
    }

    const hQuery = workingHeadersParam ? `&h=${encodeURIComponent(workingHeadersParam)}` : '';
    const lines = text.split(/\r?\n/).map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
          try {
            const abs = new URL(uri, target);
            return `URI="${requestOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hQuery}"`;
          } catch { return _match; }
        });
      }
      if (trimmed.startsWith('#') || trimmed === '') return line;
      try {
        const abs = new URL(trimmed, target);
        return `${requestOrigin}/stream?url=${encodeURIComponent(abs.toString())}${hQuery}`;
      } catch { return line; }
    });

    const outText = lines.join('\n');
    console.log(`[stream-proxy] Rewrote M3U8: ${text.length} -> ${outText.length} bytes`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        ...corsHeaders,
      },
      body: outText,
    };
  } catch (error) {
    console.error('[stream-proxy] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
