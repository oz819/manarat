"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { CenterMark } from "@/components/center/Geo";

// Sign-in for a centre's staff: a 6-digit code sent by email — the only way in (no passwords).
// `allowCreate` lets an invited person make their login on the way.
export default function LoginDialog({
  title,
  subtitle,
  logo,
  next = "/app",
  defaultEmail = "",
  allowCreate = false,
  onClose,
}: {
  title: string;
  subtitle?: string;
  logo?: string | null;
  next?: string;
  defaultEmail?: string;
  allowCreate?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function done() {
    router.push(next); // push, not replace: the phone's back button returns to the landing
    router.refresh();
  }

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    // Read the field off the form: some autofill fills the DOM value without a React onChange.
    const submitted = (new FormData(e.currentTarget).get("email") as string | null)?.trim() ?? "";
    if (!submitted) return setError("الرجاء إدخال البريد الإلكتروني.");
    setEmail(submitted);
    setLoading(true);
    try {
      const { error } = await createClient().auth.signInWithOtp({ email: submitted, options: { shouldCreateUser: allowCreate } });
      if (error) {
        // With account creation disabled, Supabase returns otp_disabled for an unknown email.
        // Invited staff stay in their invite flow; service/rate-limit errors stay on this form.
        if (!allowCreate && (error.code === "otp_disabled" || error.code === "user_not_found")) {
          router.push(`/signup?${new URLSearchParams({ email: submitted, from: "login" })}`);
          return;
        }
        return setError(
          error.code === "signup_disabled" || error.code === "otp_disabled"
            ? "التسجيل مغلق حاليًا. أعد المحاولة لاحقًا أو تواصل مع إدارة المنصة."
            : error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"
              ? "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة."
              : error.code === "unexpected_failure"
                ? "تعذّر إرسال البريد الإلكتروني حاليًا بسبب مشكلة في خدمة البريد. أعد المحاولة لاحقًا."
                : `تعذّر إرسال الكود (${error.code ?? error.status ?? "خطأ غير معروف"}).`
        );
      }
      setStep("code");
    } catch {
      setError("تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setLoading(false);
    if (error) return setError(error.code === "otp_expired" ? "الكود غير صحيح أو منتهي الصلاحية." : `تعذّر تأكيد الكود (${error.code ?? error.status}).`);
    done();
  }

  const box = (
    <div className="loginbox" role="dialog" aria-modal="true" aria-label="تسجيل الدخول" onClick={(e) => e.stopPropagation()}>
      {onClose && (
        <button type="button" className="login-close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
      )}
      <div className="lg-head">
        <CenterMark name={title} logo={logo} size={64} />
        <h2>{title}</h2>
        <p>{subtitle ?? "دخول الإدارة والمعلّمين"}</p>
      </div>

      {process.env.NEXT_PUBLIC_DEMO === "1" && (
        <p className="notice" style={{ marginTop: 12 }}>
          نسخة تجريبية ببيانات وهمية: <b dir="ltr">admin@demo.com</b> (مركز النور) أو <b dir="ltr">doha@demo.com</b> (الدوحة) أو{" "}
          <b dir="ltr">both@demo.com</b> (معلّم بالمركزين) أو <b dir="ltr">super@demo.com</b> (إدارة المنصة) — كود الدخول <b dir="ltr">123456</b>.
        </p>
      )}
      {step === "email" ? (
        <form onSubmit={sendCode}>
          <div className="field">
            <label htmlFor="lg-email">البريد الإلكتروني</label>
            <input id="lg-email" type="email" name="email" defaultValue={email} required autoFocus={!!onClose} autoComplete="email" dir="ltr" />
          </div>
          <button type="submit" className="btn-block" disabled={loading}>
            {loading ? "جارٍ الإرسال..." : "إرسال كود الدخول"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <div className="notice" style={{ marginTop: 12 }}>
            أُرسل كود من 6 أرقام إلى <b dir="ltr">{email}</b>. تفقّد بريدك (والرسائل غير المرغوبة أيضًا).
          </div>
          <div className="field">
            <label htmlFor="lg-code">كود الدخول</label>
            <input
              id="lg-code"
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
          <button type="submit" className="btn-block" disabled={loading || code.length !== 6}>
            {loading ? "جارٍ التحقق..." : "تأكيد الدخول"}
          </button>
          <button type="button" className="secondary btn-block" style={{ marginTop: 8 }} onClick={() => { setStep("email"); setCode(""); setError(""); }} disabled={loading}>
            تغيير البريد الإلكتروني
          </button>
        </form>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  if (!onClose) return box;
  return (
    <div className="login-overlay" onClick={onClose}>
      {box}
    </div>
  );
}
