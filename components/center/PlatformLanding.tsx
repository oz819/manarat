"use client";

import { useI18n } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import LoginDialog from "@/components/center/LoginDialog";
import StarField from "@/components/center/StarField";
import { AboutBody } from "@/components/center/PlatformAbout";
import { createClient } from "@/utils/supabase/client";
import { useReveal } from "@/components/landing/useReveal";
import { T, Icon, ManaratMark, amiri, display } from "@/components/landing/manarat";
import "@/app/landing.css";

// تلاوة — the platform's address. First screen: the living night scene (the mushaf's pages turning,
// lanterns swaying) behind the sign-in form. Scrolling down shows the whole platform page (AboutBody).
export default function PlatformLanding() {
  const { locale, setLocale } = useI18n();
  const tr = T[locale];
  // Who is already signed in on this device (null = nobody, undefined = still checking).
  const [me, setMe] = useState<string | null | undefined>(undefined);
  useReveal();
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMe(data.user?.email ?? null)).catch(() => setMe(null));
  }, []);
  async function signOut() {
    await createClient().auth.signOut();
    setMe(null);
  }

  return (
    <div className={`mn mn-home ${display.variable} ${amiri.variable}`} dir={tr.dir} lang={locale}>
    <div className="mn-gate" id="top">
      <div className="mn-gate-bg" aria-hidden="true">
        <video className="mn-hero-video" src="/landing/hero.mp4" poster="/landing/hero.webp" autoPlay muted loop playsInline preload="auto" tabIndex={-1} />
      </div>
      <StarField className="mn-gate-stars" density={0.7} />

      <header className="mn-gate-top">
        <span className="mn-logo">
          <ManaratMark />
          <span><b>{tr.brand}</b><small>{tr.latin}</small></span>
        </span>
        <div className="mn-gate-acts">
          <a href="#more" className="mn-gate-link">{tr.gateAbout}</a>
          <button type="button" className="mn-lang" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
            <Icon name="globe" />
            <span>{tr.lang}</span>
          </button>
        </div>
      </header>

      <main className="mn-gate-main">
        <section className="mn-gate-intro">
          <p className="mn-hadith">{tr.hadith}</p>
          <h1>{tr.brand}</h1>
          <p className="mn-sub">{tr.sub}</p>
          <p className="mn-tri">{tr.tri}</p>
        </section>

        <section className="mn-gate-card" aria-label={tr.login}>
          {me ? (
            <div className="loginbox mn-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="" className="mn-in-mark" />
              <h2>{tr.brand}</h2>
              <p>{tr.inAs} <b dir="ltr">{me}</b></p>
              <Link href="/app" className="mn-btn gold">{tr.enter}</Link>
              <button type="button" className="mn-in-out" onClick={signOut}>{tr.signOut}</button>
            </div>
          ) : (
            <LoginDialog title={tr.brand} subtitle={tr.gateSub} logo="/icon-192.png" />
          )}
          <div className="mn-gate-new">
            <span>{tr.gateNew}</span>
            <Link href="/signup" className="mn-btn gold sm">{tr.cta}</Link>
          </div>
        </section>
      </main>
      <a href="#more" className="mn-gate-down" aria-label={tr.gateAbout}><span>{tr.gateAbout}</span><i aria-hidden="true">↓</i></a>
    </div>

      {/* the whole platform page, right under the first screen */}
      <div className="mn-wrap mn-more" id="more">
        <AboutBody locale={locale} />
      </div>

    </div>
  );
}
