// Test the enhanced video source service integration
import { getStreamingDataForEpisode } from './src/services/enhancedVideoSourceService.ts';

async function testEnhancedService() {
  console.log('Testing Enhanced Video Source Service...');
  
  try {
    // Test with a popular anime (Naruto)
    const result = await getStreamingDataForEpisode(
      "20", // MAL ID for Naruto
      1,    // Episode 1
      "Naruto",
      "sub"
    );
    
    if (result) {
      console.log('✅ Successfully got streaming data!');
      console.log(`Found ${result.sources.length} video sources`);
      console.log('Sources:', result.sources.map(s => ({
        provider: s.provider,
        quality: s.quality,
        hasUrl: !!s.directUrl || !!s.embedUrl
      })));
    } else {
      console.log('❌ No streaming data found');
    }
  } catch (error) {
    console.error('❌ Error testing enhanced service:', error.message);
  }
}

testEnhancedService();
