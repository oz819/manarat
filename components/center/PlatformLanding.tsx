"use client";

import { useState } from "react";
import Link from "next/link";
import { Alexandria, Amiri } from "next/font/google";
import { useRouter } from "next/navigation";
import DevCredit from "@/components/landing/DevCredit";
import { useReveal } from "@/components/landing/useReveal";
import LoginDialog from "@/components/center/LoginDialog";
import StarField from "@/components/center/StarField";
import { slugify } from "@/lib/center";
import "@/app/landing.css";

// منارات — the platform's own page (no centre on this address). Navy and gold: a 3D night hero
// (mosque, mushaf, lanterns) with the moving 3D star over it, two phone mockups beside it, then the
// dashboard / features / system / identity board. The app behind the sign-in keeps its own theme.
const display = Alexandria({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-mn-display", display: "swap" });
const amiri = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-amiri", display: "swap" });

type Locale = "ar" | "en";
type Cat = "teacher" | "parent" | "admin";
type Feature = { i: string; c: Cat; ar: [string, string]; en: [string, string] };

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
  gift: "M4 11h16v10H4zM2 7h20v4H2zM12 7v14M12 7c-2-4-6-4-6-1s6 1 6 1zM12 7c2-4 6-4 6-1s-6 1-6 1z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  book: "M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13",
  menu: "M4 7h16M4 12h16M4 17h16",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7 5.3-5.7",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8z",
  hex: "M12 2l8.7 5v10L12 22l-8.7-5V7z",
  cloud: "M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18zM9.5 14.5l2 2 3.5-4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
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
    latin: "MANARAT",
    nav: [["#top", "الرئيسية"], ["#how", "كيف تبدأ"], ["#features", "المزايا"], ["#map", "خريطة الحفظ"], ["#about", "عن المنصة"]],
    menu: "القائمة",
    login: "دخول",
    signup: "سجّل مركزك",
    lang: "EN",
    hadith: "«خَيْرُكُم مَنْ تَعَلَّمَ القُرْآنَ وَعَلَّمَهُ»",
    sub: "منصة متكاملة لإدارة مراكز تحفيظ القرآن الكريم",
    tri: "تعليم .. متابعة .. إنجاز",
    cta: "سجّل مركزك مجانًا",
    strip: [["gift", "مجانية بالكامل", "بلا حدود للطلاب"], ["wifi", "تعمل بدون إنترنت", "من أي جوال"], ["users", "إدارة سهلة", "للمراكز والحلقات"], ["chart", "تقارير شاملة", "للإدارة والأهل"], ["shield", "أمان عالٍ", "وعزل تام للبيانات"]],
    // phone mockups (illustrative)
    ph: { tag: "رحلتك مع القرآن.. أسهل وأقرب", start: "سجّل مركزك", signin: "تسجيل الدخول", hi: "مرحبًا بك", name: "أحمد محمد", level: "مستوى الحفظ", juz: "الجزء الخامس", tiles: ["حضوري", "خريطتي", "تقاريري"], latest: "أحدث الإنجازات", ach: "إتمام سورة الكهف", ach2: "مبارك لك!", tabs: ["الرئيسية", "حلقتي", "الإشعارات", "المزيد"] },
    dashTitle: "لوحة إدارة المركز",
    dash: { side: ["لوحة التحكم", "الطلاب", "المعلّمون", "الحلقات", "التقارير", "الإعدادات"], kpi: [["12", "المعلّمون"], ["8", "الحلقات"], ["120", "إجمالي الطلاب"]], act: "أحدث الأنشطة", acts: ["إكمال حفظ جزء عمّ", "حضور حلقة الفجر", "تقييم الطالب محمد"], stats: "إحصائيات الحفظ", prog: "تقدّم الحلقات", circles: ["حلقة الفجر", "حلقة النور", "حلقة الفرقان"] },
    boardFeat: "مميزات المنصة",
    six: ["mic", "map", "wifi", "link", "medal", "chart"],
    sysTitle: "مخطط النظام",
    root: ["المنصة الرئيسية", "(منارات)"],
    kids: [["user", "صاحب المركز", "(الموقع)"], ["users", "المعلّم", "(التطبيق)"], ["link", "وليّ الأمر", "(رابط خاص)"], ["grid", "إدارة المنصة", "(لوحة المراكز)"]],
    cloud: "بنية سحابية آمنة · عزل تام بين المراكز",
    idTitle: "الهوية البصرية",
    motto: "نورٌ في كل بيت",
    howTitle: "كيف تبدأ؟",
    how: [
      ["سجّل مركزك", "اسم المركز ورابطه وبريدك — وتصبح مديره فورًا."],
      ["أضف حلقاتك", "اسم الحلقة ثم أسماء الطلاب، اسم في كل سطر أو لصقًا من Excel."],
      ["ادعُ المعلّمين", "دعوة بالبريد أو واتساب، ولكل معلّم حلقاته."],
      ["شارك رابط التسجيل", "الأهل يسجّلون أبناءهم من صفحة مركزك."],
      ["التسميع اليومي", "المعلّم يسجّل الحفظ والحضور من جواله."],
      ["التقارير والشهادات", "تقارير للأهل، وشهادة عند إتمام كل جزء."],
    ],
    allTitle: "كل ما يحتاجه مركزك",
    cats: [["all", "الكل"], ["teacher", "للمعلّم"], ["parent", "لوليّ الأمر"], ["admin", "للإدارة"]],
    search: "ابحث: تسميع، تقرير، شهادة…",
    none: "لا نتائج لـ",
    mapTitle: "خريطة الحفظ",
    mapHead: "أين وصل الطالب؟ بنظرة واحدة.",
    mapText: "كل جزء يحفظه الطالب يضيء على خريطته. وليّ الأمر يتابعها من رابطه الخاص، والمعلّم يعرف من يحتاج مراجعة.",
    sample: "مثال توضيحي",
    ayah: "﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾",
    joinTitle: "ابدأ مع منارات اليوم",
    joinText: "مجانية بالكامل، بلا فترة تجربة ولا حدّ لعدد الطلاب.",
    find: "عندك رابط مركزك؟",
    go: "اذهب",
    footer: "منارات · منصة مراكز تحفيظ القرآن",
  },
  en: {
    dir: "ltr",
    brand: "Manarat",
    latin: "منارات",
    nav: [["#top", "Home"], ["#how", "How it works"], ["#features", "Features"], ["#map", "Progress map"], ["#about", "The platform"]],
    menu: "Menu",
    login: "Sign in",
    signup: "Register",
    lang: "عربي",
    hadith: "“The best of you are those who learn the Qur'an and teach it.”",
    sub: "One platform to run your Qur'an memorization centre",
    tri: "Teach .. Follow .. Achieve",
    cta: "Register your centre — free",
    strip: [["gift", "Completely free", "No student limits"], ["wifi", "Works offline", "On any phone"], ["users", "Easy to run", "Centres and circles"], ["chart", "Full reports", "For admins and parents"], ["shield", "Secure", "Fully isolated data"]],
    ph: { tag: "Your Qur'an journey, closer and easier", start: "Register", signin: "Sign in", hi: "Welcome", name: "Ahmad Mohammad", level: "Memorization", juz: "Juz' 5", tiles: ["Attendance", "My map", "Reports"], latest: "Latest achievements", ach: "Completed Surat Al-Kahf", ach2: "Well done!", tabs: ["Home", "Circle", "Alerts", "More"] },
    dashTitle: "Centre dashboard",
    dash: { side: ["Dashboard", "Students", "Teachers", "Circles", "Reports", "Settings"], kpi: [["12", "Teachers"], ["8", "Circles"], ["120", "Students"]], act: "Latest activity", acts: ["Finished Juz' 'Amma", "Fajr circle attendance", "Graded student Mohammad"], stats: "Memorization", prog: "Circle progress", circles: ["Fajr circle", "Nour circle", "Furqan circle"] },
    boardFeat: "Platform features",
    six: ["mic", "map", "wifi", "link", "medal", "chart"],
    sysTitle: "How it fits together",
    root: ["The platform", "(Manarat)"],
    kids: [["user", "Centre owner", "(web)"], ["users", "Teacher", "(app)"], ["link", "Parent", "(private link)"], ["grid", "Platform admin", "(centres panel)"]],
    cloud: "Secure cloud · full isolation between centres",
    idTitle: "Visual identity",
    motto: "A light in every home",
    howTitle: "How to start",
    how: [
      ["Register your centre", "Name, link and your email — you're its admin right away."],
      ["Add your circles", "A circle's name, then its students one per line, or pasted from Excel."],
      ["Invite teachers", "By email or WhatsApp; each teacher gets their circles."],
      ["Share the sign-up link", "Parents register their children on your centre's page."],
      ["Daily recitation", "Teachers record memorization and attendance from their phone."],
      ["Reports & certificates", "Reports for parents and a certificate for every juz'."],
    ],
    allTitle: "Everything your centre needs",
    cats: [["all", "All"], ["teacher", "Teachers"], ["parent", "Parents"], ["admin", "Admins"]],
    search: "Search: recitation, report, certificate…",
    none: "No results for ",
    mapTitle: "Progress map",
    mapHead: "Where is the student? At a glance.",
    mapText: "Every juz' a student memorizes lights up on their map. Parents follow it from their own link; teachers see who needs revision.",
    sample: "Example",
    ayah: "“And recite the Qur'an with measured recitation.”",
    joinTitle: "Start with Manarat today",
    joinText: "Completely free — no trial period and no limit on students.",
    find: "Have your centre's link?",
    go: "Go",
    footer: "Manarat · a platform for Qur'an centres",
  },
} as const;

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={`mn-i ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The منارات mark: a lamp-niche arch with a star over an open book, in gold. */
export function ManaratMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="mn-gg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8DFAE" />
          <stop offset=".55" stopColor="#E3B062" />
          <stop offset="1" stopColor="#B97F2E" />
        </linearGradient>
      </defs>
      <path d="M32 3c3 6 9 9 14 14 6 6 8 13 8 21v9H44v-9c0-5-2-9-5-12-3-2-5-5-7-8-2 3-4 6-7 8-3 3-5 7-5 12v9H10v-9c0-8 2-15 8-21 5-5 11-8 14-14z" fill="none" stroke="url(#mn-gg)" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M32 24l2.3 5.7L40 32l-5.7 2.3L32 40l-2.3-5.7L24 32l5.7-2.3z" fill="url(#mn-gg)" />
      <path d="M32 50c-6-4-14-5-24-4v10c10-1 18 0 24 4 6-4 14-5 24-4V46c-10-1-18 0-24 4z" fill="url(#mn-gg)" />
      <path d="M32 50v10" stroke="#121A3D" strokeWidth="1.6" />
    </svg>
  );
}

function Ring({ value, size = 60, stroke = 6, color = "url(#mn-gg)", label }: { value: number; size?: number; stroke?: number; color?: string; label: string }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E4DDF1" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 4.5} textAnchor="middle" fontWeight="700" fontSize={size / 4.6} fill="#1B2550">{label}</text>
    </svg>
  );
}

export default function PlatformLanding() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [showLogin, setShowLogin] = useState(false);
  const [menu, setMenu] = useState(false);
  const [slug, setSlug] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const tr = T[locale];
  const num = (n: number) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en");
  const pct = (n: number) => (locale === "ar" ? `${num(n)}٪` : `${n}%`);
  useReveal();

  const k = q.trim().toLowerCase();
  const list = FEATURES.filter((f) => (cat === "all" || f.c === cat) && (!k || f[locale].join(" ").toLowerCase().includes(k)));
  const byIcon = (i: string) => FEATURES.find((f) => f.i === i)!;

  return (
    <div className={`mn ${display.variable} ${amiri.variable}`} dir={tr.dir} lang={locale}>
      {/* ============ first screen: hero + phones ============ */}
      <div className="mn-wrap">
        <div className="mn-stage">
          <div className="mn-stage-main">
            <header className="mn-hero" id="top">
              <div className="mn-hero-img" aria-hidden="true" />
              <StarField className="mn-stars" density={0.8} />
              <nav className="mn-nav" aria-label={locale === "ar" ? "التنقل الرئيسي" : "Main"}>
                <a href="#top" className="mn-logo" aria-label={tr.brand}>
                  <ManaratMark />
                  <span><b>{tr.brand}</b><small>{tr.latin}</small></span>
                </a>
                <ul className={`mn-links${menu ? " open" : ""}`} id="mn-links" onClick={() => setMenu(false)}>
                  {tr.nav.map(([href, label], i) => (
                    <li key={href}><a href={href} className={i === 0 ? "on" : ""}>{label}</a></li>
                  ))}
                </ul>
                <div className="mn-acts">
                  <button type="button" className="mn-lang" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
                    <Icon name="globe" />
                    <span>{tr.lang}</span>
                  </button>
                  <button type="button" className="mn-btn ghost sm" onClick={() => setShowLogin(true)} aria-haspopup="dialog">{tr.login}</button>
                  <Link href="/signup" className="mn-btn gold sm mn-signup"><Icon name="user" />{tr.signup}</Link>
                  <button type="button" className="mn-burger" aria-label={tr.menu} aria-expanded={menu} aria-controls="mn-links" onClick={() => setMenu(!menu)}>
                    <Icon name="menu" />
                  </button>
                </div>
              </nav>

              <div className="mn-hero-body">
                <div className="mn-hero-txt">
                  <p className="mn-hadith">{tr.hadith}</p>
                  <h1>{tr.brand}</h1>
                  <p className="mn-sub">{tr.sub}</p>
                  <p className="mn-tri">{tr.tri}</p>
                  <div className="mn-cta">
                    <Link href="/signup" className="mn-btn gold">{tr.cta}</Link>
                    <button type="button" className="mn-btn ghost" onClick={() => setShowLogin(true)}>{tr.ph.signin}</button>
                  </div>
                </div>
              </div>
            </header>

            <ul className="mn-strip">
              {tr.strip.map(([ic, b, s]) => (
                <li key={b}><Icon name={ic} /><b>{b}</b><span>{s}</span></li>
              ))}
            </ul>
          </div>

          {/* two phones (illustrative) */}
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
        </div>

        {/* ============ the board ============ */}
        <main>
          <div className="mn-board">
            <section className="mn-b-dash" data-reveal>
              <div className="mn-panel">
                <h2 className="mn-pill"><Icon name="crown" />{tr.dashTitle}</h2>
                <div className="mn-laptop" aria-hidden="true">
                  <div className="mn-lid">
                    <div className="mn-dash">
                      <div className="mn-side">
                        <div className="mn-side-lg"><ManaratMark />{tr.brand}</div>
                        <ul>
                          {(["home", "user", "users", "book", "chart", "shield"] as const).map((ic, i) => (
                            <li key={ic} className={i === 0 ? "on" : ""}><Icon name={ic} />{tr.dash.side[i]}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="mn-main">
                        <div className="mn-kpis">
                          {tr.dash.kpi.map(([n, l]) => (
                            <div key={l}><b>{num(Number(n))}</b>{l}</div>
                          ))}
                        </div>
                        <div className="mn-two">
                          <div className="mn-box">
                            <h5>{tr.dash.act}</h5>
                            <div className="mn-acts-l">
                              <Ring value={92} size={60} stroke={8} color="#2E6BA8" label={pct(92)} />
                              <ul>{tr.dash.acts.map((a) => <li key={a}>{a}</li>)}</ul>
                            </div>
                          </div>
                          <div className="mn-box">
                            <h5>{tr.dash.stats}</h5>
                            <svg viewBox="0 0 220 96">
                              <g stroke="#E9E4F3" strokeWidth="1"><path d="M0 20h220M0 45h220M0 70h220M0 95h220" /></g>
                              <path d="M4 78l28-14 28 10 28-26 28 12 28-24 28 6 44-28" fill="none" stroke="#2E6BA8" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                              <path d="M4 88l28-8 28-16 28 14 28-20 28 8 28-22 44-6" fill="none" stroke="#C48B38" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>
                        <div className="mn-box">
                          <h5>{tr.dash.prog}</h5>
                          <div className="mn-rows">
                            {[86, 72, 64].map((v, i) => (
                              <div key={v} className="mn-row"><span>{tr.dash.circles[i]}</span><div className="mn-bar"><i style={{ width: `${v}%` }} /></div><b>{pct(v)}</b></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mn-base" />
                </div>
              </div>
            </section>

            <section className="mn-b-feat" data-reveal>
              <div className="mn-panel">
                <h2 className="mn-pill"><Icon name="star" />{tr.boardFeat}</h2>
                <ul className="mn-six">
                  {tr.six.map((ic) => (
                    <li key={ic}><Icon name={ic} /><h3>{byIcon(ic)[locale][0]}</h3><p>{byIcon(ic)[locale][1]}</p></li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mn-b-sys" id="about" data-reveal>
              <div className="mn-panel">
                <h2 className="mn-pill"><Icon name="hex" />{tr.sysTitle}</h2>
                <div className="mn-tree">
                  <div className="mn-root">{tr.root[0]}<small>{tr.root[1]}</small></div>
                  <div className="mn-stem" />
                  <ul className="mn-kids">
                    {tr.kids.map(([ic, b, s]) => (
                      <li key={b}><div><Icon name={ic} /><b>{b}</b><span>{s}</span></div></li>
                    ))}
                  </ul>
                </div>
                <div className="mn-cloud"><Icon name="cloud" />{tr.cloud}</div>
              </div>
            </section>

            <section className="mn-b-id" data-reveal>
              <div className="mn-ident">
                <h2>{tr.idTitle}</h2>
                <ManaratMark className="lg" />
                <b>{tr.brand}</b>
                <small>{tr.latin}</small>
                <div className="mn-sw" aria-hidden="true"><i style={{ background: "#1B2550" }} /><i style={{ background: "#E3B062" }} /><i style={{ background: "#FFF6E6" }} /><i style={{ background: "#6F6AA8" }} /></div>
                <p>{tr.motto}</p>
              </div>
            </section>
          </div>

          {/* ============ how to start ============ */}
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

          {/* ============ all features, filterable ============ */}
          <section id="features" className="mn-sec" data-reveal>
            <div className="mn-panel">
              <h2 className="mn-pill"><Icon name="grid" />{tr.allTitle}</h2>
              <div className="mn-filter">
                <div className="mn-tabs" role="tablist">
                  {tr.cats.map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={cat === id} className={cat === id ? "on" : ""} onClick={() => setCat(id)}>{label}</button>
                  ))}
                </div>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.search} aria-label={tr.search} />
              </div>
              <ul className="mn-grid">
                {list.map((f) => (
                  <li key={f.i}><span className="mn-ic"><Icon name={f.i} /></span><div><h3>{f[locale][0]}</h3><p>{f[locale][1]}</p></div></li>
                ))}
              </ul>
              {!list.length && <p className="mn-none">{tr.none}«{q.trim()}».</p>}
            </div>
          </section>

          {/* ============ memorization map ============ */}
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

          {/* ============ join ============ */}
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
          <a href="#top" className="mn-logo" aria-label={tr.brand}>
            <ManaratMark />
            <span><b>{tr.brand}</b><small>{tr.latin}</small></span>
          </a>
          <span>{tr.footer}</span>
          <span dir="ltr">© {new Date().getFullYear()}</span>
        </footer>
        {/* the developer's Instagram, centred at the very bottom of the page */}
        <div className="mn-credit"><DevCredit /></div>
      </div>

      {showLogin && <LoginDialog title={tr.brand} subtitle={tr.login} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
