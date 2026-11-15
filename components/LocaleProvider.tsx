"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dirOf, staffText, formatDate, formatNumber, type Locale } from "@/lib/i18n";

export const LOCALE_KEY = "tilawa:locale";
const LocaleContext = createContext<ReturnType<typeof localeValue> | null>(null);
function localeValue(locale: Locale, setLocale: (locale: Locale) => void) {
  return {
    locale, setLocale, dir: dirOf(locale),
    tx: (source: string, values?: readonly (string | number | undefined | null)[]) => staffText(locale, source, values),
    number: (value: number) => formatNumber(locale, value),
    date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => formatDate(locale, value, options),
  };
}

/** Arabic SSR/default; hydrate the device preference without changing routes or staff data. */
export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("ar");
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* Private browsing may block storage. */ }
  }, []);
  useEffect(() => {
    try { if (localStorage.getItem(LOCALE_KEY) === "en") updateLocale("en"); } catch {}
    const sync = (event: StorageEvent) => {
      if (event.key === LOCALE_KEY) updateLocale(event.newValue === "en" ? "en" : "ar");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);
  const value = useMemo(() => localeValue(locale, setLocale), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n requires LocaleProvider");
  return context;
}

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" className="secondary language-switch" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      lang={locale === "ar" ? "en" : "ar"} dir={locale === "ar" ? "ltr" : "rtl"}
      aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
      {locale === "ar" ? "English" : "العربية"}
    </button>
  );
}
