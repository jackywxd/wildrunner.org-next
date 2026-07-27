"use client";

import React from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { navIcon } from "@/components/nav-icons";
import type { NavItemData } from "@/lib/nav";
import { cn } from "@/lib/utils";

export default function HeaderNav({ items }: { items: NavItemData[] }) {
  const segment = useSelectedLayoutSegment();
  return (
    <nav className="hidden items-center gap-6 md:flex">
      {items.map((item) => {
        const Icon = navIcon(item.icon);
        return (
          <Link
            key={item.label + item.path}
            href={item.path}
            className={cn(
              " font-normal hover:text-primary transition-colors flex items-center",
              `/${segment}` === item.path
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="mr-2 size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
