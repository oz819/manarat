import staffEnglish from "./staff-en.json";

// تعدد اللغات: a tiny dictionary-based i18n, set up from the start so every new screen can be
// translated. Arabic is the source language; English covers platform pages and the staff interface.
// Usage: const t = useT(locale); t("signup.title")

export type Locale = "ar" | "en";

const ar = {
  "platform.name": "منصة تلاوة",
  "platform.tagline": "إدارة مراكز وحلقات تحفيظ القرآن الكريم",
  "platform.lead": "سجّل مركزك في دقائق، أضف المعلّمين والطلاب، وتابع الحفظ والتلاوة والحضور والتقارير لأولياء الأمور — من الجوال، وحتى بدون إنترنت.",
  "platform.cta": "سجّل مركزك مجانًا",
  "platform.login": "تسجيل الدخول",
  "platform.find": "لديك رابط مركزك؟",
  "platform.go": "اذهب",
  "f.track.t": "الحفظ والتلاوة والمراجعة",
  "f.track.d": "تسجيل يومي آية بآية، وخريطة حفظ لكل طالب.",
  "f.offline.t": "يعمل بدون إنترنت",
  "f.offline.d": "سجّل الحضور والتسميع، ويُحفظ كل شيء في حسابك عند عودة الاتصال.",
  "f.family.t": "أولياء الأمور",
  "f.family.d": "رابط خاص لكل طالب، وتقارير وتنبيهات غياب عبر واتساب.",
  "f.reports.t": "تقارير وشهادات",
  "f.reports.d": "تقارير شهرية، تصدير Excel، وشهادات إتمام الأجزاء.",
  "f.roles.t": "أدوار وصلاحيات",
  "f.roles.d": "صاحب المركز يدعو المدراء والمعلّمين بالبريد، ولكلٍّ ما يخصه.",
  "f.isolation.t": "بيانات مركزك لك وحدك",
  "f.isolation.d": "عزل كامل على مستوى قاعدة البيانات بين المراكز.",
  "signup.title": "سجّل مركزك",
  "signup.sub": "حساب صاحب المركز يصبح مدير المركز تلقائيًا. المنصة مجانية بالكامل.",
  "signup.welcome": "أهلًا بك في تلاوة! لنبدأ بتسجيل مركزك. احتفظنا ببريدك؛ أكمل البيانات ثم أكّد البريد بكود الدخول.",
  "signup.joinExisting": "تنضم إلى مركز موجود؟ اطلب من مدير المركز إضافتك أو إرسال رابط دعوة، ثم ادخل من الرابط.",
  "signup.center": "اسم المركز",
  "signup.slug": "رابط المركز",
  "signup.slugHint": "أحرف إنجليزية صغيرة وأرقام وشرطات",
  "signup.country": "الدولة",
  "signup.city": "المدينة",
  "signup.you": "اسمك",
  "signup.email": "البريد الإلكتروني",
  "signup.submit": "إنشاء الحساب",
  "signup.have": "لديك حساب؟",
  "signup.check": "أرسلنا كود دخول من 6 أرقام إلى بريدك، فاكتبه هنا لإكمال إعداد مركزك. تفقّد الرسائل غير المرغوبة أيضًا.",
  "signup.code": "كود الدخول",
  "signup.verify": "تأكيد ومتابعة",
  "signup.back": "تعديل البيانات",
  "lang.switch": "English",
} as const;

export type Key = keyof typeof ar;

const en: Record<Key, string> = {
  "platform.name": "Tilawa",
  "platform.tagline": "Run Quran memorization centers and circles",
  "platform.lead": "Register your center in minutes, add teachers and students, and track memorization, recitation, attendance and parent reports — on any phone, even offline.",
  "platform.cta": "Register your center — free",
  "platform.login": "Sign in",
  "platform.find": "Have your center's link?",
  "platform.go": "Go",
  "f.track.t": "Memorization & recitation",
  "f.track.d": "Daily, verse-by-verse records and a memorization map per student.",
  "f.offline.t": "Works offline",
  "f.offline.d": "Take attendance and recitation offline; it syncs when you're back online.",
  "f.family.t": "Parents",
  "f.family.d": "A private link per student, reports and absence alerts on WhatsApp.",
  "f.reports.t": "Reports & certificates",
  "f.reports.d": "Monthly reports, Excel export and juz' completion certificates.",
  "f.roles.t": "Roles & permissions",
  "f.roles.d": "The owner invites admins and teachers by email; each sees what is theirs.",
  "f.isolation.t": "Your data is yours",
  "f.isolation.d": "Full database-level isolation between centers.",
  "signup.title": "Register your center",
  "signup.sub": "The owner's account becomes the center's admin. The platform is completely free.",
  "signup.welcome": "Welcome to Tilawa! Let’s register your center. We’ve kept your email; complete the details, then verify your email with a sign-in code.",
  "signup.joinExisting": "Joining an existing center? Ask its admin to add you or send an invitation link, then sign in through that link.",
  "signup.center": "Center name",
  "signup.slug": "Center link",
  "signup.slugHint": "lowercase letters, digits and dashes",
  "signup.country": "Country",
  "signup.city": "City",
  "signup.you": "Your name",
  "signup.email": "Email",
  "signup.submit": "Create account",
  "signup.have": "Already have an account?",
  "signup.check": "We sent a 6-digit sign-in code to your email. Type it here to finish setting up your center. Check your spam folder too.",
  "signup.code": "Sign-in code",
  "signup.verify": "Confirm and continue",
  "signup.back": "Edit details",
  "lang.switch": "العربية",
};

const dict: Record<Locale, Record<Key, string>> = { ar, en };

export function t(locale: Locale, key: Key): string {
  return dict[locale][key] ?? ar[key];
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

// Staff copy uses the original Arabic as an explicit, searchable message key. Only call this
// for UI labels, never arbitrary names, Quran text or user content. Substitutions stay opaque.
export function staffText(locale: Locale, source: string, values: readonly (string | number | undefined | null)[] = []): string {
  const template = locale === "en" && Object.hasOwn(staffEnglish, source) ? (staffEnglish as Record<string, string>)[source] : source;
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)];
    return value == null ? match : typeof value === "number" ? formatNumber(locale, value) : value;
  });
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SY" : "en-GB").format(value);
}

/** Parse date-only records in local time so timezone offsets cannot move the recorded day. */
export function formatDate(locale: Locale, value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : "en-GB", options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}
