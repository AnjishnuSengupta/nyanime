const base = process.env.ANIPY_BASE_URL || 'https://anipy-yhba.onrender.com'

const titles = [
  'naruto',
  'one piece',
  'bleach',
  'attack on titan',
  'death note',
  'jujutsu kaisen',
  'demon slayer',
  'spy x family',
  'chainsaw man',
  'your name',
  'koe no katachi',
  'suzume',
  'violet evergarden',
  'bocchi the rock',
  'frieren',
]

const SEARCH_TIMEOUT = Number(process.env.BENCH_SEARCH_TIMEOUT_MS || 12000)
const INFO_TIMEOUT = Number(process.env.BENCH_INFO_TIMEOUT_MS || 12000)
const SOURCES_TIMEOUT = Number(process.env.BENCH_SOURCES_TIMEOUT_MS || 20000)

const now = () => Date.now()
const avg = (arr) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0)

async function fetchJson(url, timeoutMs) {
  const started = now()
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, ms: now() - started, json }
}

async function run() {
  const rows = []

  for (const title of titles) {
    const row = {
      title,
      searchOk: false,
      infoOk: false,
      sourcesOk: false,
      totalOk: false,
      searchMs: null,
      infoMs: null,
      sourcesMs: null,
      totalMs: null,
      sourceCount: 0,
      error: null,
    }

    const started = now()
    process.stdout.write(`Checking: ${title} ... `)
    try {
      const search = await fetchJson(`${base}/aniwatch/search?q=${encodeURIComponent(title)}`, SEARCH_TIMEOUT)
      row.searchMs = search.ms
      const animeId = search?.json?.data?.animes?.[0]?.id || null
      row.searchOk = search.status === 200 && Boolean(animeId)
      if (!row.searchOk) {
        throw new Error(`search_${search.status}`)
      }

      const info = await fetchJson(`${base}/aniwatch/info?id=${encodeURIComponent(animeId)}`, INFO_TIMEOUT)
      row.infoMs = info.ms
      const episodeId = info?.json?.data?.episodes?.sub?.[0]?.episodeId || null
      row.infoOk = info.status === 200 && Boolean(episodeId)
      if (!row.infoOk) {
        throw new Error(`info_${info.status}`)
      }

      const sources = await fetchJson(
        `${base}/aniwatch/sources?episodeId=${encodeURIComponent(episodeId)}&category=sub`,
        SOURCES_TIMEOUT,
      )
      row.sourcesMs = sources.ms
      row.sourceCount = Array.isArray(sources?.json?.data?.sources) ? sources.json.data.sources.length : 0
      row.sourcesOk = sources.status === 200 && row.sourceCount > 0
      if (!row.sourcesOk) {
        throw new Error(`sources_${sources.status}`)
      }

      row.totalOk = true
    } catch (error) {
      row.error = String(error?.message || error)
    } finally {
      row.totalMs = now() - started
      if (row.totalOk) {
        process.stdout.write(`OK (${row.totalMs}ms)\n`)
      } else {
        process.stdout.write(`FAIL (${row.error})\n`)
      }
      rows.push(row)
    }
  }

  const tested = rows.length
  const endToEndSuccess = rows.filter((r) => r.totalOk).length

  const summary = {
    base,
    tested,
    success: {
      search: `${rows.filter((r) => r.searchOk).length}/${tested}`,
      info: `${rows.filter((r) => r.infoOk).length}/${tested}`,
      sources: `${rows.filter((r) => r.sourcesOk).length}/${tested}`,
      endToEnd: `${endToEndSuccess}/${tested}`,
      endToEndRatePct: Number(((endToEndSuccess / tested) * 100).toFixed(1)),
    },
    avgLatencyMs: {
      search: avg(rows.filter((r) => r.searchMs !== null).map((r) => r.searchMs)),
      info: avg(rows.filter((r) => r.infoMs !== null).map((r) => r.infoMs)),
      sources: avg(rows.filter((r) => r.sourcesMs !== null).map((r) => r.sourcesMs)),
      totalFlow: avg(rows.map((r) => r.totalMs)),
    },
    failures: rows.filter((r) => !r.totalOk).map((r) => ({ title: r.title, error: r.error })),
    rows,
  }

  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  console.error('benchmark_failed', error?.message || error)
  process.exit(1)
})
