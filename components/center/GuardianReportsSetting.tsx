"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";

// إرسال التقارير لأولياء الأمور عبر واتساب (ملاحظة 5): off by default. When it is off, the app never
// asks for a guardian's number and shows no "no number" warnings; reports go to the administration.
export default function GuardianReportsSetting() {
  const { supabase, center, showToast, refreshCenter } = useApp();
  const [busy, setBusy] = useState(false);
  const on = !!center.guardian_whatsapp;

  async function toggle() {
    if (!navigator.onLine) return showToast("تغيير الإعداد يحتاج اتصالًا بالإنترنت");
    setBusy(true);
    const { error } = await supabase.from("centers").update({ guardian_whatsapp: !on }).eq("id", center.id);
    setBusy(false);
    if (error) return showToast(error.message);
    await refreshCenter();
    showToast(!on ? "فُعّل إرسال التقارير لأولياء الأمور" : "أُطفئ إرسال التقارير لأولياء الأمور");
  }

  return (
    <div className="card">
      <h3>التقارير لأولياء الأمور</h3>
      <p className="muted small">
        يرسل المعلّمون تقارير الحلقات إلى الإدارة. فعّل هذا الخيار إذا أردت أن يرسلوا أيضًا تقرير كل طالب إلى وليّ أمره عبر واتساب (يحتاج رقم وليّ الأمر).
      </p>
      <label className={`track-opt${on ? " on" : ""}`} style={{ maxWidth: 420 }}>
        <input type="checkbox" checked={on} onChange={toggle} disabled={busy} />
        <span>
          <b>إرسال التقارير لأولياء الأمور عبر واتساب</b>
          <small className="muted">{on ? "مفعّل" : "مُطفأ"}</small>
        </span>
      </label>
    </div>
  );
}
