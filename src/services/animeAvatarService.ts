// Anime Avatar Service - generates URLs for anime character avatars
// This replaces the pravatar.cc service with anime-specific avatar sources

export class AnimeAvatarService {
  // Popular anime avatar services that provide anime character images
  private static readonly ANIME_AVATAR_APIS = [
    'https://api.waifu.pics/sfw/waifu', // Waifu API - returns random anime girl images
    'https://nekos.life/api/v2/img/neko', // Nekos Life - anime cat girls
    'https://api.jikan.moe/v4/random/characters' // MyAnimeList API - random anime characters
  ];

  // Curated list of anime character images (using reliable anime image sources)
  private static readonly CURATED_ANIME_AVATARS = [
    // Popular anime characters from Imgur (reliable hosting)
    'https://cdn.myanimelist.net/images/characters/9/310307.jpg', // Naruto
    'https://cdn.myanimelist.net/images/characters/7/284129.jpg', // Goku
    'https://cdn.myanimelist.net/images/characters/13/121194.jpg', // Luffy
    'https://cdn.myanimelist.net/images/characters/8/80891.jpg', // Natsu
    'https://cdn.myanimelist.net/images/characters/5/63149.jpg', // Ichigo
    'https://cdn.myanimelist.net/images/characters/11/54829.jpg', // Edward Elric
    'https://cdn.myanimelist.net/images/characters/6/392621.jpg', // Senku
    'https://cdn.myanimelist.net/images/characters/15/423717.jpg', // Tanjiro
    'https://cdn.myanimelist.net/images/characters/12/299404.jpg', // Deku
    'https://cdn.myanimelist.net/images/characters/8/353419.jpg', // Asta
    'https://cdn.myanimelist.net/images/characters/11/344972.jpg', // Rimuru
    'https://cdn.myanimelist.net/images/characters/6/272564.jpg', // Ainz
    'https://cdn.myanimelist.net/images/characters/5/310307.jpg', // Saitama
    'https://cdn.myanimelist.net/images/characters/6/63870.jpg', // Light Yagami
    'https://cdn.myanimelist.net/images/characters/8/75913.jpg', // Lelouch
    'https://cdn.myanimelist.net/images/characters/14/20981.jpg', // Spike Spiegel
    'https://cdn.myanimelist.net/images/characters/8/284129.jpg', // Vegeta
    'https://cdn.myanimelist.net/images/characters/9/299404.jpg', // Todoroki
    'https://cdn.myanimelist.net/images/characters/14/310306.jpg', // Bakugo
    'https://cdn.myanimelist.net/images/characters/2/50676.jpg', // Killua
    'https://cdn.myanimelist.net/images/characters/11/174517.jpg', // Gon
    'https://cdn.myanimelist.net/images/characters/7/50467.jpg', // Yusuke
    'https://cdn.myanimelist.net/images/characters/16/284120.jpg', // Inuyasha
    'https://cdn.myanimelist.net/images/characters/5/16581.jpg', // Kagome
    'https://cdn.myanimelist.net/images/characters/9/56213.jpg', // Sailor Moon
    'https://cdn.myanimelist.net/images/characters/9/69275.jpg', // Sakura
    'https://cdn.myanimelist.net/images/characters/7/284128.jpg', // Hinata
    'https://cdn.myanimelist.net/images/characters/9/284124.jpg', // Erza
    'https://cdn.myanimelist.net/images/characters/4/284125.jpg', // Lucy
    'https://cdn.myanimelist.net/images/characters/13/90537.jpg', // Asuka
    'https://cdn.myanimelist.net/images/characters/8/90536.jpg', // Rei
    'https://cdn.myanimelist.net/images/characters/9/215563.jpg', // Mikasa
    'https://cdn.myanimelist.net/images/characters/6/290885.jpg', // Historia
    'https://cdn.myanimelist.net/images/characters/7/348273.jpg', // Zero Two
    'https://cdn.myanimelist.net/images/characters/6/280235.jpg', // Rem
    'https://cdn.myanimelist.net/images/characters/7/317593.jpg', // Ram
    'https://cdn.myanimelist.net/images/characters/8/327145.jpg', // Emilia
    'https://cdn.myanimelist.net/images/characters/4/310967.jpg', // Megumin
    'https://cdn.myanimelist.net/images/characters/13/315492.jpg', // Aqua
    'https://cdn.myanimelist.net/images/characters/16/310968.jpg', // Darkness
    'https://cdn.myanimelist.net/images/characters/6/352858.jpg', // Raphtalia
    'https://cdn.myanimelist.net/images/characters/7/352859.jpg', // Filo
    'https://cdn.myanimelist.net/images/characters/4/377332.jpg', // Nezuko
    'https://cdn.myanimelist.net/images/characters/13/412902.jpg', // Shinobu
    'https://cdn.myanimelist.net/images/characters/5/377333.jpg', // Giyu
    'https://cdn.myanimelist.net/images/characters/9/412901.jpg', // Rengoku
    'https://cdn.myanimelist.net/images/characters/2/377334.jpg', // Inosuke
    'https://cdn.myanimelist.net/images/characters/8/377335.jpg', // Zenitsu
    'https://cdn.myanimelist.net/images/characters/12/412903.jpg', // Kanao
    'https://cdn.myanimelist.net/images/characters/11/412904.jpg', // Mitsuri
    'https://cdn.myanimelist.net/images/characters/16/412905.jpg'  // Obanai
  ];

  /**
   * Generate a random anime avatar URL
   * @param seed - Optional seed for consistent avatars (use user ID)
   * @returns URL to an anime character avatar
   */
  static getRandomAvatar(seed?: string | number): string {
    let index;
    
    if (seed) {
      // Generate consistent avatar based on seed
      const numericSeed = typeof seed === 'string' ? 
        seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 
        seed;
      index = numericSeed % this.CURATED_ANIME_AVATARS.length;
    } else {
      // Truly random avatar
      index = Math.floor(Math.random() * this.CURATED_ANIME_AVATARS.length);
    }
    
    return this.CURATED_ANIME_AVATARS[index];
  }

  /**
   * Get avatar for a specific user (consistent based on username/ID)
   * @param userIdentifier - Username or user ID
   * @returns Consistent anime avatar for this user
   */
  static getUserAvatar(userIdentifier: string): string {
    return this.getRandomAvatar(userIdentifier);
  }

  /**
   * Get avatar for character/review images
   * @param identifier - Any identifier for consistency
   * @param _size - Image size (ignored for now, but kept for API compatibility)
   * @returns Anime character avatar URL
   */
  static getCharacterAvatar(identifier: string | number, _size?: number): string {
    return this.getRandomAvatar(identifier);
  }

  /**
   * Get a random new avatar (for profile picture updates)
   * @returns Random anime avatar URL
   */
  static getNewRandomAvatar(): string {
    return this.getRandomAvatar(Date.now());
  }

  /**
   * Fetch anime avatar from external API (with fallback)
   * @returns Promise resolving to anime avatar URL
   */
  static async fetchAnimeAvatarFromAPI(): Promise<string> {
    try {
      // Try to get from waifu.pics API
      const response = await fetch('https://api.waifu.pics/sfw/waifu');
      const data = await response.json();
      
      if (data.url) {
        return data.url;
      }
    } catch {
      console.warn('Failed to fetch from anime API, using curated list');
    }
    
    // Fallback to curated list
    return this.getRandomAvatar();
  }
}

export default AnimeAvatarService;
