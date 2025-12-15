import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check } from 'lucide-react';

// Curated anime avatars with verified MAL IDs and correct image URLs
const ANIME_AVATARS = [
  // Male characters
  { id: 17, url: 'https://cdn.myanimelist.net/images/characters/2/284121.jpg', name: 'Naruto Uzumaki' },
  { id: 246, url: 'https://cdn.myanimelist.net/images/characters/15/72546.jpg', name: 'Son Goku' },
  { id: 40, url: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg', name: 'Monkey D. Luffy' },
  { id: 11, url: 'https://cdn.myanimelist.net/images/characters/9/72533.jpg', name: 'Edward Elric' },
  { id: 45627, url: 'https://cdn.myanimelist.net/images/characters/2/241413.jpg', name: 'Levi Ackerman' },
  { id: 80, url: 'https://cdn.myanimelist.net/images/characters/6/63870.jpg', name: 'Light Yagami' },
  { id: 71, url: 'https://cdn.myanimelist.net/images/characters/10/249647.jpg', name: 'L Lawliet' },
  { id: 417, url: 'https://cdn.myanimelist.net/images/characters/8/406163.jpg', name: 'Lelouch Lamperouge' },
  { id: 117909, url: 'https://cdn.myanimelist.net/images/characters/7/299404.jpg', name: 'Izuku Midoriya' },
  { id: 40882, url: 'https://cdn.myanimelist.net/images/characters/10/216895.jpg', name: 'Eren Yeager' },
  { id: 13, url: 'https://cdn.myanimelist.net/images/characters/9/131317.jpg', name: 'Sasuke Uchiha' },
  { id: 85, url: 'https://cdn.myanimelist.net/images/characters/7/284129.jpg', name: 'Kakashi Hatake' },
  { id: 36765, url: 'https://cdn.myanimelist.net/images/characters/7/204821.jpg', name: 'Kirito' },
  { id: 12, url: 'https://cdn.myanimelist.net/images/characters/5/54265.jpg', name: 'Alphonse Elric' },
  { id: 65643, url: 'https://cdn.myanimelist.net/images/characters/9/277325.jpg', name: 'Koro-sensei' },
  // Female characters
  { id: 40881, url: 'https://cdn.myanimelist.net/images/characters/9/215563.jpg', name: 'Mikasa Ackerman' },
  { id: 118737, url: 'https://cdn.myanimelist.net/images/characters/16/551926.jpg', name: 'Emilia' },
  { id: 118763, url: 'https://cdn.myanimelist.net/images/characters/9/311327.jpg', name: 'Rem' },
  { id: 118765, url: 'https://cdn.myanimelist.net/images/characters/15/306390.jpg', name: 'Ram' },
  { id: 146157, url: 'https://cdn.myanimelist.net/images/characters/2/378254.jpg', name: 'Nezuko Kamado' },
  { id: 36828, url: 'https://cdn.myanimelist.net/images/characters/15/262053.jpg', name: 'Asuna Yuuki' },
  { id: 118739, url: 'https://cdn.myanimelist.net/images/characters/2/366639.jpg', name: 'Mai Sakurajima' },
  { id: 2, url: 'https://cdn.myanimelist.net/images/characters/15/264961.jpg', name: 'Faye Valentine' },
];

interface AvatarSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (avatarUrl: string) => void;
  currentAvatar?: string;
}

const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentAvatar
}) => {
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentAvatar || '');

  const handleSelect = (url: string) => {
    setSelectedAvatar(url);
  };

  const handleConfirm = () => {
    onSelect(selectedAvatar);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-anime-dark border-anime-purple/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Choose Your Avatar
          </DialogTitle>
          <DialogDescription className="text-white/70">
            Select an anime character as your profile avatar
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[500px] pr-4">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4 p-2">
            {ANIME_AVATARS.map((avatar) => (
              <div
                key={avatar.id}
                className={`relative cursor-pointer group transition-all ${
                  selectedAvatar === avatar.url
                    ? 'ring-4 ring-anime-purple rounded-lg scale-105'
                    : 'hover:scale-105'
                }`}
                onClick={() => handleSelect(avatar.url)}
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-anime-gray">
                  <img
                    src={avatar.url}
                    alt={avatar.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                
                {selectedAvatar === avatar.url && (
                  <div className="absolute inset-0 bg-anime-purple/20 rounded-lg flex items-center justify-center">
                    <div className="bg-anime-purple rounded-full p-2">
                      <Check className="w-6 h-6 text-white" />
                    </div>
                  </div>
                )}
                
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs py-1 px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatar.name}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-white/10 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAvatar}
            className="bg-anime-purple hover:bg-anime-purple/90"
          >
            Confirm Selection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarSelector;
