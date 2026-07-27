import React from "react";
import PageHeader from "@/components/page-header";
import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { SOCIALS } from "@/constants";
import { cn } from "@/lib/utils";
import { Metadata } from "next";
import { globals } from "#site/content";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <div className="container relative max-w-6xl py-6 lg:py-10">
      <PageHeader title="About" description="Let's get to know each other" />
      <hr className="my-8 h-0 border-t-2 border-border" />

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="flex flex-col gap-2 border border-border bg-secondary p-6">
            <Image
              src={siteConfig.authorImage}
              width={82}
              height={82}
              alt={siteConfig.name}
              className="mb-4 border bg-background grayscale"
            />
            <h3 className="text-lg font-extrabold">{siteConfig.author}</h3>
            <p className="text-left text-sm text-muted-foreground">
              Full Stack Developer
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {SOCIALS.map((social) => (
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
              ))}
            </div>
          </div>
        </div>
        <p className="flex-1 text-left text-sm text-muted-foreground lg:text-base">
          {globals.metadata.description}
        </p>
      </div>
    </div>
  );
}
