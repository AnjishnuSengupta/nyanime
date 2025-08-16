// Simple CORS proxy test
const testCORSProxy = async () => {
  console.log('🔧 TESTING CORS PROXY SOLUTIONS 🔧\n');
  
  const testUrl = 'https://nyanime-backend.vercel.app/api/v2/hianime/search?q=naruto&page=1';
  console.log(`Target URL: ${testUrl}\n`);
  
  const proxies = [
    {
      name: 'AllOrigins',
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}`
    },
    {
      name: 'CORS Proxy IO', 
      url: `https://corsproxy.io/?${encodeURIComponent(testUrl)}`
    }
  ];
  
  for (const proxy of proxies) {
    try {
      console.log(`Testing ${proxy.name}...`);
      console.log(`Proxy URL: ${proxy.url}`);
      
      const response = await fetch(proxy.url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Response Status: ${response.status}`);
      console.log(`Response OK: ${response.ok}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${proxy.name} SUCCESS!`);
        console.log('Response structure:', Object.keys(data));
        
        // Check for AllOrigins format
        if (data.contents) {
          try {
            const parsed = JSON.parse(data.contents);
            console.log('Parsed data structure:', Object.keys(parsed));
            if (parsed.status === 200 && parsed.data) {
              console.log('🎉 Valid Aniwatch API response detected!');
              return true;
            }
          } catch (e) {
            console.log('Content is not JSON');
          }
        } else if (data.status === 200 && data.data) {
          console.log('🎉 Direct valid response!');
          return true;
        }
        
        console.log('Sample response:', JSON.stringify(data).substring(0, 200) + '...');
      } else {
        console.log(`❌ ${proxy.name} failed with status ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ ${proxy.name} error:`, error.message);
    }
    
    console.log('─'.repeat(50));
  }
  
  console.log('\n📋 SUMMARY:');
  console.log('If any proxy succeeded, the CORS fix will work!');
  console.log('The service includes fallback sources for immediate testing.');
  
  return false;
};

testCORSProxy();
