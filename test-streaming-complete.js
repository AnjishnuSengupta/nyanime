// Comprehensive streaming test with headers
import('./src/services/enhancedVideoSourceService.ts').then(async (service) => {
  console.log('🔥 COMPREHENSIVE STREAMING TEST 🔥');
  
  try {
    // Test the complete pipeline for a popular anime
    console.log('\n1. Testing streaming data retrieval...');
    const result = await service.getStreamingDataForEpisode(
      "20", // MAL ID for Naruto
      1,    // Episode 1
      "Naruto",
      "sub"
    );
    
    if (result && result.sources.length > 0) {
      console.log(`✅ Found ${result.sources.length} streaming sources`);
      
      const firstSource = result.sources[0];
      console.log('\n2. Source details:');
      console.log(`   URL: ${firstSource.directUrl}`);
      console.log(`   Quality: ${firstSource.quality}`);
      console.log(`   M3U8: ${firstSource.isM3U8}`);
      console.log(`   Provider: ${firstSource.provider}`);
      console.log(`   Headers: ${JSON.stringify(firstSource.headers, null, 2)}`);
      
      // Test if headers are properly included
      if (firstSource.headers) {
        console.log('\n3. Testing stream access with headers...');
        
        try {
          const response = await fetch(firstSource.directUrl, {
            method: 'HEAD',
            headers: firstSource.headers
          });
          
          console.log(`   Status: ${response.status}`);
          console.log(`   Content-Type: ${response.headers.get('content-type')}`);
          
          if (response.status === 200) {
            console.log('✅ STREAMING URL IS ACCESSIBLE WITH HEADERS!');
          } else {
            console.log('⚠️ Streaming URL returned non-200 status');
          }
        } catch (error) {
          console.log(`❌ Error testing stream access: ${error.message}`);
        }
      } else {
        console.log('⚠️ No headers found - this might cause streaming issues');
      }
      
      // Test subtitle availability
      if (result.subtitles && result.subtitles.length > 0) {
        console.log(`\n4. Subtitles: Found ${result.subtitles.length} subtitle tracks`);
        result.subtitles.forEach((sub, i) => {
          console.log(`   ${i + 1}. ${sub.lang}: ${sub.url}`);
        });
      }
      
      console.log('\n🎉 STREAMING TEST COMPLETED!');
    } else {
      console.log('❌ No streaming data found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
});
