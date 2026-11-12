"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DevCredit from "@/components/landing/DevCredit";
import { useReveal } from "@/components/landing/useReveal";
import StarField from "@/components/center/StarField";
import { slugify } from "@/lib/center";
import { FEATURES, T, Icon, ManaratMark, Ring, amiri, display, type Locale } from "@/components/landing/manarat";
import "@/app/landing.css";

// منارات — /about: what the platform is, kept short. Intro with the two phones, six features,
// how to start, the memorization map and "register your centre". Sign-in lives on /login.
export default function PlatformAbout() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [slug, setSlug] = useState("");
  const tr = T[locale];
  const num = (n: number) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en");
  const pct = (n: number) => (locale === "ar" ? `${num(n)}٪` : `${n}%`);
  const byIcon = (i: string) => FEATURES.find((f) => f.i === i)!;
  useReveal();

  return (
    <div className={`mn mn-about ${display.variable} ${amiri.variable}`} dir={tr.dir} lang={locale}>
      <div className="mn-wrap">
        <header className="mn-about-top">
          <Link href="/login" className="mn-logo" aria-label={tr.brand}>
            <ManaratMark />
            <span><b>{tr.brand}</b><small>{tr.latin}</small></span>
          </Link>
          <div className="mn-gate-acts">
            <button type="button" className="mn-lang" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
              <Icon name="globe" />
              <span>{tr.lang}</span>
            </button>
            <Link href="/login" className="mn-btn navy sm"><Icon name="user" />{tr.back}</Link>
          </div>
        </header>

        {/* intro + phones */}
        <section className="mn-intro">
          <div className="mn-intro-txt">
            <h1>{tr.sub}</h1>
            <p>{tr.aboutLead}</p>
            <div className="mn-cta">
              <Link href="/signup" className="mn-btn gold">{tr.cta}</Link>
              <Link href="/login" className="mn-btn line">{tr.back}</Link>
            </div>
          </div>
          <div className="mn-phones" aria-hidden="true">
            <div className="mn-phone">
              <div className="mn-scr dark">
                <ManaratMark className="lg" />
                <b>{tr.brand}</b>
                <small>{tr.latin}</small>
                <p>{tr.ph.tag}</p>
                <div className="mn-mini" />
                <span className="mn-btn gold">{tr.ph.start}</span>
                <span className="mn-btn ghost">{tr.ph.signin}</span>
              </div>
            </div>
            <div className="mn-phone">
              <div className="mn-scr light">
                <div className="mn-hello"><div className="mn-av">{tr.ph.name[0]}</div><div><span>{tr.ph.hi}</span><b>{tr.ph.name}</b></div></div>
                <div className="mn-lvl">
                  <Ring value={70} label={pct(70)} />
                  <div><span>{tr.ph.level}</span><b>{tr.ph.juz}</b><div className="mn-bar"><i style={{ width: "70%" }} /></div></div>
                </div>
                <div className="mn-tiles">
                  {(["cal", "map", "chart"] as const).map((ic, i) => (
                    <div key={ic}><Icon name={ic} />{tr.ph.tiles[i]}</div>
                  ))}
                </div>
                <h4>{tr.ph.latest}</h4>
                <div className="mn-ach"><Icon name="medal" /><div><b>{tr.ph.ach}</b><span>{tr.ph.ach2}</span></div></div>
                <div className="mn-tab">
                  {(["home", "users", "bell", "menu"] as const).map((ic, i) => (
                    <div key={ic} className={i === 0 ? "on" : ""}><Icon name={ic} />{tr.ph.tabs[i]}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ul className="mn-strip mn-strip-flat">
          {tr.strip.map(([ic, b, s]) => (
            <li key={b}><Icon name={ic} /><b>{b}</b><span>{s}</span></li>
          ))}
        </ul>

        <main>
          <section id="features" className="mn-sec" data-reveal>
            <div className="mn-panel">
              <h2 className="mn-pill"><Icon name="star" />{tr.boardFeat}</h2>
              <ul className="mn-six">
                {tr.six.map((ic) => (
                  <li key={ic}><Icon name={ic} /><h3>{byIcon(ic)[locale][0]}</h3><p>{byIcon(ic)[locale][1]}</p></li>
                ))}
              </ul>
            </div>
          </section>

          <section id="how" className="mn-sec" data-reveal>
            <div className="mn-panel">
              <h2 className="mn-pill"><Icon name="check" />{tr.howTitle}</h2>
              <ol className="mn-how">
                {tr.how.map(([t, d], i) => (
                  <li key={t}><span className="mn-num">{num(i + 1)}</span><h3>{t}</h3><p>{d}</p></li>
                ))}
              </ol>
            </div>
          </section>

          <section id="map" className="mn-sec mn-map" data-reveal>
            <div className="mn-panel">
              <h2 className="mn-pill"><Icon name="map" />{tr.mapTitle}</h2>
              <div className="mn-map-grid">
                <div>
                  <h3>{tr.mapHead}</h3>
                  <p>{tr.mapText}</p>
                </div>
                <div className="mn-juz" aria-label={tr.sample}>
                  {Array.from({ length: 30 }, (_, i) => (
                    <span key={i} className={i < 19 ? "on" : i === 19 ? "cur" : ""} style={{ transitionDelay: `${i * 40}ms` }}>{num(i + 1)}</span>
                  ))}
                  <small>{tr.sample}</small>
                </div>
              </div>
            </div>
          </section>

          <section id="join" className="mn-sec" data-reveal>
            <div className="mn-join">
              <StarField className="mn-join-stars" density={0.6} />
              <div className="mn-join-in">
                <p className="mn-ayah">{tr.ayah}</p>
                <h2>{tr.joinTitle}</h2>
                <p>{tr.joinText}</p>
                <Link href="/signup" className="mn-btn gold">{tr.cta}</Link>
                <form
                  className="mn-find"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const s = slugify(slug);
                    if (s) router.push(`/${s}`);
                  }}
                >
                  <span dir="ltr">/</span>
                  <input aria-label={tr.find} placeholder={tr.find} value={slug} onChange={(e) => setSlug(e.target.value)} />
                  <button type="submit">{tr.go}</button>
                </form>
              </div>
            </div>
          </section>
        </main>

        <footer className="mn-footer">
          <span>{tr.footer}</span>
          <span dir="ltr">© {new Date().getFullYear()}</span>
        </footer>
      </div>

      {/* the developer's Instagram, always in view at the bottom centre */}
      <div className="mn-float-credit"><DevCredit compact /></div>
    </div>
  );
}
