"use client";

import * as React from "react";

import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { defaultNS } from "@/i18next.config";

/**
 * Children are rendered unconditionally, on the server as well as the client.
 *
 * This used to gate them behind `{!isLoading && children}`, where `isLoading`
 * started `true` and only flipped in the effect below. Effects never run
 * during SSR, so the server rendered an *empty* body for every route: the
 * whole site was client-rendered, and `notFound()` never threw server-side.
 * Next had already committed a 200 by the time the client reached it, so
 * every missing post/gallery answered 200 with the not-found page in the
 * body — a soft 404 that crawlers index as a real page.
 *
 * Nothing renders translations today (no `useTranslation`/`<Trans>` anywhere
 * in src/), so the gate bought no flash-of-untranslated-content protection.
 * If a component starts consuming translations, give that component its own
 * fallback rather than blocking the entire tree from server rendering.
 */
const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const resolvedLanguage = "en";

  React.useEffect(() => {
    i18n.changeLanguage(resolvedLanguage);
    document.documentElement.lang = resolvedLanguage;
  }, [resolvedLanguage]);

  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNS}>
      {children}
    </I18nextProvider>
  );
};

export { I18nProvider };
