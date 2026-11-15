"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store, useStore } from "@/lib/offline/store";
import { formatPhone, guardianMessage, guardianUrl, sinceLabel, waLink } from "@/lib/guardian";

// رابط ولي الأمر in the student card: who the guardian is, the family's private page link
// (copy / send on WhatsApp), when they last opened it, and — admin only — a new link.
export default function GuardianBox({ studentId, onEdit }: { studentId: string; onEdit: () => void }) {
  const { tx, locale } = useI18n();
  const s = useStore();
  const { supabase, profile, showToast } = useApp();
  const student = s.get("students", studentId)!;
  const link = s.get("guardian_links", studentId);
  const phone = student.guardian_phone;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(guardianUrl(link.token));
      showToast(tx("تم نسخ رابط ولي الأمر"));
    } catch {
      prompt(tx("انسخ الرابط:"), guardianUrl(link.token));
    }
  }

  async function rotate() {
    const ok = await confirmDialog({
      title: tx("إلغاء الرابط الحالي وتوليد رابط جديد؟"),
      body: tx("الرابط القديم يتوقف عن العمل فورًا، ويجب إرسال الرابط الجديد للأهل."),
      ok: tx("رابط جديد"),
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("rotate_guardian_link", { p_student_id: studentId });
    if (error) return showToast(/fetch|network/i.test(error.message) ? tx("تحتاج اتصالًا بالإنترنت") : error.message);
    const { data } = await supabase.from("guardian_links").select("*").eq("student_id", studentId);
    if (data) await store.applyRemote("guardian_links", data);
    showToast(tx("تم توليد رابط جديد — أرسله للأهل"));
  }

  return (
    <div className="guardian-box">
      <p className="small muted">{tx("رابط خاص لمتابعة هذا الطالب بلا تسجيل دخول: الحفظ والحضور وآخر الدروس والاختبارات. أرسله لولي الأمر فقط؛ الإرسال على واتساب يفتح رسالة جاهزة لتراجعها وترسلها بنفسك.")}</p>
      <div>
        <span className="muted">{tx("ولي الأمر:")} </span>
        {student.guardian_name || phone ? (
          <b>
            {student.guardian_name ?? ""}
            {phone && (
              <bdi dir="ltr" className="phone">
                {formatPhone(phone)}
              </bdi>
            )}
          </b>
        ) : (
          <button className="link" onClick={onEdit}>
            {tx("+ أضف اسم ولي الأمر ورقمه")}</button>
        )}
        {link && <div className="small muted">{tx("صفحة المتابعة:")} {sinceLabel(link.last_opened_at, locale)}{link.open_count > 1 ? tx(" · {0} مرة", [link.open_count]) : ""}</div>}
      </div>
      {link ? (
        <div className="row-actions">
          <button className="secondary" onClick={copy}>
            {tx("🔗 نسخ رابط ولي الأمر")}</button>
          <a className="btn secondary" href={waLink(guardianMessage(student.name, link.token, locale), phone)} target="_blank" rel="noreferrer">
            {tx("إرسال على واتساب")}</a>
          {profile.role === "ADMIN" && (
            <button className="link danger-link" onClick={rotate}>
              {tx("رابط جديد")}</button>
          )}
        </div>
      ) : (
        <span className="small muted">{tx("يظهر الرابط بعد حفظ الطالب في الحساب (عند الاتصال بالإنترنت).")}</span>
      )}
    </div>
  );
}
