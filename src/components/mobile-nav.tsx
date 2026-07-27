"use client";

import React, { ReactNode } from "react";
import Link, { LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { navIcon } from "@/components/nav-icons";
import type { NavItemData } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  items: NavItemData[];
  onOpenChange: () => void;
}

export default function MobileNav({ items, onOpenChange }: MobileNavProps) {
  return (
    <div className="fixed inset-0 top-16 z-50 grid h-[calc(100vh-4rem)] grid-flow-row auto-rows-max overflow-auto py-6 pb-32 animate-in slide-in-from-bottom-80 md:hidden">
      <div className="relative z-20 grid gap-6 border border-border bg-secondary p-4 text-popover-foreground shadow-none">
        {items.map((item) => {
          const Icon = navIcon(item.icon);
          return (
            <MobileLink
              key={item.label + item.path}
              href={item.path}
              className="flex items-center"
              onOpenChange={onOpenChange}
            >
              <Icon className="mr-2 size-4" />
              <span>{item.label}</span>
            </MobileLink>
          );
        })}
      </div>
    </div>
  );
}

interface MobileLinkProps extends LinkProps {
  children: ReactNode;
  onOpenChange?: () => void;
  className?: string;
}

const MobileLink = ({
  children,
  onOpenChange,
  className,
  href,
  ...props
}: MobileLinkProps) => {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Link
      href={href}
      onClick={() => {
        router.push(href.toString());
        onOpenChange?.();
      }}
      className={cn(
        "transition-colors hover:text-primary",
        pathname === href.toString() ? "text-primary" : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
};
