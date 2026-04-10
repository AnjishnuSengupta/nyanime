import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = 'https://api.jikan.moe/v4';
const BASE_URL = 'https://nyanime.qzz.io';
const MAX_LIMIT = 25;

interface JikanAnime {
  mal_id: number;
  title: string;
  aired?: {
    from?: string;
  };
  episodes?: number;
}

interface JikanResponse {
  data: JikanAnime[];
  pagination: {
    last_page: number;
  };
}

async function fetchWithDelay<T>(url: string, delay: number = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }
        const data = await response.json();
        resolve(data);
      } catch (error) {
        reject(error);
      }
    }, delay);
  });
}

async function fetchAllAnime(): Promise<JikanAnime[]> {
  const allAnime: JikanAnime[] = [];
  let page = 1;
  let hasMore = true;
  let requestCount = 0;

  console.log('Fetching anime data from Jikan API...');

  while (hasMore && page <= 100) { // Limit to 100 pages to avoid too large sitemaps
    try {
      const url = `${API_BASE_URL}/anime?page=${page}&limit=${MAX_LIMIT}&sfw=true&order_by=mal_id&sort=asc`;
      console.log(`Fetching page ${page}...`);

      // Add delay between requests to respect rate limits (1 request per second)
      const response = await fetchWithDelay<JikanResponse>(url, 1100);
      
      if (response.data && Array.isArray(response.data)) {
        allAnime.push(...response.data);
      }

      const pagination = response.pagination || {};
      hasMore = page < (pagination.last_page || 1);
      page++;
      requestCount++;

      // Log progress
      console.log(`  Fetched ${allAnime.length} anime total...`);
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`Successfully fetched ${allAnime.length} anime entries`);
  return allAnime;
}

function generateSitemapXML(anime: JikanAnime[]): string {
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  
  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Browse/Category Pages -->
  <url>
    <loc>${BASE_URL}/list</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=trending</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=popular</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=seasonal</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=new</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=hot</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>${BASE_URL}/list?category=top</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Auth Pages (marked with noindex but still listed for discovery) -->
  <url>
    <loc>${BASE_URL}/signin</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>

  <url>
    <loc>${BASE_URL}/signup</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>

  <!-- Dynamic Anime Detail Pages -->`;

  // Add anime detail pages with dynamic priority based on recency
  anime.forEach((animeEntry) => {
    const animeUrl = `${BASE_URL}/anime/${animeEntry.mal_id}`;
    const lastMod = animeEntry.aired?.from?.split('T')[0] || today;
    // Higher priority for more recently aired anime
    const priority = animeEntry.aired?.from ? '0.8' : '0.7';
    
    xml += `
  <url>
    <loc>${animeUrl}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  // Add watch pages for anime (sample - 1 episode per anime for sitemap size)
  // In production, you might want to include actual episode counts from the API
  anime.slice(0, Math.min(1000, anime.length)).forEach((animeEntry) => {
    const watchUrl = `${BASE_URL}/anime/${animeEntry.mal_id}/watch?ep=1`;
    const lastMod = animeEntry.aired?.from?.split('T')[0] || today;
    
    xml += `
  <url>
    <loc>${watchUrl}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
  });

  xml += `

</urlset>`;

  return xml;
}

async function main() {
  try {
    console.log('Starting sitemap generation...');
    const anime = await fetchAllAnime();
    const sitemapXML = generateSitemapXML(anime);
    
    const outputPath = path.join(process.cwd(), 'public', 'sitemap.xml');
    fs.writeFileSync(outputPath, sitemapXML, 'utf-8');
    
    console.log(`✅ Sitemap generated successfully!`);
    console.log(`   Location: ${outputPath}`);
    console.log(`   Total URLs: ${anime.length * 2 + 10} (estimated)`);
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

main();
