"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { normalizePhone } from "@/lib/guardian";
import { SECTION_LABEL, SECTIONS, type Section } from "@/lib/filter";

const EMPTY = { name: "", age: "", section: "" as Section | "", guardianName: "", phone: "", memorized: "", website: "" };

// Letters, spaces and . ' - only (the database checks the same).
const NAME_RE = /^[^0-9٠-٩@/\\{}[\]|$%^*=<>]+$/;

export default function RegisterForm({ centerSlug, centerName, open = true }: { centerSlug: string; centerName?: string; open?: boolean }) {
  const { tx } = useI18n();
  const [supabase] = useState(() => createClient());
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = f.name.trim();
    if (name.length < 2) return setError(tx("اكتبوا اسم الطالب"));
    if (!NAME_RE.test(name) || /https?:|www\./i.test(name)) return setError(tx("اسم الطالب: حروف فقط"));
    if (/https?:|www\./i.test(f.memorized + f.guardianName)) return setError(tx("لا تضعوا روابط في الطلب"));
    const age = f.age.trim() ? Number(f.age.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))) : null;
    if (age !== null && !(Number.isInteger(age) && age >= 3 && age <= 80)) return setError(tx("العمر غير صحيح"));
    if (!f.section) return setError(tx("اختاروا القسم"));
    const phone = normalizePhone(f.phone);
    if (!phone) return setError(tx("رقم ولي الأمر غير صحيح، مثلًا 0912345678"));
    if (!navigator.onLine) return setError(tx("لا يوجد اتصال بالإنترنت"));
    setBusy(true);
    const { error } = await supabase.rpc("submit_registration", {
      p_student_name: name,
      p_age: age,
      p_section: f.section,
      p_guardian_name: f.guardianName.trim() || null,
      p_guardian_phone: phone,
      p_memorized: f.memorized.trim() || null,
      p_trap: f.website || null,
      p_center: centerSlug,
    });
    setBusy(false);
    if (error) return setError(/[ء-ي]/.test(error.message) ? error.message : tx("تعذّر الإرسال، حاولوا مرة أخرى"));
    setSent(name);
    setF(EMPTY);
  }

  if (!open) {
    return (
      <div className="card center register-done">
        <h2>{tx("التسجيل مغلق حاليًا")}</h2>
        <p>{tx("لا يستقبل")} {centerName ?? tx("المركز")}  {tx("طلبات تسجيل جديدة الآن. تواصلوا مع إدارة المركز للاستفسار.")}</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card center register-done">
        <h2>{tx("✅ وصلنا طلب تسجيل")} {sent}</h2>
        <p>{tx("جزاكم الله خيرًا. ستتواصل إدارة المركز معكم على رقم واتساب قريبًا إن شاء الله.")}</p>
        <button className="secondary" onClick={() => setSent("")}>
          {tx("تسجيل طالب آخر")}</button>
      </div>
    );
  }

  return (
    <form className="card register-form" onSubmit={submit} noValidate>
      <h2>{tx("📝 تسجيل طالب جديد في حلقات القرآن")}</h2>
      <p className="muted">{tx("املؤوا البيانات، وتتواصل إدارة المركز معكم لتحديد الحلقة.")}</p>
      <label>
        {tx("اسم الطالب الثلاثي *")}<input value={f.name} onChange={set("name")} maxLength={100} autoComplete="off" required />
      </label>
      <div className="register-row">
        <label>
          {tx("العمر")}<input value={f.age} onChange={set("age")} inputMode="numeric" maxLength={2} placeholder={tx("مثلًا 10")} />
        </label>
        <label>
          {tx("القسم *")}<select value={f.section} onChange={set("section")} required>
            <option value="">{tx("اختر")}</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {tx(SECTION_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {tx("اسم ولي الأمر")}<input value={f.guardianName} onChange={set("guardianName")} maxLength={100} />
      </label>
      <label>
        {tx("رقم واتساب ولي الأمر *")}<input value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" dir="ltr" maxLength={20} placeholder="0912345678" />
      </label>
      <label>
        {tx("ماذا يحفظ من القرآن؟")}<textarea value={f.memorized} onChange={set("memorized")} maxLength={300} rows={2} placeholder={tx("مثلًا: جزء عمّ، أو لا شيء بعد")} />
      </label>
      {/* Hidden from people; programs that fill every field fill this one too. */}
      <label className="hp-field" aria-hidden="true">
        {tx("الموقع")}<input value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" />
      </label>
      {error && <p className="error-text">{tx(error)}</p>}
      <button type="submit" disabled={busy}>
        {busy ? tx("جارٍ الإرسال...") : tx("إرسال الطلب")}
      </button>
    </form>
  );
}
