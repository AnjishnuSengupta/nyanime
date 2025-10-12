import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import aniwatchApi from '../services/aniwatchApiService';

const ApiTester = () => {
  const [testResults, setTestResults] = useState<string>('');
  const [animeTitle, setAnimeTitle] = useState('Naruto');
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    setTestResults(prev => prev + '\n' + message);
    console.log(message);
  };

  const testConnection = async () => {
    setLoading(true);
    setTestResults('🧪 Testing API Connection...\n');
    
    try {
      const isConnected = await aniwatchApi.testConnection();
      addLog(isConnected ? '✅ API Connection Successful!' : '❌ API Connection Failed');
    } catch (error) {
      addLog('❌ Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const testSearch = async () => {
    setLoading(true);
    setTestResults(`🔍 Searching for: ${animeTitle}\n`);
    
    try {
      const results = await aniwatchApi.searchAnime(animeTitle);
      addLog(`✅ Found ${results.length} results`);
      results.slice(0, 3).forEach(anime => {
        addLog(`  - ${anime.name} (ID: ${anime.id})`);
      });
    } catch (error) {
      addLog('❌ Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const testEpisodes = async () => {
    setLoading(true);
    setTestResults(`📺 Getting episodes for: ${animeTitle}\n`);
    
    try {
      const searchResults = await aniwatchApi.searchAnime(animeTitle);
      if (searchResults.length === 0) {
        addLog('❌ No anime found');
        return;
      }
      
      const anime = searchResults[0];
      addLog(`✅ Found: ${anime.name} (ID: ${anime.id})`);
      
      const episodes = await aniwatchApi.getEpisodes(anime.id);
      addLog(`✅ Found ${episodes.length} episodes`);
      episodes.slice(0, 5).forEach(ep => {
        addLog(`  - Episode ${ep.number}: ${ep.title}`);
      });
    } catch (error) {
      addLog('❌ Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const testStreaming = async () => {
    setLoading(true);
    setTestResults(`🎬 Getting streaming sources for: ${animeTitle} Episode ${episodeNumber}\n`);
    
    try {
      const sources = await aniwatchApi.getStreamingDataForEpisode(animeTitle, episodeNumber, 'sub');
      
      if (sources.length === 0) {
        addLog('❌ No streaming sources found');
        return;
      }
      
      addLog(`✅ Found ${sources.length} video sources:`);
      sources.forEach(source => {
        addLog(`  - Quality: ${source.quality}, Type: ${source.type}, URL: ${source.url.substring(0, 50)}...`);
      });
    } catch (error) {
      addLog('❌ Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-anime-darker p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Aniwatch API Tester</h1>
        
        <div className="glass-card p-6 rounded-xl mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Test Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-white/70 text-sm mb-2 block">Anime Title</label>
              <Input
                value={animeTitle}
                onChange={(e) => setAnimeTitle(e.target.value)}
                className="bg-anime-dark border-white/10 text-white"
                placeholder="Enter anime title"
              />
            </div>
            
            <div>
              <label className="text-white/70 text-sm mb-2 block">Episode Number</label>
              <Input
                type="number"
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(parseInt(e.target.value))}
                className="bg-anime-dark border-white/10 text-white"
                min="1"
              />
            </div>
          </div>
        </div>
        
        <div className="glass-card p-6 rounded-xl mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Tests</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={testConnection}
              disabled={loading}
              className="bg-anime-purple hover:bg-anime-purple/90"
            >
              Test Connection
            </Button>
            
            <Button
              onClick={testSearch}
              disabled={loading}
              className="bg-anime-purple hover:bg-anime-purple/90"
            >
              Test Search
            </Button>
            
            <Button
              onClick={testEpisodes}
              disabled={loading}
              className="bg-anime-purple hover:bg-anime-purple/90"
            >
              Test Episodes
            </Button>
            
            <Button
              onClick={testStreaming}
              disabled={loading}
              className="bg-anime-purple hover:bg-anime-purple/90"
            >
              Test Streaming
            </Button>
          </div>
        </div>
        
        <div className="glass-card p-6 rounded-xl">
          <h2 className="text-xl font-bold text-white mb-4">Results</h2>
          
          <pre className="bg-anime-darker p-4 rounded-lg text-white/80 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
            {testResults || 'Click a test button to see results...'}
          </pre>
        </div>
        
        <div className="mt-6 text-center">
          <a href="/" className="text-anime-purple hover:underline">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default ApiTester;
