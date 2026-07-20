"use client";

import * as React from "react";

import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { defaultNS } from "@/i18next.config";

const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const resolvedLanguage = "en";
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    i18n.changeLanguage(resolvedLanguage);
    document.documentElement.lang = resolvedLanguage;
    setIsLoading(false);
  }, [resolvedLanguage]);

  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNS}>
      {!isLoading && children}
    </I18nextProvider>
  );
};

export { I18nProvider };
