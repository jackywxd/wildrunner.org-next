"use client";

import * as React from "react";

import { ThemeProvider } from "./theme-provider";
import { SWRProvider } from "./swr-provider";

// PostHog removed; Cloudflare Web Analytics / Zaraz will be added in Phase 2.
//
// `I18nProvider` was here and is gone. It wrapped an i18next instance that
// fetched `/locales/{lng}/{ns}.json` over HTTP at runtime — inside a Worker,
// the site fetching itself — for translations no component ever asked for:
// nothing in `src/` called `useTranslation`, and the only live consumer of
// the whole stack was a `z.setErrorMap` whose messages nothing rendered,
// because `zod` was imported by that one file and nowhere else in `src/`.
// The language now comes from the URL (`[lang]`, `proxy.ts`), which is a
// thing the server can answer before anything renders.
const providers = [SWRProvider, ThemeProvider];

interface AppContextProps {
  children: React.ReactNode;
  providers: Array<React.JSXElementConstructor<React.PropsWithChildren<any>>>;
}

const AppContext = (props: AppContextProps) => {
  const { children, providers = [] } = props;

  return (
    <React.Fragment>
      {providers.reduceRight(
        (child, Provider) => (
          <Provider>{child}</Provider>
        ),
        children
      )}
    </React.Fragment>
  );
};

interface AppProviderProps {
  children: React.ReactNode;
}

const AppProvider = (props: AppProviderProps) => {
  const { children } = props;

  return <AppContext providers={providers}>{children}</AppContext>;
};

export { AppProvider, type AppProviderProps };
