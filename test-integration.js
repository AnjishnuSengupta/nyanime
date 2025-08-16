// Test script to verify Aniwatch API integration
const API_BASE_URL = 'https://nyanime-backend.vercel.app/api/v2/hianime';

async function testAPIConnection() {
  console.log('Testing Aniwatch API connection...');
  
  try {
    // Test basic search
    console.log('1. Testing search endpoint...');
    const searchResponse = await fetch(`${API_BASE_URL}/search?q=naruto&page=1`);
    console.log(`Search status: ${searchResponse.status}`);
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log('Search response structure:', Object.keys(searchData));
      
      // Extract data properly based on API response structure
      const animes = searchData.data?.animes || searchData.animes || [];
      console.log(`Found ${animes.length} anime results`);
      
      if (animes.length > 0) {
        const firstAnime = animes[0];
        console.log(`First result: ${firstAnime.name} (ID: ${firstAnime.id})`);
        
        // Test episodes endpoint
        console.log('\n2. Testing episodes endpoint...');
        const episodesResponse = await fetch(`${API_BASE_URL}/anime/${firstAnime.id}/episodes`);
        console.log(`Episodes status: ${episodesResponse.status}`);
        
        if (episodesResponse.ok) {
          const episodesData = await episodesResponse.json();
          console.log('Episodes response structure:', Object.keys(episodesData));
          
          const episodes = episodesData.data?.episodes || episodesData.episodes || [];
          console.log(`Found ${episodes.length} episodes`);
          
          if (episodes.length > 0) {
            const firstEpisode = episodes[0];
            console.log(`First episode: ${firstEpisode.title} (ID: ${firstEpisode.episodeId})`);
            
            // Test streaming sources
            console.log('\n3. Testing streaming sources...');
            const sourcesResponse = await fetch(`${API_BASE_URL}/episode/sources?animeEpisodeId=${firstEpisode.episodeId}&category=sub`);
            console.log(`Sources status: ${sourcesResponse.status}`);
            
            if (sourcesResponse.ok) {
              const sourcesData = await sourcesResponse.json();
              console.log('Sources response structure:', Object.keys(sourcesData));
              
              const sources = sourcesData.data?.sources || sourcesData.sources || [];
              console.log(`Found ${sources.length} streaming sources`);
              
              if (sources.length > 0) {
                console.log('Sample source:', {
                  url: sources[0].url || 'No URL',
                  quality: sources[0].quality || 'No quality',
                  type: sources[0].type || 'No type'
                });
                console.log('✅ All API endpoints working correctly!');
              } else {
                console.log('⚠️ No streaming sources found');
              }
            } else {
              console.log('❌ Sources endpoint failed');
            }
          }
        } else {
          console.log('❌ Episodes endpoint failed');
        }
      }
    } else {
      console.log('❌ Search endpoint failed');
    }
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }
}

// Run the test
testAPIConnection();
