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

  // `document.documentElement.lang = resolvedLanguage` used to sit beside
  // this, and it undid the site's own declaration on every page load: the
  // layout renders `<html lang="zh-Hant">`, this effect overwrote it with
  // the hardcoded "en" above, and every visitor's browser held "en" for a
  // Traditional Chinese site — the wrong screen-reader voice, the wrong
  // language for a search engine to index, and one of the signals a browser
  // uses to pick a CJK fallback face.
  //
  // The document language belongs to the layout, which is the one place
  // that can state it before anything renders. Two places writing it is
  // what made this invisible: the served HTML was right the whole time, so
  // every check of it agreed, and only the live DOM disagreed.
  //
  // `resolvedLanguage` is left as it was. It is i18next's language, not the
  // document's, and nothing in src/ renders a translation today — changing
  // what this provider resolves to is a separate decision from stopping it
  // reaching into the DOM.
  React.useEffect(() => {
    i18n.changeLanguage(resolvedLanguage);
  }, [resolvedLanguage]);

  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNS}>
      {children}
    </I18nextProvider>
  );
};

export { I18nProvider };
