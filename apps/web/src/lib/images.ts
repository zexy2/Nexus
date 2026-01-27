/**
 * Stock Images Library
 * High-quality Unsplash images for premium landing page
 * Replace these with your own images later
 */

export const stockImages = {
  // Hero Section - Abstract, dramatic B&W
  hero: {
    main: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=90&auto=format",
    overlay: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=90&auto=format",
  },

  // Bento Gallery - Diverse, high-impact
  gallery: [
    {
      id: 1,
      src: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&q=80&auto=format",
      alt: "Abstract gradient art",
      size: "large",
    },
    {
      id: 2,
      src: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=600&q=80&auto=format",
      alt: "Minimal workspace",
      size: "small",
    },
    {
      id: 3,
      src: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=600&q=80&auto=format",
      alt: "3D abstract shapes",
      size: "small",
    },
    {
      id: 4,
      src: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800&q=80&auto=format",
      alt: "Neon lights",
      size: "medium",
    },
    {
      id: 5,
      src: "https://images.unsplash.com/photo-1633613286991-611fe299c4be?w=600&q=80&auto=format",
      alt: "Digital texture",
      size: "small",
    },
    {
      id: 6,
      src: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80&auto=format",
      alt: "Retro tech",
      size: "medium",
    },
  ],

  // Feature Sections - Product/Lifestyle
  features: [
    {
      id: 1,
      src: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=85&auto=format",
      alt: "Team collaboration",
    },
    {
      id: 2,
      src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=85&auto=format",
      alt: "Data analytics dashboard",
    },
    {
      id: 3,
      src: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&q=85&auto=format",
      alt: "Modern workspace",
    },
    {
      id: 4,
      src: "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&q=85&auto=format",
      alt: "AI visualization",
    },
  ],

  // Testimonial Avatars
  avatars: [
    {
      id: 1,
      src: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80&auto=format&fit=crop",
      name: "Alex Thompson",
      role: "CEO, TechCorp",
    },
    {
      id: 2,
      src: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&q=80&auto=format&fit=crop",
      name: "Sarah Chen",
      role: "Product Lead, Innovate",
    },
    {
      id: 3,
      src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80&auto=format&fit=crop",
      name: "Michael Park",
      role: "CTO, DataFlow",
    },
  ],

  // Background Patterns/Textures
  backgrounds: {
    noise: "https://images.unsplash.com/photo-1533628635777-112b2239b1c7?w=400&q=30&auto=format",
    gradient: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&q=80&auto=format",
    abstract: "https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=1920&q=80&auto=format",
  },

  // Logo/Brand Placeholders for partner section
  logos: {
    placeholder: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40' viewBox='0 0 120 40'%3E%3Crect fill='%23e5e5e5' width='120' height='40' rx='4'/%3E%3Ctext fill='%23a3a3a3' font-family='system-ui' font-size='12' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3ELogo%3C/text%3E%3C/svg%3E",
  },
};

// Video URLs (placeholder - replace with actual videos)
export const stockVideos = {
  heroBackground: "https://cdn.coverr.co/videos/coverr-abstract-black-and-white-waves-8520/1080p.mp4",
  productDemo: null, // Add your product demo video URL
};

// Utility function to get responsive image URL
export function getResponsiveImageUrl(
  baseUrl: string,
  width: number,
  quality: number = 80
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("w", width.toString());
  url.searchParams.set("q", quality.toString());
  url.searchParams.set("auto", "format");
  return url.toString();
}
