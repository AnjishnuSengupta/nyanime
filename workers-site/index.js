import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  try {
    // Try to get the asset from KV
    return await getAssetFromKV(event, {
      cacheControl: {
        browserTTL: 60 * 60 * 24 * 365, // 1 year for assets
        edgeTTL: 60 * 60 * 24 * 365,
      },
    });
  } catch (e) {
    // If asset not found, serve index.html for SPA routing
    try {
      const notFoundResponse = await getAssetFromKV(event, {
        mapRequestToAsset: (req) => new Request(`${new URL(req.url).origin}/index.html`, req),
      });
      return new Response(notFoundResponse.body, {
        ...notFoundResponse,
        status: 200,
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
}
