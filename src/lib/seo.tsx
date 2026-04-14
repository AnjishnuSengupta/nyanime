import { Helmet } from 'react-helmet-async';

export interface SEOMetaData {
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterCreator?: string;
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  jsonLd?: Record<string, any>;
  robots?: {
    noindex?: boolean;
    follow?: boolean;
    nofollow?: boolean;
  };
}

const BASE_URL = 'https://nyanime.qzz.io';
const SITE_NAME = 'Nyanime';
const DEFAULT_DESCRIPTION = 'Watch anime online for free with Nyanime. Streaming thousands of anime series and movies. The ultimate anime streaming platform.';
const DEFAULT_KEYWORDS = ['anime', 'watch anime', 'nyanime', 'free anime', 'anime streaming', 'online anime', 'best anime site'];
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

export const SEO: React.FC<SEOMetaData> = ({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonicalUrl,
  ogImage = DEFAULT_IMAGE,
  ogType = 'website',
  ogUrl,
  twitterCard = 'summary_large_image',
  author = SITE_NAME,
  publishedDate,
  modifiedDate,
  jsonLd,
  robots,
}) => {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const canonicalLink = canonicalUrl || `${BASE_URL}${typeof window !== 'undefined' ? window.location.pathname : ''}`;
  const ogUrlValue = ogUrl || canonicalLink;

  // Build robots meta content
  const robotsContent = robots
    ? [
        robots.noindex ? 'noindex' : 'index',
        robots.nofollow ? 'nofollow' : robots.follow === false ? 'nofollow' : 'follow',
        'max-image-preview:large',
        'max-snippet:-1',
        'max-video-preview:-1',
      ].join(', ')
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <meta name="author" content={author} />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="robots" content={robotsContent} />

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalLink} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={ogUrlValue} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content="@nyanime" />
      <meta name="twitter:creator" content={author} />

      {/* Additional Meta Tags for Anime Content */}
      <meta name="theme-color" content="#1a1a1a" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {/* Date Tags */}
      {publishedDate && (
        <meta property="article:published_time" content={publishedDate} />
      )}
      {modifiedDate && (
        <meta property="article:modified_time" content={modifiedDate} />
      )}

      {/* Schema.org Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

// Organization Schema for Nyanime
export const getOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'name': SITE_NAME,
  'url': BASE_URL,
  'logo': `${BASE_URL}/logo.png`,
  'description': DEFAULT_DESCRIPTION,
  'sameAs': [
    'https://twitter.com/nyanime',
    'https://facebook.com/nyanime',
  ],
  'contactPoint': {
    '@type': 'ContactPoint',
    'contactType': 'Customer Service',
  },
});

// Breadcrumb Schema
export const getBreadcrumbSchema = (items: Array<{ name: string; url: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  'itemListElement': items.map((item, index) => ({
    '@type': 'ListItem',
    'position': index + 1,
    'name': item.name,
    'item': item.url,
  })),
});

// Anime Schema (TVSeries)
export const getAnimeSchema = (anime: {
  id: string;
  title: string;
  description?: string;
  image?: string;
  genres?: string[];
  rating?: number;
  releaseDate?: string;
  status?: string;
  totalEpisodes?: number;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'TVSeries',
  '@id': `${BASE_URL}/anime/${anime.id}`,
  'name': anime.title,
  'description': anime.description || DEFAULT_DESCRIPTION,
  'image': anime.image || DEFAULT_IMAGE,
  'url': `${BASE_URL}/anime/${anime.id}`,
  'genre': anime.genres || [],
  'aggregateRating': anime.rating ? {
    '@type': 'AggregateRating',
    'ratingValue': anime.rating,
    'ratingCount': '1000',
  } : undefined,
  'datePublished': anime.releaseDate,
  'status': anime.status || 'Unknown',
  'numberOfEpisodes': anime.totalEpisodes || 0,
});

// Episode/Video Schema
export const getVideoSchema = (video: {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  animeTitle?: string;
  episodeNumber?: number;
  duration?: number;
  publishDate?: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'VideoObject',
  'name': video.title,
  'description': video.description || DEFAULT_DESCRIPTION,
  'thumbnailUrl': video.thumbnail || DEFAULT_IMAGE,
  'uploadDate': video.publishDate || new Date().toISOString(),
  'duration': video.duration ? `PT${video.duration}M` : 'PT24M',
  'contentUrl': `${BASE_URL}/anime/${video.id}`,
});

// Article Schema (for blog posts or content pages)
export const getArticleSchema = (article: {
  title: string;
  description?: string;
  image?: string;
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  content?: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  'headline': article.title,
  'description': article.description || DEFAULT_DESCRIPTION,
  'image': article.image || DEFAULT_IMAGE,
  'author': {
    '@type': 'Organization',
    'name': article.author || SITE_NAME,
  },
  'datePublished': article.publishedDate || new Date().toISOString(),
  'dateModified': article.modifiedDate || new Date().toISOString(),
  'articleBody': article.content,
});

// Collection Schema (for lists)
export const getCollectionSchema = (collection: {
  name: string;
  description?: string;
  items: Array<{ id: string; title: string }>;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Collection',
  'name': collection.name,
  'description': collection.description,
  'itemListElement': (collection.items || []).map((item, index) => ({
    '@type': 'ListItem',
    'position': index + 1,
    'name': item.title,
    'url': `${BASE_URL}/anime/${item.id}`,
  })),
});
