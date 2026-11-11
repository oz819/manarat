"use client";

import { useState } from "react";
import Link from "next/link";
import { Amiri, Reem_Kufi } from "next/font/google";
import { useRouter } from "next/navigation";
import DevCredit from "@/components/landing/DevCredit";
import { useReveal } from "@/components/landing/useReveal";
import LoginDialog from "@/components/center/LoginDialog";
import StarField from "@/components/center/StarField";
import { slugify } from "@/lib/center";
import "@/app/landing.css";

// منارات — the platform's own page (no centre on this address). Dark green and gold with the
// moving star, like the Madaya landing it grew from; the app behind the sign-in stays light.
const amiri = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-amiri", display: "swap" });
const reemKufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap" });

type Locale = "ar" | "en";
type Feature = { i: string; c: "teacher" | "parent" | "admin"; ar: [string, string]; en: [string, string] };

const ICONS: Record<string, string> = {
  ear: "M8 9a4 4 0 1 1 8 0c0 3-3 3.5-3 6a3 3 0 0 1-5 2M10 9a2 2 0 0 1 4 0",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  sheet: "M4 4h16v16H4zM4 9h16M4 14h16M10 4v16",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  cal: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  map: "M9 4l6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  form: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  medal: "M8 3h8l-2 6h-4zM12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  brush: "M4 20c3 0 5-2 5-5l9-9a2 2 0 0 0-3-3l-9 9c-3 0-5 2-5 5M14 6l3 3",
  lock: "M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5zM12 14v3",
};

const FEATURES: Feature[] = [
  { i: "mic", c: "teacher", ar: ["التسميع اليومي", "حفظ ومراجعة وتلاوة آيةً بآية، بتقدير لكل طالب بضغطة."], en: ["Daily recitation", "Memorization, revision and recitation, verse by verse, graded in one tap."] },
  { i: "cal", c: "teacher", ar: ["الحضور والغياب", "تفقّد الحلقة بثوانٍ."], en: ["Attendance", "Take the circle's roll in seconds."] },
  { i: "wifi", c: "teacher", ar: ["يعمل بدون إنترنت", "سجّل كل شيء، ويتزامن عند عودة الاتصال."], en: ["Works offline", "Record everything; it syncs when you're back online."] },
  { i: "map", c: "teacher", ar: ["خريطة الحفظ", "أين وصل كل طالب في الأجزاء والسور."], en: ["Memorization map", "Where each student is, juz' by juz'."] },
  { i: "ear", c: "teacher", ar: ["التلقين", "حلقات التلقين للصغار، بمتابعة السور المحفوظة سماعًا."], en: ["Talqeen", "Listening circles for young children, tracking what they learn by ear."] },
  { i: "link", c: "parent", ar: ["رابط وليّ الأمر", "رابط خاص يتابع فيه الأهل حفظ أبنائهم."], en: ["Parent link", "A private link where parents follow their child."] },
  { i: "form", c: "parent", ar: ["طلب التسجيل", "نموذج تسجيل لمركزك، تقبله الإدارة في الحلقة المناسبة."], en: ["Registration form", "Your centre's sign-up form; admins accept into the right circle."] },
  { i: "chart", c: "parent", ar: ["التقارير الدورية", "تقرير بالحفظ والحضور يصل الأهل على واتساب."], en: ["Periodic reports", "Memorization and attendance reports on WhatsApp."] },
  { i: "bell", c: "parent", ar: ["تنبيه الغياب", "إشعار لوليّ الأمر عند تكرار الغياب."], en: ["Absence alerts", "Parents are told when absences repeat."] },
  { i: "grid", c: "admin", ar: ["لوحة المدير", "نظرة شاملة على الحلقات والمعلّمين والأرقام."], en: ["Admin dashboard", "Circles, teachers and numbers at a glance."] },
  { i: "users", c: "admin", ar: ["أدوار وصلاحيات", "صاحب المركز يدعو المدراء والمعلّمين، ولكلٍّ ما يخصه."], en: ["Roles", "The owner invites admins and teachers; each sees what is theirs."] },
  { i: "medal", c: "admin", ar: ["الاختبارات والشهادات", "اختبارات الأجزاء وشهادات إتمام باسم مركزك."], en: ["Exams & certificates", "Juz' exams and certificates in your centre's name."] },
  { i: "star", c: "parent", ar: ["لوحة المتفوّقين", "ترتيب الطلاب بالنقاط لتحفيزهم وتكريمهم."], en: ["Honour board", "Students ranked by points to motivate and reward them."] },
  { i: "sheet", c: "admin", ar: ["تصدير Excel", "كل البيانات والتقارير بملف Excel بضغطة."], en: ["Excel export", "All data and reports to Excel in one click."] },
  { i: "brush", c: "admin", ar: ["هوية مركزك", "شعارك وألوانك على صفحتك وصفحات الأهل."], en: ["Your brand", "Your logo and colours on your page and the parents' pages."] },
  { i: "lock", c: "admin", ar: ["بياناتك لك وحدك", "عزل كامل بين المراكز على مستوى قاعدة البيانات."], en: ["Your data is yours", "Full database-level isolation between centres."] },
];

const T = {
  ar: {
    dir: "rtl",
    brand: "منارات",
    nav: [["#how", "كيف تبدأ"], ["#features", "المزايا"], ["#map", "خريطة الحفظ"], ["#join", "سجّل مركزك"]],
    login: "تسجيل الدخول",
    lang: "English",
    hadith: "«خَيْرُكُم مَنْ تَعَلَّمَ القُرْآنَ وَعَلَّمَهُ»",
    title: ["لكلّ مركزٍ", "منارة"],
    lead: "منصّة مجانية لمراكز تحفيظ القرآن: سجّل مركزك في دقيقة، أضف حلقاتك وطلابك ومعلّميك، وتابع الحفظ والحضور وتقارير الأهل — من الجوال، وحتى بدون إنترنت.",
    cta: "سجّل مركزك مجانًا",
    foot: "مجانية بالكامل · بلا حدود للطلاب",
    marquee: ["حفظ", "تلاوة", "تجويد", "تدبّر", "إتقان", "مراجعة", "إجازة"],
    howKicker: "من التسجيل إلى الشهادة",
    howTitle: ["كيف ", "تبدأ؟"],
    how: [
      ["سجّل مركزك", "اسم المركز ورابطه وبريدك — وتصبح مديره فورًا."],
      ["أضف حلقاتك", "اسم الحلقة ثم أسماء الطلاب، اسم في كل سطر أو لصقًا من Excel."],
      ["ادعُ المعلّمين", "دعوة بالبريد أو واتساب، ولكل معلّم حلقاته."],
      ["شارك رابط التسجيل", "الأهل يسجّلون أبناءهم من صفحة مركزك."],
      ["التسميع اليومي", "المعلّم يسجّل الحفظ والحضور من جواله."],
      ["التقارير والشهادات", "تقارير للأهل، وشهادة عند إتمام كل جزء."],
    ],
    featKicker: "ما تقدّمه المنصّة",
    featTitle: ["كل ما يحتاجه ", "مركزك"],
    cats: [["all", "الكل"], ["teacher", "للمعلّم"], ["parent", "لوليّ الأمر"], ["admin", "للإدارة"]],
    search: "ابحث: تسميع، تقرير، شهادة…",
    none: "لا نتائج لـ",
    mapKicker: "خريطة الحفظ",
    mapTitle: ["أين وصل الطالب؟", "بنظرة واحدة."],
    mapText: "كل جزء يحفظه الطالب يضيء على خريطته. وليّ الأمر يتابعها من رابطه الخاص، والمعلّم يعرف من يحتاج مراجعة.",
    sample: "مثال توضيحي",
    ayah: "﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾",
    joinTitle: ["ابدأ مع منارات ", "اليوم"],
    joinText: "مجانية بالكامل، بلا فترة تجربة ولا حدّ لعدد الطلاب.",
    find: "عندك رابط مركزك؟",
    go: "اذهب",
    footer: "منارات · منصة مراكز تحفيظ القرآن",
  },
  en: {
    dir: "ltr",
    brand: "Manarat",
    nav: [["#how", "How it works"], ["#features", "Features"], ["#map", "Progress map"], ["#join", "Register"]],
    login: "Sign in",
    lang: "العربية",
    hadith: "“The best of you are those who learn the Qur'an and teach it.”",
    title: ["Every centre,", "a beacon of the Qur'an"],
    lead: "A free platform for Qur'an memorization centres: register in a minute, add your circles, students and teachers, and follow memorization, attendance and parent reports — on any phone, even offline.",
    cta: "Register your centre — free",
    foot: "Completely free · no student limits",
    marquee: ["Hifz", "Tilawah", "Tajweed", "Tadabbur", "Itqan", "Muraja'ah", "Ijazah"],
    howKicker: "From sign-up to certificate",
    howTitle: ["How to ", "start"],
    how: [
      ["Register your centre", "Name, link and your email — you're its admin right away."],
      ["Add your circles", "A circle's name, then its students one per line, or pasted from Excel."],
      ["Invite teachers", "By email or WhatsApp; each teacher gets their circles."],
      ["Share the sign-up link", "Parents register their children on your centre's page."],
      ["Daily recitation", "Teachers record memorization and attendance from their phone."],
      ["Reports & certificates", "Reports for parents and a certificate for every juz'."],
    ],
    featKicker: "What the platform offers",
    featTitle: ["Everything your ", "centre needs"],
    cats: [["all", "All"], ["teacher", "Teachers"], ["parent", "Parents"], ["admin", "Admins"]],
    search: "Search: recitation, report, certificate…",
    none: "No results for ",
    mapKicker: "Progress map",
    mapTitle: ["Where is the student?", "At a glance."],
    mapText: "Every juz' a student memorizes lights up on their map. Parents follow it from their own link; teachers see who needs revision.",
    sample: "Example",
    ayah: "“And recite the Qur'an with measured recitation.”",
    joinTitle: ["Start with Manarat ", "today"],
    joinText: "Completely free — no trial period and no limit on students.",
    find: "Have your centre's link?",
    go: "Go",
    footer: "Manarat · a platform for Qur'an centres",
  },
} as const;

export default function PlatformLanding() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [showLogin, setShowLogin] = useState(false);
  const [slug, setSlug] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const tr = T[locale];
  const num = (n: number) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en");
  const arrow = locale === "ar" ? "←" : "→";
  useReveal();

  const k = q.trim().toLowerCase();
  const list = FEATURES.filter((f) => (cat === "all" || f.c === cat) && (!k || f[locale].join(" ").toLowerCase().includes(k)));

  return (
    <div className={`lx ${amiri.variable} ${reemKufi.variable}`} dir={tr.dir} lang={locale}>
      <header className="lx-nav">
        <a href="#top" className="lx-brand">
          <span className="lx-mark" aria-hidden="true">م</span>
          <span>{tr.brand}</span>
        </a>
        <nav className="lx-links" aria-label={locale === "ar" ? "أقسام الصفحة" : "Sections"}>
          {tr.nav.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="lx-actions">
          <button type="button" className="lx-lang" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
            {tr.lang}
          </button>
          <button type="button" className="lx-login" onClick={() => setShowLogin(true)} aria-haspopup="dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            <span>{tr.login}</span>
          </button>
        </div>
      </header>

      <section id="top" className="lx-hero">
        <div className="lx-hero-bg" aria-hidden="true" />
        <StarField className="lx-stars" />
        <div className="lx-hero-text">
          <p className="lx-hadith">{tr.hadith}</p>
          <h1 className="lx-title">
            <span className="lx-line"><span>{tr.title[0]}</span></span>
            <span className="lx-line"><span className="lx-gold">{tr.title[1]}</span></span>
          </h1>
          <p className="lx-lead">{tr.lead}</p>
          <div className="lx-cta">
            <Link href="/signup" className="lx-btn">
              <span>{tr.cta}</span>
              <i aria-hidden="true">{arrow}</i>
            </Link>
            <button type="button" className="lx-ghost" onClick={() => setShowLogin(true)}>
              {tr.login}
            </button>
          </div>
        </div>
        <div className="lx-hero-foot">
          <span>{tr.foot}</span>
          <DevCredit compact />
          <span className="lx-scroll" aria-hidden="true"><i /></span>
        </div>
      </section>

      <div className="lx-marquee" aria-hidden="true">
        <div>
          {[0, 1].map((r) => (
            <span key={r}>
              {tr.marquee.map((w, i) => (
                <span key={i} className={i % 2 ? "lx-outline" : ""}>
                  {w}
                  <b>✦</b>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section id="how" className="lx-journey">
        <div className="lx-section lx-head" data-reveal>
          <div className="lx-kicker"><i />{tr.howKicker}</div>
          <h2>{tr.howTitle[0]}<span className="lx-gold">{tr.howTitle[1]}</span></h2>
        </div>
        <ol className="lx-track">
          {tr.how.map(([t, d], i) => (
            <li key={t} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="lx-num">{num(i + 1)}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="lx-section" data-reveal>
        <div className="lx-head lx-center">
          <div className="lx-kicker"><i />{tr.featKicker}<i /></div>
          <h2>{tr.featTitle[0]}<span className="lx-gold">{tr.featTitle[1]}</span></h2>
        </div>
        <div className="lx-filter">
          <div className="lx-tabs" role="tablist">
            {tr.cats.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={cat === id} className={cat === id ? "on" : ""} onClick={() => setCat(id)}>
                {label}
              </button>
            ))}
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.search} aria-label={tr.search} />
        </div>
        <ul className="lx-grid">
          {list.map((f) => (
            <li key={f.i}>
              <span className="lx-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[f.i]} /></svg>
              </span>
              <h3>{f[locale][0]}</h3>
              <p>{f[locale][1]}</p>
            </li>
          ))}
        </ul>
        {!list.length && <p className="lx-muted lx-center">{tr.none}«{q.trim()}».</p>}
      </section>

      <section id="map" className="lx-section lx-map" data-reveal>
        <div>
          <div className="lx-kicker"><i />{tr.mapKicker}</div>
          <h2>{tr.mapTitle[0]}<br /><span className="lx-gold">{tr.mapTitle[1]}</span></h2>
          <p className="lx-muted">{tr.mapText}</p>
        </div>
        <div className="lx-juz" aria-label={tr.sample}>
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} className={i < 19 ? "on" : i === 19 ? "cur" : ""} style={{ transitionDelay: `${i * 45}ms` }}>
              {num(i + 1)}
            </span>
          ))}
          <small>{tr.sample}</small>
        </div>
      </section>

      <section id="join" className="lx-section" data-reveal>
        <div className="lx-join">
          <p className="lx-ayah">{tr.ayah}</p>
          <h2>{tr.joinTitle[0]}<span className="lx-gold">{tr.joinTitle[1]}</span></h2>
          <p className="lx-muted">{tr.joinText}</p>
          <Link href="/signup" className="lx-btn">
            <span>{tr.cta}</span>
            <i aria-hidden="true">{arrow}</i>
          </Link>
          <form
            className="lx-find"
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
      </section>

      <footer className="lx-footer">
        <div className="lx-footer-row">
          <span>{tr.footer}</span>
          <span dir="ltr">© {new Date().getFullYear()}</span>
        </div>
        <DevCredit />
        <div className="lx-giant" aria-hidden="true">{tr.brand}</div>
      </footer>

      {showLogin && <LoginDialog title={tr.brand} subtitle={tr.login} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
