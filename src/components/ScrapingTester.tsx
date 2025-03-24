
import React, { useState } from 'react';
import { ScrapingService, ScrapingResult } from '../services/scrapingService';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Loader2, Shield, Code, Globe, Play } from "lucide-react";
import { toast } from '@/hooks/use-toast';
import { VideoSource } from '../services/videoSourceService';

const ScrapingTester: React.FC = () => {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScrapingResult | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Scraping options
  const [useCloudflareBypass, setUseCloudflareBypass] = useState(true);
  const [useSelenium, setUseSelenium] = useState(true);
  const [useCustomHeaders, setUseCustomHeaders] = useState(false);
  const [customHeaders, setCustomHeaders] = useState('');
  
  // Default anime URLs for quick scraping
  const commonAnimeUrls = [
    { name: "GoGoAnime", url: "https://gogoanime.gg/" },
    { name: "Zoro.to", url: "https://zoro.to/" },
    { name: "AniMixPlay", url: "https://animixplay.to/" },
    { name: "9anime", url: "https://9anime.to/" }
  ];
  
  const handleScrape = async () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a URL to scrape",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setResult(null);
    setVideoUrls([]);
    
    try {
      // Parse custom headers if enabled
      let headers = {};
      if (useCustomHeaders && customHeaders) {
        try {
          headers = JSON.parse(customHeaders);
        } catch (e) {
          toast({
            title: "Invalid Headers",
            description: "Custom headers must be valid JSON",
            variant: "destructive",
          });
        }
      }
      
      // Perform the scraping
      const scrapingResult = await ScrapingService.scrapeUrl(url, {
        useCloudflareBypass,
        useSelenium,
        customHeaders: useCustomHeaders ? headers : undefined
      });
      
      setResult(scrapingResult);
      
      // Extract video URLs from the result if successful
      if (scrapingResult.success && scrapingResult.html) {
        const extractedUrls = ScrapingService.extractVideoUrls(scrapingResult.html);
        setVideoUrls(extractedUrls);
        
        if (extractedUrls.length > 0) {
          toast({
            title: "Videos Found",
            description: `Found ${extractedUrls.length} potential video sources`,
          });
        }
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast({
        title: "Scraping Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to create a video source from a URL
  const createVideoSource = (url: string, index: number): VideoSource => {
    // Determine quality based on URL patterns
    let quality = 'Unknown';
    if (url.includes('1080')) quality = '1080p';
    else if (url.includes('720')) quality = '720p';
    else if (url.includes('480')) quality = '480p';
    else if (url.includes('hls') || url.includes('m3u8')) quality = 'HLS';
    
    return {
      id: `scraped-${index}`,
      provider: 'scraped',
      quality: quality,
      directUrl: url,
      isWorking: ScrapingService.isVideoUrl(url)
    };
  };

  // Function to test playing a video URL
  const testVideoUrl = (url: string) => {
    const videoPlayer = document.createElement('video');
    videoPlayer.style.position = 'fixed';
    videoPlayer.style.top = '0';
    videoPlayer.style.left = '0';
    videoPlayer.style.width = '100%';
    videoPlayer.style.height = '100%';
    videoPlayer.style.zIndex = '9999';
    videoPlayer.style.backgroundColor = 'black';
    videoPlayer.controls = true;
    videoPlayer.autoplay = true;
    
    const source = document.createElement('source');
    source.src = url;
    videoPlayer.appendChild(source);
    
    const closeButton = document.createElement('button');
    closeButton.innerText = 'Close';
    closeButton.style.position = 'fixed';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.zIndex = '10000';
    closeButton.style.padding = '5px 10px';
    closeButton.style.backgroundColor = '#f44336';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '4px';
    closeButton.style.cursor = 'pointer';
    
    closeButton.onclick = () => {
      document.body.removeChild(videoPlayer);
      document.body.removeChild(closeButton);
    };
    
    document.body.appendChild(videoPlayer);
    document.body.appendChild(closeButton);
    
    videoPlayer.onerror = () => {
      toast({
        title: "Playback Error",
        description: "This video URL failed to play. It might be restricted or invalid.",
        variant: "destructive",
      });
    };
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6">
      <Card className="border border-anime-gray/20 bg-anime-dark/50 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center">
            <Globe className="mr-2 h-5 w-5 text-anime-purple" />
            Advanced Anime Scraper
          </CardTitle>
          <CardDescription>
            Scrape any site for anime content - handles Cloudflare protection, JavaScript videos, and API blocks
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-col space-y-2">
              <label htmlFor="url" className="text-sm text-white/70">
                URL to Scrape
              </label>
              <div className="flex space-x-2">
                <Input
                  id="url"
                  placeholder="https://example.com/anime/episode-1"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-anime-darker/50 border-anime-gray/30 text-white"
                />
                <Button 
                  onClick={handleScrape} 
                  disabled={isLoading}
                  className="bg-anime-purple hover:bg-anime-purple/80"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scraping...
                    </>
                  ) : "Scrape"}
                </Button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {commonAnimeUrls.map((site) => (
                <Button
                  key={site.url}
                  variant="outline"
                  size="sm"
                  className="bg-anime-darker/70 border-anime-gray/30 text-white/80 hover:bg-anime-gray/30"
                  onClick={() => setUrl(site.url)}
                >
                  {site.name}
                </Button>
              ))}
            </div>
            
            <Separator className="bg-anime-gray/20" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="cloudflare" 
                  checked={useCloudflareBypass}
                  onCheckedChange={(checked) => setUseCloudflareBypass(checked as boolean)}
                />
                <label htmlFor="cloudflare" className="text-sm font-medium text-white/80 cursor-pointer">
                  <div className="flex items-center">
                    <Shield className="mr-1 h-3 w-3 text-anime-purple" />
                    Cloudflare Bypass
                  </div>
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="selenium" 
                  checked={useSelenium}
                  onCheckedChange={(checked) => setUseSelenium(checked as boolean)}
                />
                <label htmlFor="selenium" className="text-sm font-medium text-white/80 cursor-pointer">
                  <div className="flex items-center">
                    <Code className="mr-1 h-3 w-3 text-anime-purple" />
                    JavaScript Support
                  </div>
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="headers" 
                  checked={useCustomHeaders}
                  onCheckedChange={(checked) => setUseCustomHeaders(checked as boolean)}
                />
                <label htmlFor="headers" className="text-sm font-medium text-white/80 cursor-pointer">
                  Custom Headers
                </label>
              </div>
            </div>
            
            {useCustomHeaders && (
              <div>
                <label htmlFor="customHeaders" className="text-sm text-white/70">
                  Custom Headers (JSON format)
                </label>
                <textarea
                  id="customHeaders"
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder='{"Referer": "https://example.com", "X-Requested-With": "XMLHttpRequest"}'
                  className="w-full h-24 px-3 py-2 text-sm bg-anime-darker/70 border border-anime-gray/30 rounded-md text-white/90 mt-1"
                />
              </div>
            )}
          </div>
        </CardContent>
        
        {result && (
          <CardFooter className="flex-col items-start">
            <Separator className="mb-4 bg-anime-gray/20" />
            <Tabs defaultValue="videos" className="w-full">
              <TabsList className="bg-anime-darker w-full mb-4">
                <TabsTrigger value="videos">Video Sources</TabsTrigger>
                <TabsTrigger value="result">Raw Result</TabsTrigger>
              </TabsList>
              
              <TabsContent value="videos">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-white/80">
                    Found {videoUrls.length} potential video sources:
                  </h3>
                  
                  {videoUrls.length > 0 ? (
                    <div className="overflow-y-auto max-h-60 space-y-2">
                      {videoUrls.map((videoUrl, index) => (
                        <div key={index} className="p-3 bg-anime-darker rounded-md">
                          <div className="flex justify-between">
                            <span className="text-xs font-semibold text-anime-purple">Source #{index + 1}</span>
                            <span className="text-xs text-white/50">
                              {ScrapingService.isVideoUrl(videoUrl) ? "✅ Valid Video" : "⚠️ Potential Video"}
                            </span>
                          </div>
                          <p className="text-xs text-white/80 break-all mt-1">{videoUrl}</p>
                          <div className="mt-2 flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7 px-2 bg-anime-purple/20 hover:bg-anime-purple/30 border-anime-purple/30 flex items-center"
                              onClick={() => testVideoUrl(videoUrl)}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Play
                            </Button>
                            
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7 px-2 bg-anime-gray/20 hover:bg-anime-gray/30 border-anime-gray/30"
                              onClick={() => window.open(videoUrl, '_blank')}
                            >
                              Test URL
                            </Button>
                            
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7 px-2 bg-anime-purple/20 hover:bg-anime-purple/30 border-anime-purple/30"
                              onClick={() => {
                                navigator.clipboard.writeText(videoUrl);
                                toast({
                                  title: "Copied to clipboard",
                                  duration: 2000,
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-white/60 text-sm">No video sources found in scraped content.</p>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="result">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-white/80">
                    Scraping Result ({result.success ? "Success" : "Failed"})
                  </h3>
                  <div className="text-xs text-white/60">Source: {result.source}</div>
                  {result.error && (
                    <div className="text-sm text-red-400">Error: {result.error}</div>
                  )}
                  
                  <div className="overflow-auto max-h-60 bg-anime-darker/70 p-2 rounded-md border border-anime-gray/20">
                    <pre className="text-xs text-white/80 whitespace-pre-wrap break-words">
                      {result.html ? (
                        result.html.length > 1000 
                          ? result.html.substring(0, 1000) + "... (truncated)"
                          : result.html
                      ) : JSON.stringify(result.data || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export default ScrapingTester;
