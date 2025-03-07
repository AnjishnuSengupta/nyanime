
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Settings, Maximize, 
         SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';

interface VideoPlayerProps {
  src: string;
  title: string;
  episodeNumber: number;
  totalEpisodes: number;
  thumbnail?: string;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  initialProgress?: number; // in seconds
  autoPlay?: boolean;
}

type QualityOption = '1080p' | '720p' | '480p' | '360p';

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title,
  episodeNumber,
  totalEpisodes,
  thumbnail,
  onNextEpisode,
  onPreviousEpisode,
  initialProgress = 0,
  autoPlay = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(initialProgress);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [quality, setQuality] = useState<QualityOption>('720p');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadedMetadata, setLoadedMetadata] = useState(false);
  
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const qualityOptions: QualityOption[] = ['1080p', '720p', '480p', '360p'];
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Initialize player and set up event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Set initial volume and progress
    video.volume = volume;
    if (initialProgress > 0) {
      video.currentTime = initialProgress;
    }
    
    if (autoPlay) {
      video.play().catch(error => {
        console.error('Autoplay failed:', error);
        setIsPlaying(false);
      });
    }
    
    // Set up event listeners
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setLoadedMetadata(true);
    };
    
    // Progress tracking
    const trackProgress = () => {
      if (video.currentTime > 0) {
        // Save progress every 5 seconds
        if (Math.floor(video.currentTime) % 5 === 0) {
          console.log('Saving progress:', video.currentTime);
          // This would be saved to the backend in a real app
        }
      }
    };
    
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('timeupdate', trackProgress);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('timeupdate', trackProgress);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [autoPlay, initialProgress, volume]);
  
  // Handle auto-hide controls
  useEffect(() => {
    const startHideControlsTimer = () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
      
      if (isPlaying) {
        hideControlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };
    
    startHideControlsTimer();
    
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, [isPlaying, showControls]);
  
  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Toggle play/pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(error => {
        console.error('Playback failed:', error);
        toast({
          title: "Playback Error",
          description: "Unable to play video. Please try again.",
          variant: "destructive",
          duration: 3000,
        });
      });
    }
  };
  
  // Toggle mute
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
  };
  
  // Change volume
  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = value[0];
    video.volume = newVolume;
    
    if (newVolume === 0) {
      video.muted = true;
    } else if (video.muted) {
      video.muted = false;
    }
  };
  
  // Seek to position
  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = value[0];
  };
  
  // Format time (seconds to MM:SS)
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Change playback speed
  const changePlaybackSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  };
  
  // Change video quality (simulated)
  const changeQuality = (newQuality: QualityOption) => {
    setQuality(newQuality);
    
    // In a real implementation, this would switch the video source
    // For this example, we'll just show a toast
    toast({
      title: "Quality Changed",
      description: `Video quality set to ${newQuality}`,
      duration: 2000,
    });
  };
  
  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    
    if (!isFullscreen) {
      if (playerRef.current.requestFullscreen) {
        playerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };
  
  // Skip forward 10 seconds
  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.min(video.currentTime + 10, video.duration);
  };
  
  // Skip backward 10 seconds
  const skipBackward = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(video.currentTime - 10, 0);
  };
  
  // Progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div 
      ref={playerRef}
      className="relative w-full bg-black overflow-hidden rounded-xl aspect-video"
      onMouseMove={() => {
        setShowControls(true);
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
        if (isPlaying) {
          hideControlsTimerRef.current = setTimeout(() => {
            setShowControls(false);
          }, 3000);
        }
      }}
      onMouseLeave={() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full"
        src={src}
        poster={thumbnail}
        onClick={togglePlay}
        playsInline
      />
      
      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-16 h-16 border-4 border-anime-purple border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top Bar */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm"
              className="text-white/90 hover:text-white hover:bg-white/10"
              onClick={onPreviousEpisode}
              disabled={episodeNumber <= 1 || !onPreviousEpisode}
            >
              <ChevronLeft className="h-5 w-5 mr-1" />
              Previous
            </Button>
          </div>
          
          <h3 className="text-white font-medium truncate max-w-[50%]">
            {title} - Episode {episodeNumber}
          </h3>
          
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm"
              className="text-white/90 hover:text-white hover:bg-white/10"
              onClick={onNextEpisode}
              disabled={episodeNumber >= totalEpisodes || !onNextEpisode}
            >
              Next
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          </div>
        </div>
        
        {/* Center Play/Pause Button */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Button 
            variant="ghost"
            size="icon"
            className={`w-16 h-16 rounded-full bg-anime-purple/80 text-white pointer-events-auto transition-opacity duration-300 ${
              !isPlaying || showControls ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="h-8 w-8" />
            ) : (
              <Play className="h-8 w-8" />
            )}
          </Button>
        </div>
        
        {/* Bottom Controls */}
        <div className="px-4 py-2 space-y-2">
          {/* Progress Bar */}
          <div className="relative group">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="h-1.5 cursor-pointer group-hover:h-2 transition-all"
            />
            
            {/* Buffered Indicator */}
            <div 
              className="absolute left-0 top-0 bottom-0 bg-white/30 pointer-events-none"
              style={{ width: `${50}%` }} // This would be dynamic in a real player
            ></div>
          </div>
          
          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                onClick={skipBackward}
              >
                <div className="relative flex items-center justify-center">
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-[10px] absolute">10</span>
                </div>
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                onClick={skipForward}
              >
                <div className="relative flex items-center justify-center">
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-[10px] absolute">10</span>
                </div>
              </Button>
              
              <div className="flex items-center space-x-1 group relative">
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                  onClick={toggleMute}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                
                <div className="w-16 h-8 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all origin-left absolute left-8">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="mt-3"
                  />
                </div>
              </div>
              
              <div className="text-white/80 text-xs">
                {formatTime(currentTime)} / {loadedMetadata ? formatTime(duration) : '--:--'}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Playback Speed */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 text-white/90 hover:text-white hover:bg-white/10 text-xs"
                  >
                    {playbackSpeed}x
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="bg-anime-dark/95 border-white/10 text-white"
                  align="end"
                >
                  {speedOptions.map(speed => (
                    <DropdownMenuItem
                      key={speed}
                      className={`cursor-pointer hover:bg-white/10 ${
                        playbackSpeed === speed ? 'bg-anime-purple/20 font-medium' : ''
                      }`}
                      onClick={() => changePlaybackSpeed(speed)}
                    >
                      {speed}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Quality Setting */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="bg-anime-dark/95 border-white/10 text-white"
                  align="end"
                >
                  {qualityOptions.map(q => (
                    <DropdownMenuItem
                      key={q}
                      className={`cursor-pointer hover:bg-white/10 ${
                        quality === q ? 'bg-anime-purple/20 font-medium' : ''
                      }`}
                      onClick={() => changeQuality(q)}
                    >
                      {q}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Fullscreen Toggle */}
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/10"
                onClick={toggleFullscreen}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
