import path from "node:path";
import { defineCollection, defineConfig, Image, s } from "velite";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import fs from "fs/promises";

import {
  convertImagesToWebP,
  convertToWebP,
  setFeaturedImages,
  uploadVideoToR2,
  isVideoFile,
} from "@/lib/veliteUtils";
import { projectRootPath, staticBasePath } from "@/base-path";

const veliteRoot = "src/content";

const processImages = () => async (tree: any, file: any) => {
  const traverse = async (node: any) => {
    if (node.type === "element" && node.properties?.src) {
      const src = node.properties.src;
      // 只处理图片，不处理视频
      if (
        !src.startsWith("http") &&
        !src.startsWith("//") &&
        !isVideoFile(src)
      ) {
        try {
          if (!file || !file.path) {
            console.warn(`⚠️ Invalid file object for image: ${src}`);
            return;
          }
          const postDir = path.dirname(file.path);
          let filename = path.basename(src);
          let inputPath = postDir;
          let actualImagePath: string;
          if (src.startsWith("/static/")) {
            actualImagePath = path.join(inputPath, filename);
          } else if (src.startsWith("./")) {
            const relativePath = src.replace("./", "");
            filename = path.basename(relativePath);
            actualImagePath = path.join(inputPath, relativePath);
          } else if (src.startsWith("../")) {
            filename = path.basename(src);
            actualImagePath = path.resolve(inputPath, src);
          } else if (!src.startsWith("/")) {
            actualImagePath = path.join(inputPath, src);
          } else {
            actualImagePath = path.join(inputPath, filename);
          }
          if (!filename || !inputPath || !actualImagePath) {
            console.warn(`⚠️ Invalid parameters for image processing: ${src}`, {
              filename,
              inputPath,
              actualImagePath,
            });
            return;
          }
          try {
            await fs.access(actualImagePath);
          } catch (error) {
            console.warn(
              `⚠️ Image file not found: ${actualImagePath}, skipping...`
            );
            return;
          }
          const slugParts = path.dirname(file.path).split(path.sep);
          const slug = slugParts.slice(-3).join("/");
          if (!slug) {
            console.warn(`⚠️ Invalid slug for image: ${src}`);
            return;
          }
          const image = await convertToWebP(inputPath, slug, filename);
          if (image && image.src) {
            const newProperties = {
              ...node.properties,
              src: image.src,
              width: image.width,
              height: image.height,
              blurdataurl: image.blurDataURL,
              loading: "lazy",
              placeholder: "blur",
            };
            node.properties = newProperties;
          } else {
            console.warn(`⚠️ Failed to get image data for: ${filename}`);
          }
        } catch (error) {
          console.error(`❌ Failed to process inline image: ${src}`, error);
        }
      } else if (src.startsWith("http") || src.startsWith("//")) {
        // 跳过外部图片
      }
    }
    if (node.children && Array.isArray(node.children)) {
      await Promise.all(node.children.map(traverse));
    }
  };
  await traverse(tree);
};

// 处理 MDX 内容中的视频文件
const processVideosInMdx = async (
  mdxContent: string,
  inputPath: string,
  slug: string
) => {
  // 支持 React 代码和 MDX 原始标签两种格式
  // 1. React 代码格式
  const reactVideoRegex = /l\("video",\{[^}]*src:["']([^"']+)["'][^}]*\}/g;
  let processedContent = mdxContent;
  let reactMatch;
  while ((reactMatch = reactVideoRegex.exec(mdxContent)) !== null) {
    const videoSrc = reactMatch[1];
    const filename = path.basename(videoSrc);
    if (isVideoFile(filename)) {
      try {
        const videoInfo = await uploadVideoToR2(inputPath, slug, filename);
        if (videoInfo && videoInfo.src) {
          const escapedSrc = videoSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const newRegex = new RegExp(`src:["']${escapedSrc}["']`, "g");
          processedContent = processedContent.replace(
            newRegex,
            `src:\"${videoInfo.src}\"`
          );
        }
      } catch (error) {
        console.error(`Failed to process React video: ${videoSrc}`, error);
      }
    }
  }
  // 2. MDX 原始标签格式
  const videoRegex = /<video[^>]*src=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = videoRegex.exec(mdxContent)) !== null) {
    const videoSrc = match[1];
    const filename = path.basename(videoSrc);
    if (isVideoFile(filename)) {
      try {
        const videoInfo = await uploadVideoToR2(inputPath, slug, filename);
        if (videoInfo && videoInfo.src) {
          const escapedSrc = videoSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const newRegex = new RegExp(`src=["']${escapedSrc}["']`, "g");
          processedContent = processedContent.replace(
            newRegex,
            `src=\"${videoInfo.src}\"`
          );
        }
      } catch (error) {
        console.error(`Failed to process MDX video: ${videoSrc}`, error);
      }
    }
  }
  return processedContent;
};

const computedFields = async <
  T extends {
    slug: string;
    title: string;
    image?: Image;
    body?: string;
  },
>(
  data: T
) => {
  const file = data?.image?.src.split("/").pop();
  const inputPath = path.join(projectRootPath, veliteRoot, data.slug);
  if (file && inputPath) {
    console.log("uploading image to r2", file);
    const image = await convertToWebP(inputPath, data.slug, file);
    if (image) {
      data.image = image;
    }
  }
  // 处理 MDX 内容中的视频文件
  if (data.body) {
    try {
      data.body = await processVideosInMdx(data.body, inputPath, data.slug);
    } catch (error) {
      console.error(`Error processing videos in MDX: ${data.slug}`, error);
    }
  }
  return {
    ...data,
    year: data.slug.split("/")[1] || new Date().getFullYear().toString(),
    slugAsParams: data.slug.split("/").slice(1).join("/"),
  };
};

const globals = {
  name: "Global",
  pattern: "globals/*.json",
  single: true,
  schema: s.object({
    heroTitleEn: s.string().default("Run wild, run free."),
    heroTitleZh: s.string().default("心如野馬，馳騁天下"),
    metadata: s.object({
      title: s
        .object({ default: s.string(), template: s.string() })
        .default({ default: "野馬營", template: "%s | 野馬營" }),
      description: s.string().default("Welcome to 野馬營."),
      authors: s
        .array(s.object({ name: s.string(), url: s.string().url().optional() }))
        .default([]),
      keywords: s.array(s.string()).default([]),
      openGraph: s
        .object({
          title: s
            .object({ default: s.string(), template: s.string() })
            .default({ default: "野馬營", template: "%s | 野馬營" }),
          description: s.string().default("Welcome to 野馬營."),
          url: s.string().optional(),
          siteName: s.string().default("野馬營"),
          images: s
            .array(
              s.object({
                url: s.string().url(), // Must be an absolute URL
                width: s.number(),
                height: s.number(),
                alt: s.string().optional(),
              })
            )
            .optional(),
          locale: s.string().optional(),
          type: s.string().optional(),
        })
        .default({}),
    }),
    social: s
      .object({
        github: s.string(),
      })
      .optional(),
    topNavItems: s.array(
      s.object({ label: s.string(), href: s.string(), icon: s.string() })
    ),
  }),
};

const galleries = defineCollection({
  name: "Gallery",
  pattern: "gallery/**/*.mdx",
  schema: s
    .object({
      name: s.string(),
      slug: s.slug("gallery"), // this is path for the gallery, not the slug
      cover: s.image().optional(),
      created: s.isodate().optional(),
      updated: s.isodate().optional(),
      location: s.string().optional(),
      featured: s.array(s.string()).default([]),
      path: s.path(),
    })
    .transform(async (data) => ({
      ...data,
      permalink: `/gallery/${data.slug}`,
      images: setFeaturedImages(
        data.featured,
        await convertImagesToWebP(
          path.join(projectRootPath, veliteRoot, data.path),
          path.join(data.path)
        )
      ),
    })),
});

const posts = defineCollection({
  name: "Post", // collection type name
  pattern: "posts/**/*.mdx", // content files glob pattern
  schema: s
    .object({
      title: s.string(), // Zod primitive type
      slug: s.path(),
      created: s.isodate().optional(), // input Date-like string, output ISO Date string.
      updated: s.isodate().optional(),
      featured: s.boolean().default(false),
      cover: s.image().optional(), // input image relative path, output image object with blurImage.
      excerpt: s.string().default(""),
      seoDescription: s.string().default(""),
      author: s.string().default(""),
      columns: s.array(s.string()).default([]),
      categories: s.array(s.string()).default([]),
      tags: s.array(s.string()).default([]),
      body: s.mdx({
        rehypePlugins: [processImages],
      }),
      raw: s.raw(),
      path: s.path(),
      toc: s.toc(), // table of contents of markdown content
      date: s.isodate().default(() => new Date().toISOString()),
      published: s.boolean().default(false),
      image: s.image().optional(),
      video: s.file().optional(),
      description: s.string().max(999),
      metadata: s.metadata(), // extract markdown reading-time, word-count, etc.
    })
    .transform(async (data) => {
      const transformedData = await computedFields(data);
      return {
        ...transformedData,
      };
    }),
});

const authors = defineCollection({
  name: "Author",
  pattern: "authors/**/*.md",
  schema: s
    .object({
      name: s.string(),
      slug: s.slug("authors"),
      bio: s.mdx(),
      avatar: s.image().optional(),
      social: s
        .object({
          github: s.string(),
        })
        .optional(),
    })
    .transform((data) => ({ ...data, permalink: `/author/${data.slug}` })),
});

export default defineConfig({
  root: veliteRoot,
  output: {
    data: ".velite",
    assets: "public/static",
    base: "/static/",
    name: "[name].[ext]",
    clean: true,
  },
  collections: { posts, galleries, authors, globals },
  complete: async (data, context) => {
    // 检查必要的环境变量
    const requiredEnvVars = [
      "R2_PUBLIC_URL",
      "S3_ENDPOINT",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_BUCKET",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );
    if (missingVars.length > 0) {
      console.warn(`⚠️ 缺少环境变量: ${missingVars.join(", ")}`);
      console.warn("请确保设置了所有必要的R2配置环境变量");
    }

    console.log("✅ Velite 构建完成，所有图片已上传到 Cloudflare R2");
    console.log(`📊 处理了 ${data.posts?.length || 0} 篇文章`);
    console.log(`🖼️ 处理了 ${data.galleries?.length || 0} 个图库`);

    if (process.env.R2_PUBLIC_URL) {
      console.log(`🌍 R2 公共 URL: ${process.env.R2_PUBLIC_URL}`);
    }
  },
  mdx: {
    rehypePlugins: [
      rehypeSlug as any,
      [rehypePrettyCode, { theme: "dracula" }],
      [
        rehypeAutolinkHeadings,
        {
          behavior: "wrap",
          properties: {
            className: ["subheading-anchor"],
            ariaLabel: "Link to section",
          },
        },
      ],
    ],
  },
});
