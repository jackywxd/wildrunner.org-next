'use client';

import * as React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { siteConfig } from '@/config/site';

export default function SiteLogo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  if (isDark) {
    return (
      <span className="flex items-center gap-2">
        <Image
          src="/static/brand/mark-purple.svg"
          alt=""
          width={40}
          height={40}
          priority
          className="size-10"
        />
        <Image
          src="/static/brand/wordmark-reverse.svg"
          alt={siteConfig.name}
          width={140}
          height={45}
          priority
          className="h-9 w-auto"
        />
      </span>
    );
  }

  return (
    <Image
      src="/static/brand/lockup-horizontal.svg"
      alt={siteConfig.name}
      width={220}
      height={48}
      priority
    />
  );
}
