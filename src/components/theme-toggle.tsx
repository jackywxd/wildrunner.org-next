'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useDictionary } from "@/components/i18n/dictionary-provider";

export default function ThemeToggle() {
  const t = useDictionary();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-foreground hover:bg-accent hover:text-accent-foreground"
      aria-label={isDark ? t.theme.toLight : t.theme.toDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
