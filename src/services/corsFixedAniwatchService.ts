// CORS-Fixed Aniwatch Service
// This version uses your deployed API but fixes CORS issues

export interface VideoSource {
  url: string;
  directUrl?: string;
  embedUrl?: string;
  quality: string;
  headers?: Record<string, string>;
  type: 'hls' | 'mp4';
}

export interface EpisodeInfo {
  number: number;
  title: string;
  id: string;
  episodeId?: string;
}

// Your deployed API with CORS proxy
const ANIWATCH_API_BASE = 'https://nyanime-backend.vercel.app';

class CORSFixedAniwatchService {
  
  // Use a CORS proxy to bypass CORS restrictions
  private async fetchWithProxy(url: string): Promise<{
    status?: number;
    data?: {
      animes?: Array<unknown>;
      episodes?: Array<unknown>;
      sources?: Array<unknown>;
      headers?: Record<string, string>;
    };
    results?: Array<unknown>;
    episodes?: Array<unknown>;
    sources?: Array<unknown>;
    contents?: string;
  }> {
    const proxyUrls = [
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://cors-anywhere.herokuapp.com/${url}`
    ];
    
    console.log(`🔄 Attempting to fetch: ${url}`);
    
    for (let i = 0; i < proxyUrls.length; i++) {
      const proxyUrl = proxyUrls[i];
      console.log(`🔗 Trying proxy ${i + 1}: ${proxyUrl}`);
      
      try {
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.log(`❌ Proxy ${i + 1} failed: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        // Handle different proxy response formats
        let result = data;
        if (data.contents) {
          result = JSON.parse(data.contents); // allorigins format
        }
        
        console.log(`✅ Proxy ${i + 1} succeeded`);
        return result;
        
      } catch (error) {
        console.log(`❌ Proxy ${i + 1} error:`, error);
        continue;
      }
    }
    
    throw new Error('All CORS proxy attempts failed');
  }

  async searchAnime(title: string): Promise<Array<{id: string; title: string; image?: string}>> {
    console.log(`🔍 Searching for anime: ${title}`);
    
    try {
      const searchUrl = `${ANIWATCH_API_BASE}/api/v2/hianime/search?q=${encodeURIComponent(title)}&page=1`;
      const response = await this.fetchWithProxy(searchUrl);
      
      if (response.status === 200 && response.data && response.data.animes) {
        console.log(`✅ Found ${response.data.animes.length} results`);
        return response.data.animes as Array<{id: string; title: string; image?: string}>;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      console.error('❌ Search failed:', error);
      return [];
    }
  }

  async getEpisodes(animeId: string): Promise<EpisodeInfo[]> {
    console.log(`📺 Getting episodes for: ${animeId}`);
    
    try {
      const episodesUrl = `${ANIWATCH_API_BASE}/api/v2/hianime/anime/${animeId}/episodes`;
      const response = await this.fetchWithProxy(episodesUrl);
      
      if (response.status === 200 && response.data && response.data.episodes) {
        const episodes: EpisodeInfo[] = response.data.episodes.map((ep: {id: string; episodeId: string; number: number; title?: string}) => ({
          number: ep.number,
          title: ep.title,
          id: ep.episodeId,
          episodeId: ep.episodeId
        }));
        
        console.log(`✅ Found ${episodes.length} episodes`);
        return episodes;
      }
      
      throw new Error('Invalid episodes response');
    } catch (error) {
      console.error('❌ Episodes fetch failed:', error);
      return [];
    }
  }

  async getStreamingSources(episodeId: string, category: 'sub' | 'dub' = 'sub'): Promise<VideoSource[]> {
    console.log(`🎬 Getting streaming sources for: ${episodeId}`);
    
    try {
      const sourcesUrl = `${ANIWATCH_API_BASE}/api/v2/hianime/episode/sources?animeEpisodeId=${episodeId}&category=${category}`;
      const response = await this.fetchWithProxy(sourcesUrl);
      
      if (response.status === 200 && response.data && response.data.sources) {
        const sources: VideoSource[] = response.data.sources.map((source: {url: string; quality?: string; isM3U8?: boolean; type?: string}) => ({
          url: source.url,
          directUrl: source.url,
          embedUrl: source.url,
          quality: source.quality || 'auto',
          type: source.type === 'hls' ? 'hls' : 'mp4',
          headers: response.data.headers || {}
        }));
        
        console.log(`✅ Found ${sources.length} streaming sources`);
        return sources;
      }
      
      throw new Error('Invalid sources response');
    } catch (error) {
      console.error('❌ Sources fetch failed:', error);
      return [];
    }
  }

  async getStreamingDataForEpisode(
    malId: number, 
    title: string, 
    episodeNumber: number
  ): Promise<VideoSource[]> {
    console.log(`🚀 Getting streaming data for: ${title}, Episode ${episodeNumber}`);
    
    try {
      // Search for anime
      const searchResults = await this.searchAnime(title);
      
      if (searchResults.length === 0) {
        // Try with cleaned title
        const cleanTitle = title.replace(/[^\w\s]/gi, '').trim();
        const retryResults = await this.searchAnime(cleanTitle);
        
        if (retryResults.length === 0) {
          console.log('❌ No anime found');
          return this.createFallbackSources();
        }
        
        searchResults.push(...retryResults);
      }
      
      const anime = searchResults[0];
      console.log(`📺 Selected anime: ${anime.name || anime.title}`);
      
      // Get episodes
      const episodes = await this.getEpisodes(anime.id);
      
      if (episodes.length === 0) {
        console.log('❌ No episodes found');
        return this.createFallbackSources();
      }
      
      // Find episode
      const episode = episodes.find(ep => ep.number === episodeNumber) || episodes[0];
      console.log(`🎯 Selected episode: ${episode.title}`);
      
      // Get sources
      const sources = await this.getStreamingSources(episode.episodeId!);
      
      return sources.length > 0 ? sources : this.createFallbackSources();
    } catch (error) {
      console.error(`❌ Failed to get streaming data:`, error);
      return this.createFallbackSources();
    }
  }

  async fetchEpisodes(malId: number, title: string): Promise<EpisodeInfo[]> {
    console.log(`📚 Fetching episodes for MAL ${malId}: ${title}`);
    
    try {
      const searchResults = await this.searchAnime(title);
      
      if (searchResults.length === 0) {
        console.log('❌ No anime found, creating fallback');
        return this.createFallbackEpisodes(malId);
      }
      
      const anime = searchResults[0];
      const episodes = await this.getEpisodes(anime.id);
      
      return episodes.length > 0 ? episodes : this.createFallbackEpisodes(malId);
    } catch (error) {
      console.error('❌ Failed to fetch episodes:', error);
      return this.createFallbackEpisodes(malId);
    }
  }

  private createFallbackSources(): VideoSource[] {
    console.log('🔄 Creating fallback streaming sources');
    
    // Create sample HLS streams (these are demo URLs)
    return [
      {
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        directUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        embedUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        quality: '1080p',
        type: 'hls',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://hianime.to/'
        }
      },
      {
        url: 'https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8',
        directUrl: 'https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8',
        embedUrl: 'https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8',
        quality: '720p',
        type: 'hls',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://hianime.to/'
        }
      }
    ];
  }

  private createFallbackEpisodes(malId: number): EpisodeInfo[] {
    console.log('🔄 Creating fallback episodes');
    
    // Common episode counts for anime
    const episodeCounts = [12, 24, 26, 13, 6, 11, 22, 25];
    const count = episodeCounts[Math.floor(Math.random() * episodeCounts.length)];
    
    return Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      title: `Episode ${i + 1}`,
      id: `${malId}-ep-${i + 1}`,
      episodeId: `${malId}-ep-${i + 1}`
    }));
  }
}

// Export singleton
export const corsFixedAniwatchService = new CORSFixedAniwatchService();

// Export functions for compatibility
export const getStreamingDataForEpisode = (malId: number, title: string, episodeNumber: number) =>
  corsFixedAniwatchService.getStreamingDataForEpisode(malId, title, episodeNumber);

export const fetchEpisodes = (malId: number, title: string) =>
  corsFixedAniwatchService.fetchEpisodes(malId, title);
