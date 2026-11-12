"use client";

import { useState } from "react";
import Link from "next/link";
import DevCredit from "@/components/landing/DevCredit";
import LoginDialog from "@/components/center/LoginDialog";
import StarField from "@/components/center/StarField";
import { T, Icon, ManaratMark, amiri, display, type Locale } from "@/components/landing/manarat";
import "@/app/landing.css";

// منارات — the first screen on the platform's address: the living night scene (the mushaf's pages
// turning, lanterns swaying) behind the sign-in form. Everything about the platform lives on /about,
// so this screen stays calm. The developer's Instagram is pinned at the bottom from the first moment.
export default function PlatformLanding() {
  const [locale, setLocale] = useState<Locale>("ar");
  const tr = T[locale];

  return (
    <div className={`mn mn-gate ${display.variable} ${amiri.variable}`} dir={tr.dir} lang={locale}>
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
          <Link href="/about" className="mn-gate-link">{tr.gateAbout}</Link>
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
          <LoginDialog title={tr.brand} subtitle={tr.gateSub} logo="/icon-192.png" />
          <div className="mn-gate-new">
            <span>{tr.gateNew}</span>
            <Link href="/signup" className="mn-btn gold sm">{tr.cta}</Link>
          </div>
        </section>
      </main>

      {/* the developer's Instagram: visible from the first moment, centred at the bottom */}
      <div className="mn-gate-credit"><DevCredit /></div>
    </div>
  );
}
