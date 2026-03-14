#!/usr/bin/env node

const base = process.env.VITE_CONSUMET_API_URL || process.env.CONSUMET_API_URL || 'https://consumet.nyanime.tech';
const provider = process.env.CONSUMET_ANIME_PROVIDER || 'animekai';
const fallbackProviders = (process.env.CONSUMET_ANIME_FALLBACK_PROVIDERS || 'hianime,kickassanime,animesaturn,animepahe')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const providerPriority = [provider, ...fallbackProviders].filter((p, i, arr) => arr.indexOf(p) === i);
const query = process.env.PROVIDER_HEALTH_QUERY || 'naruto';

async function getJson(path) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nyanime/provider-health-script',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${text.slice(0, 180)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON for ${path}`);
  }
}

async function run() {
  const started = Date.now();

  let usedProvider = provider;
  let animeId = null;
  let episodeId = null;
  let sourceCount = 0;

  for (const providerName of providerPriority) {
    try {
      const candidate = await getJson(`/anime/${providerName}/${encodeURIComponent(query)}?page=1`);
      const results = Array.isArray(candidate?.results) ? candidate.results : [];
      for (const result of results.slice(0, 5)) {
        if (!result?.id) continue;

        let info;
        try {
          info = await getJson(`/anime/${providerName}/info?id=${encodeURIComponent(result.id)}`);
        } catch {
          info = await getJson(`/anime/${providerName}/info/${encodeURIComponent(result.id)}`);
        }

        const episodes = Array.isArray(info?.episodes) ? info.episodes : [];
        const firstEpisodeId = episodes[0]?.id;
        if (!firstEpisodeId) continue;

        const watch = await getJson(`/anime/${providerName}/watch/${encodeURIComponent(firstEpisodeId)}?category=sub`);
        const sources = Array.isArray(watch?.sources) ? watch.sources : [];
        if (!sources.length) continue;

        usedProvider = providerName;
        animeId = result.id;
        episodeId = firstEpisodeId;
        sourceCount = sources.length;
        break;
      }

      if (animeId && episodeId) {
        break;
      }
    } catch {
      // Try next provider.
    }
  }

  if (!animeId || !episodeId) {
    throw new Error('No playable anime resolved from provider chain');
  }

  const elapsed = Date.now() - started;
  console.log('[provider-health] OK');
  console.log(`provider=${usedProvider}`);
  console.log(`providerPriority=${providerPriority.join(',')}`);
  console.log(`base=${base}`);
  console.log(`animeId=${animeId}`);
  console.log(`episodeId=${episodeId}`);
  console.log(`sourceCount=${sourceCount}`);
  console.log(`latencyMs=${elapsed}`);
}

run().catch((error) => {
  console.error('[provider-health] FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
