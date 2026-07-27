'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/** Storage key for light/dark preference. */
export const THEME_STORAGE_KEY = 'wildrunner-theme';

/**
 * Resolve initial theme when nothing is stored:
 * - explicit light preference → light
 * - otherwise (dark or no-preference) → dark
 */
export function resolvePreferredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {
    // ignore
  }
  return 'dark';
}

const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
};

export { ThemeProvider };
