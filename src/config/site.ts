import authorAvatar from "../../public/images/author/devbertskie.png";
export const siteConfig = {
  baseURL: process.env.NEXT_PUBLIC_SITE_URL,
  name: "Wild Runner",
  title: "野馬營",
  description: "野馬營，一群野馬，一個家",
  author: "追雲逐雪",
  authorImage: authorAvatar,
  slogan: "心如野馬，馳騁天下",
  social: {
    github: "https://github.com/jackywxd",
    twitter: "https://twitter.com",
    facebook: "https://facebook.com",
  },
};

export type SiteConfig = typeof siteConfig;
