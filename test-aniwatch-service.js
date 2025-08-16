// Simple test to verify the integration
import('./src/services/aniwatchService.ts').then(async (service) => {
  console.log('Testing Aniwatch Service...');
  
  try {
    // Test search
    const searchResult = await service.searchAniwatchAnime('naruto');
    console.log(`✅ Search found ${searchResult.animes.length} results`);
    
    if (searchResult.animes.length > 0) {
      const anime = searchResult.animes.find(a => a.name.toLowerCase().includes('naruto'));
      if (anime) {
        console.log(`✅ Found anime: ${anime.name} (ID: ${anime.id})`);
        
        // Test episodes
        const episodes = await service.getAniwatchEpisodes(anime.id);
        console.log(`✅ Found ${episodes.episodes.length} episodes`);
        
        if (episodes.episodes.length > 0) {
          const firstEpisode = episodes.episodes[0];
          console.log(`✅ First episode: ${firstEpisode.title} (ID: ${firstEpisode.episodeId})`);
          
          // Test streaming sources
          const sources = await service.getAniwatchStreamingSources(firstEpisode.episodeId);
          console.log(`✅ Found ${sources.sources.length} streaming sources`);
          
          console.log('🎉 All tests passed! The integration is working.');
        }
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
});
