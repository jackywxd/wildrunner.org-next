'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { cn } from "@/lib/utils";

/**
 * `withLabel` is the mobile menu's form: a whole row that says what it does.
 * An unlabelled sun or moon is a guess on a phone, and the header on a phone
 * no longer carries this control at all — its slot went to the sign-in and
 * menu buttons, which are what a visitor actually reaches for.
 */
export default function ThemeToggle({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const t = useDictionary();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;
  const label = isDark ? t.theme.toLight : t.theme.toDark;

  return (
    <Button
      type="button"
      variant="ghost"
      size={withLabel ? "default" : "icon"}
      className={cn(
        "text-foreground hover:bg-accent hover:text-accent-foreground",
        withLabel && "w-full gap-3",
        className,
      )}
      aria-label={withLabel ? undefined : label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      {withLabel && <span>{label}</span>}
    </Button>
  );
}
