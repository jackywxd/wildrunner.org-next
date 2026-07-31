/** Public-site shapes decoupled from Velite and Payload document types. */

export type SiteImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
};

export type SitePhoto = SiteImage & {
  filename: string;
  slug: string;
  featured: boolean;
  blurWidth?: number;
  blurHeight?: number;
};

export type SiteVideo = {
  mediaId: number;
  id: string;
  filename: string;
  src: string;
  mimeType: string;
  slug: string;
  size?: number;
  extension?: string;
  lastModified?: string;
  streamId?: string | null;
  streamReady?: boolean;
};

export type SiteGallery = {
  slug: string;
  name: string;
  location?: string | null;
  created: string;
  eventDate?: string | null;
  isFeatured: boolean;
  /** Legacy OG helper: filename stems marked featured on images */
  featured: string[];
  cover?: SiteImage | null;
  images: SitePhoto[];
  videos: SiteVideo[];
};

export type SitePost = {
  id: number;
  title: string;
  slug: string;
  slugAsParams: string;
  description: string;
  date?: string;
  published: boolean;
  featured: boolean;
  author?: string;
  authorSlug?: string;
  image?: SiteImage;
  /** Only the detail query selects the body; card queries leave it undefined. */
  content?: import("@/payload-types").Post["content"];
};

export type SiteGlobals = {
  heroTitleEn: string;
  heroTitleZh: string;
  metadata: {
    titleDefault: string;
    titleTemplate: string;
    description: string;
  };
  social: {
    github?: string | null;
  };
  topNavItems: { label: string; href: string; icon?: string | null }[];
};
