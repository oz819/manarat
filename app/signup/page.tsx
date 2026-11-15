"use client";

import { useI18n } from "@/components/LocaleProvider";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import DevCredit from "@/components/landing/DevCredit";
import { GeoStar } from "@/components/center/Geo";
import { SLUG_RE, applyPalette, slugify, type PendingCenter } from "@/lib/center";
import { dirOf, t, type Key } from "@/lib/i18n";

// سجّل مركزك: the owner's email and the centre's basics. There is no password: a 6-digit code is
// emailed (signInWithOtp, creating the login if it is new) and typed in here; then /onboarding creates
// the centre with these details and the owner becomes its admin. The details are also saved on the
// login itself, so a link-style email (/auth/confirm?next=/onboarding) leads to the same place.
export default function SignupPage() {
  const { tx } = useI18n();
  return <Suspense fallback={<div className="login"><p>{tx("جارٍ التحميل…")}</p></div>}><SignupForm /></Suspense>;
}

function SignupForm() {
  const { tx, locale, setLocale } = useI18n();
  const searchParams = useSearchParams();
  const fromLogin = searchParams.get("from") === "login";
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const tr = (k: Key) => t(locale, k);
  const [f, setF] = useState({ name: "", slug: "", country: "", city: "", owner: "", email: searchParams.get("email")?.trim() ?? "", website: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugTaken, setSlugTaken] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // After the code is sent: what was submitted (the centre's details) and the code typed so far.
  const [sent, setSent] = useState<{ email: string; pending: PendingCenter } | null>(null);
  const [code, setCode] = useState("");
  const [host, setHost] = useState("");
  useEffect(() => setHost(location.host), []);

  useEffect(() => applyPalette({ palette: "navy" }), []);
  // Already signed in: the centre is created straight away in the wizard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/onboarding?new=1");
    });
  }, [supabase, router]);

  // Is the link free? (public_center only finds active centres; create_center re-checks.)
  useEffect(() => {
    if (!SLUG_RE.test(f.slug)) return setSlugTaken(false);
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc("public_center", { p_slug: f.slug });
      setSlugTaken(!!data);
    }, 350);
    return () => clearTimeout(id);
  }, [f.slug, supabase]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const pending: PendingCenter = { name: f.name.trim(), slug: f.slug, country: f.country.trim(), city: f.city.trim(), owner: f.owner.trim() };
    const email = f.email.trim();
    if (f.website) return setSent({ email, pending }); // a bot filled the hidden field: no email is sent
    if (f.name.trim().length < 2) return setError(tx("اكتب اسم المركز"));
    if (!SLUG_RE.test(f.slug)) return setError(`${tr("signup.slug")}: ${tr("signup.slugHint")} (3–40)`);
    if (slugTaken) return setError(tx("هذا الرابط مستخدم، اختر غيره"));
    if (f.owner.trim().length < 2) return setError(tx("اكتب اسمك"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError(tx("اكتب بريدًا صحيحًا"));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${location.origin}/auth/confirm?next=/onboarding`,
        data: { name: pending.owner, pending_center: pending },
      },
    });
    setBusy(false);
    if (error) {
      return setError(
        error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"
          ? tx("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.")
          : error.code === "signup_disabled" || error.code === "otp_disabled"
            ? tx("التسجيل مغلق حاليًا.")
            : error.code === "unexpected_failure"
              ? tx("تعذّر إرسال البريد الإلكتروني حاليًا بسبب مشكلة في خدمة البريد. أعد المحاولة لاحقًا.")
              : error.message
      );
    }
    setCode("");
    setSent({ email, pending });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sent) return;
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: sent.email, token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      return setError(error.code === "otp_expired" ? tx("الكود غير صحيح أو منتهي الصلاحية.") : tx("تعذّر تأكيد الكود ({0}).", [error.code ?? error.status]));
    }
    // An email that already had a login keeps its old details; save this centre on it so the
    // wizard opens with them filled in.
    await supabase.auth.updateUser({ data: { pending_center: sent.pending } });
    router.replace("/onboarding?new=1");
  }

  return (
    <div className="ob geo-bg" dir={dirOf(locale)} lang={locale}>
      <div className="ob-box">
        <div className="cx-nav" style={{ padding: "0 0 8px" }}>
          <Link href="/" className="cx-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="header-mark" src="/icon-192.png" alt="" style={{ width: 34, height: 34 }} />
            <span>{tr("platform.name")}</span>
          </Link>
          <button type="button" className="link" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
            {tr("lang.switch")}
          </button>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <GeoStar style={{ width: 44, height: 44, opacity: 0.8 }} />
          <h1 className="ob-title" style={{ marginTop: 8 }}>{tr("signup.title")}</h1>
          <p className="ob-sub">{tr("signup.sub")}</p>

          {fromLogin && !sent && (
            <div className="notice" role="status" style={{ marginTop: 16 }}>
              <p>{tr("signup.welcome")}</p>
              <p className="small">{tr("signup.joinExisting")}</p>
            </div>
          )}

          {sent ? (
            <form onSubmit={verify}>
              <div className="notice" style={{ marginTop: 16 }}>
                {tr("signup.check")} <b dir="ltr">{sent.email}</b>
              </div>
              <div className="field">
                <label htmlFor="s-code">{tr("signup.code")}</label>
                <input
                  id="s-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="otp-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-block" disabled={busy || code.length !== 6}>
                {busy ? "..." : tr("signup.verify")}
              </button>
              <button type="button" className="secondary btn-block" style={{ marginTop: 8 }} onClick={() => { setSent(null); setCode(""); setError(""); }} disabled={busy}>
                {tr("signup.back")}
              </button>
              {error && <p className="error-text">{error}</p>}
            </form>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="s-name">{tr("signup.center")}</label>
                <input id="s-name" value={f.name} onChange={set("name")} maxLength={120} required />
              </div>
              <div className="field">
                <label htmlFor="s-slug">{tr("signup.slug")}</label>
                <div className="slug-input">
                  <span>{host}/</span>
                  <input
                    id="s-slug"
                    value={f.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
                    }}
                    maxLength={40}
                    placeholder="my-center"
                  />
                </div>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  {slugTaken ? <span className="error-text">{tx("هذا الرابط مستخدم")}</span> : tr("signup.slugHint")}
                </p>
              </div>
              <div className="two" style={{ marginTop: 12 }}>
                <div>
                  <label htmlFor="s-country">{tr("signup.country")}</label>
                  <input id="s-country" value={f.country} onChange={set("country")} maxLength={60} />
                </div>
                <div>
                  <label htmlFor="s-city">{tr("signup.city")}</label>
                  <input id="s-city" value={f.city} onChange={set("city")} maxLength={60} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-owner">{tr("signup.you")}</label>
                <input id="s-owner" value={f.owner} onChange={set("owner")} maxLength={100} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="s-email">{tr("signup.email")}</label>
                <input id="s-email" type="email" dir="ltr" value={f.email} onChange={set("email")} autoComplete="email" />
              </div>
              {/* Spam trap: hidden from people, filled by bots. */}
              <input name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp-field" />
              <button type="submit" className="btn-block" disabled={busy}>
                {busy ? "..." : tr("signup.submit")}
              </button>
              {error && <p className="error-text">{error}</p>}
              <p className="small center" style={{ marginTop: 12 }}>
                {tr("signup.have")} <Link href="/">{tr("platform.login")}</Link>
              </p>
            </form>
          )}
        </div>
        <DevCredit compact />
      </div>
    </div>
  );
}
