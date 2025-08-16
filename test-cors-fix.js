// Test the CORS-fixed streaming implementation
import { corsFixedAniwatchService } from './src/services/corsFixedAniwatchService.js';

const testCORSFix = async () => {
  console.log('🧪 TESTING CORS-FIXED STREAMING SERVICE 🧪\n');
  
  try {
    console.log('1️⃣ Testing search functionality...');
    const searchResults = await corsFixedAniwatchService.searchAnime('naruto');
    console.log(`✅ Search Results: ${searchResults.length} anime found`);
    
    if (searchResults.length > 0) {
      const anime = searchResults[0];
      console.log(`📺 First Result: ${anime.name || anime.title}`);
      
      console.log('\n2️⃣ Testing episode fetch...');
      const episodes = await corsFixedAniwatchService.getEpisodes(anime.id);
      console.log(`✅ Episodes Found: ${episodes.length} episodes`);
      
      if (episodes.length > 0) {
        console.log('\n3️⃣ Testing streaming sources...');
        const sources = await corsFixedAniwatchService.getStreamingSources(episodes[0].episodeId);
        console.log(`✅ Streaming Sources: ${sources.length} sources found`);
        
        if (sources.length > 0) {
          console.log('📹 Sample Source:', {
            quality: sources[0].quality,
            type: sources[0].type,
            hasHeaders: !!sources[0].headers,
            url: sources[0].url?.substring(0, 50) + '...'
          });
        }
      }
    }
    
    console.log('\n4️⃣ Testing full integration...');
    const integrationResult = await corsFixedAniwatchService.getStreamingDataForEpisode(59845, 'Kaoru Hana wa Rin to Saku', 1);
    console.log(`✅ Integration Test: ${integrationResult.length} sources ready for playback`);
    
    console.log('\n🎉 ALL TESTS COMPLETED!');
    console.log('Ready for browser testing! 🚀');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log('\n🔄 Fallback sources will be used');
  }
};

testCORSFix();
