
import React from 'react';

interface SkeletonCardProps {
  aspectRatio?: 'portrait' | 'landscape';
}

export const SkeletonCard = ({ aspectRatio = 'portrait' }: SkeletonCardProps) => {
  return (
    <div className="animate-pulse">
      <div 
        className={`bg-anime-gray/60 rounded-lg overflow-hidden ${
          aspectRatio === 'portrait' ? 'aspect-[2/3]' : 'aspect-[16/10]'
        }`}
      ></div>
      <div className="mt-2 space-y-2">
        <div className="h-4 bg-anime-gray/60 rounded w-3/4"></div>
        <div className="h-3 bg-anime-gray/40 rounded w-1/2"></div>
      </div>
    </div>
  );
};

export const CategorySkeleton = () => {
  return (
    <div className="py-6 md:py-10 animate-pulse">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-5">
          <div className="h-8 bg-anime-gray/60 rounded w-1/4"></div>
          <div className="h-4 bg-anime-gray/40 rounded w-16"></div>
        </div>
        
        <div className="flex space-x-4 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-shrink-0 w-[180px] sm:w-[220px] md:w-[250px]">
              <SkeletonCard aspectRatio="landscape" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const GridSkeleton = () => {
  return (
    <section className="py-8 md:py-12 animate-pulse">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 bg-anime-gray/60 rounded w-1/4"></div>
          <div className="h-4 bg-anime-gray/40 rounded w-16"></div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export const HeroSkeleton = () => {
  return (
    <section className="relative w-full h-[70vh] md:h-[80vh] overflow-hidden animate-pulse">
      <div className="absolute inset-0 bg-anime-gray/30"></div>
      <div className="relative z-10 h-full flex flex-col justify-end">
        <div className="container mx-auto px-4 md:px-6 pb-16 md:pb-20">
          <div className="max-w-3xl">
            <div className="h-6 bg-anime-gray/60 rounded-full w-40 mb-4"></div>
            <div className="h-12 bg-anime-gray/60 rounded w-3/4 mb-3"></div>
            <div className="h-4 bg-anime-gray/40 rounded w-full max-w-2xl mb-2"></div>
            <div className="h-4 bg-anime-gray/40 rounded w-2/3 mb-6"></div>
            <div className="flex gap-3">
              <div className="h-12 bg-anime-gray/60 rounded-full w-36"></div>
              <div className="h-12 bg-anime-gray/40 rounded-full w-36"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
