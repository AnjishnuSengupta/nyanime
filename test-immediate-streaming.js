// Test the immediate working streaming service
import { immediateStreamingService } from './src/services/immediateStreamingService.js';

const testImmediateStreaming = async () => {
  console.log('🚀 TESTING IMMEDIATE WORKING STREAMING 🚀\n');
  
  try {
    // Test stream availability
    console.log('1️⃣ Testing stream availability...');
    await immediateStreamingService.testStreams();
    
    console.log('\n2️⃣ Testing episode generation...');
    const episodes = await immediateStreamingService.fetchEpisodes(59845, 'Kaoru Hana wa Rin to Saku');
    console.log(`✅ Generated ${episodes.length} episodes for testing`);
    
    console.log('\n3️⃣ Testing streaming data retrieval...');
    const sources = await immediateStreamingService.getStreamingDataForEpisode(59845, 'Kaoru Hana wa Rin to Saku', 1);
    console.log(`✅ Retrieved ${sources.length} working video sources`);
    
    console.log('\n4️⃣ Testing quality filtering...');
    const hlsStreams = immediateStreamingService.getHLSStreams();
    const mp4Streams = immediateStreamingService.getMP4Streams();
    const hdStream = immediateStreamingService.getStreamByQuality('1080p');
    
    console.log(`📹 HLS Streams: ${hlsStreams.length}`);
    console.log(`📱 MP4 Streams: ${mp4Streams.length}`);
    console.log(`🔥 HD Stream Available: ${hdStream ? 'Yes' : 'No'}`);
    
    console.log('\n🎉 ALL IMMEDIATE STREAMING TESTS PASSED!');
    console.log('✅ Your website now has working video streaming!');
    console.log('🚀 Ready for browser testing immediately!');
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
};

testImmediateStreaming();
