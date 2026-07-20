import Link from "next/link";

import { galleries, posts } from "#site/content";
import Marquee from "@/components/magicui/Marquee";
import PhotoCard from "@/components/PhotoCard";
import { siteConfig } from "@/config/site";
import { RdPhoto } from "@/lib/veliteUtils";
import Races from "@/components/races";
import { globals } from "#site/content";

export function generateMetadata() {
  const title = siteConfig.title;
  const description = siteConfig.description;
  const baseURL = siteConfig.baseURL;

  const ogImage = `${baseURL}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: baseURL,
      images: [
        {
          url: ogImage,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function Home() {
  const imageCount = galleries?.reduce((acc, gallery) => {
    return acc + gallery.images.length;
  }, 0);

  let featuredImages = galleries?.reduce((acc, gallery) => {
    return acc.concat(gallery.images.filter((image) => image.featured));
  }, [] as RdPhoto[]);

  featuredImages =
    featuredImages.length > 20 ? featuredImages.slice(0, 20) : featuredImages;

  const filteredPosts = posts
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((post) => post.published);

  return (
    <main className="container relative max-w-6xl py-6 lg:py-10">
      <section className="space-y-6 pb-8 md:pb-12 md:pt-10 lg:py-32">
        <div className="container mt-6 flex max-w-5xl flex-col items-center gap-4 text-center xl:mt-0">
          <div className="flex items-center space-x-2">
            {/* {SOCIALS.map((social) => (
            <Link
              key={social.label}
              href={social.path}
              rel="noreferrer"
              target="_blank"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "text-primary px-0 hover:bg-primary transition-colors rounded-full p-2 size-8 bg-primary/80"
              )}
            >
              <social.icon className="size-6" />
              <span className="sr-only">{social.label}</span>
            </Link>
          ))} */}
          </div>
          <h1 className="text-3xl capitalize sm:text-5xl md:text-6xl lg:text-7xl">
            {globals.heroTitleZh}
          </h1>
          <h1 className="text-primary text-3xl capitalize sm:text-5xl md:text-6xl lg:text-7xl">
            {globals.heroTitleEn} <br></br>
          </h1>
          {/* <p className="max-w-2xl leading-normal text-muted-foreground md:text-2xl sm:text-xl sm:leading-8">
            {siteConfig.description}
          </p> */}
        </div>
      </section>
      {filteredPosts?.length > 0 && (
        <>
          <h2 className="text-l capitalize sm:text-xl md:text-2xl lg:text-3xl text-center">
            Latest Posts
          </h2>
          <section>
            <Races
              allRaces={
                filteredPosts.length < 8
                  ? filteredPosts
                  : filteredPosts.splice(0, 8)
              }
            />
          </section>
        </>
      )}

      {featuredImages?.length > 0 && (
        <div
          key="card-container-gallery"
          className="rd-card flex flex-col pt-4 px-4 pb-3 -mx-4 h-[135px] mt-10"
        >
          <div className="absolute inset-0 gradient-blur h-full w-[200px] -z-40" />
          <Link href="/gallery" className="relative prose-article-card">
            <h1 className="flex flex-row">
              相册
              <span className="icon-[clarity--image-gallery-solid] ml-1 my-auto" />
            </h1>
            <button className="flex flex-row not-prose text-btn btn-sm">
              浏览 {imageCount} 张图片
              <span className="icon-[heroicons--chevron-right] my-auto" />
            </button>
          </Link>
          <>
            <div className="absolute left-0 right-0 overflow-clip rounded-2xl -z-50">
              <div className="relative rounded-2xl">
                <Marquee className="h-[160px] [--duration:240s] overflow-clip">
                  {featuredImages.map((image, i) => (
                    <PhotoCard
                      key={image.slug}
                      item={image}
                      maxWidth={250}
                      maxHeight={119}
                    />
                  ))}
                </Marquee>
              </div>
            </div>
          </>
        </div>
      )}
    </main>
  );
}
