"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store, newId } from "@/lib/offline/store";
import { byNewest } from "@/lib/progress";
import { EDU_AREAS, QUALITIES, todayStr, type EduNote } from "@/lib/types";

// Tarbiya track: behavioural notes. The optional grade (التقدير) is the periodic «التربية
// والسلوك» evaluation used by the rankings; the legacy edu_notes.points stays hidden (spec §10).
export default function TarbiyaSection({ studentId, notes }: { studentId: string; notes: EduNote[] }) {
  const { tx, date: formatDate } = useI18n();
  const { showToast } = useApp();
  const list = [...notes].sort(byNewest((n) => n.record_date));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [area, setArea] = useState<string>(EDU_AREAS[0]);
  const [note, setNote] = useState("");
  const [quality, setQuality] = useState("");
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState("");

  function reset() {
    setEditingId(null);
    setNote("");
    setQuality("");
    setDate(todayStr());
    setError("");
  }

  async function save() {
    if (!note.trim()) return setError(tx("اكتب الملاحظة"));
    await store.save(
      "edu_notes",
      {
        id: editingId ?? newId(),
        student_id: studentId,
        area,
        note: note.trim(),
        quality: quality || null,
        record_date: date,
        deleted_at: null,
      },
      `ملاحظة تربوية: ${area}`
    );
    showToast(editingId ? tx("تم التعديل") : tx("تم تسجيل الملاحظة"));
    reset();
  }

  async function remove(n: EduNote) {
    const who = store.get("students", studentId)?.name ?? "";
    const ok = await confirmDialog({
      title: tx("حذف الملاحظة التربوية «{0}» لـ {1}؟", [tx(n.area), who]),
      body: `${n.record_date} · ${n.note}\n` + tx("ينتقل إلى سجل المحذوفات، ويستطيع المدير استرجاعه من هناك."),
      ok: tx("حذف"),
      danger: true,
    });
    if (!ok) return;
    await store.softDelete("edu_notes", n.id, "حذف ملاحظة تربوية");
  }

  return (
    <div className="track">
      <div className="entry-form">
        <div className="formgrid compact">
          <div>
            <label>{tx("المجال")}</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {EDU_AREAS.map((a) => (
                <option key={a} value={a}>{tx(a)}</option>
              ))}
            </select>
          </div>
          <div>
            <label>{tx("التاريخ")}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>{tx("التقدير (للترتيب)")}</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label={tx("تقدير التربية والسلوك")}>
              <option value="">{tx("بدون تقدير")}</option>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>{tx(q)}</option>
              ))}
            </select>
          </div>
          <div className="wide">
            <label>{tx("الملاحظة")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("مثال: بادر إلى مساعدة زميله في المراجعة.")} />
          </div>
        </div>
        <div className="row-actions">
          <button onClick={save}>{editingId ? tx("حفظ التعديل") : tx("إضافة ملاحظة")}</button>
          {editingId && (
            <button className="secondary" onClick={reset}>
              {tx("إلغاء")}</button>
          )}
        </div>
        {error && <p className="error-text">{tx(error)}</p>}
      </div>
      {list.length ? (
        <ul className="history">
          {list.slice(0, 8).map((n) => (
            <li key={n.id}>
              <div>
                <b>{tx(n.area)}</b>
                <span className="muted"> · {formatDate(n.record_date ?? "")}</span>
                {n.quality && <span className="badge"> {tx(n.quality)}</span>}
                <div className="small">{n.note}</div>
              </div>
              <div className="row-actions">
                <button
                  className="link"
                  onClick={() => {
                    setEditingId(n.id);
                    setArea(n.area);
                    setNote(n.note);
                    setQuality(n.quality ?? "");
                    setDate(n.record_date);
                  }}
                >
                  {tx("تعديل")}</button>
                <button className="link danger-link" onClick={() => remove(n)}>
                  {tx("حذف")}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{tx("لا توجد ملاحظات بعد.")}</p>
      )}
    </div>
  );
}
