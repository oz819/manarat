"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import Panel from "@/components/Panel";
import { adminSoftDelete } from "@/lib/adminDelete";
import QuranTrackSection from "@/components/card/QuranTrackSection";
import ArabicSection from "@/components/card/ArabicSection";
import TarbiyaSection from "@/components/card/TarbiyaSection";
import GuardianBox from "@/components/card/GuardianBox";
import MemorizationMap, { ReviewSuggestions } from "@/components/card/MemorizationMap";
import ExamsSection from "@/components/card/ExamsSection";
import { takeCardIntent } from "@/lib/cardIntent";
import SlidingIndicator from "@/components/SlidingIndicator";
import { store, useStore } from "@/lib/offline/store";
import { byNewest, latestOfTrack } from "@/lib/progress";
import { normalizePhone } from "@/lib/guardian";
import { entryRange, type QuranRange } from "@/lib/quran";
import type { TrackKey } from "@/lib/tracks";
import { ATTENDANCE_LABEL, QUALITIES, todayStr, type AttendanceStatus, type QuranEntry } from "@/lib/types";

type Section = "MURAJAA" | "TILAWA" | "TALQEEN" | "ARABIC" | "TARBIYA" | "EXAMS" | "MAP";

// The tabs under the main box: only the tracks the centre has enabled (ملاحظة 4), plus the map.
const SECTION_TRACK: Partial<Record<Section, TrackKey>> = { TILAWA: "TILAWA", MURAJAA: "MURAJAA", TALQEEN: "TALQEEN", ARABIC: "ARABIC", TARBIYA: "TARBIYA", EXAMS: "EXAMS" };

const SECTIONS: { id: Section; label: string }[] = [
  { id: "MURAJAA", label: "المراجعة" },
  { id: "TILAWA", label: "التلاوة" },
  { id: "TALQEEN", label: "التلقين" },
  { id: "ARABIC", label: "العربية" },
  { id: "TARBIYA", label: "التربية" },
  { id: "EXAMS", label: "الاختبارات" },
  { id: "MAP", label: "خريطة الحفظ" },
];

// حاضر / متأخر / غائب (an excused absence recorded before still shows, on the «غائب» chip).
const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT"];

// بطاقة الطالب, in the order a teacher uses it: today's attendance at the top, then one box for today's
// recitation (from surah/ayah to surah/ayah and the grade), then the other enabled tracks as a few
// tabs, and the parents' link as a small link at the end.
export default function StudentCard({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const s = useStore();
  const { mushaf, profile, showToast, tracks } = useApp();
  const sections = SECTIONS.filter((x) => !SECTION_TRACK[x.id] || tracks.has(SECTION_TRACK[x.id]!)).map((x) =>
    x.id === "TALQEEN" ? { ...x, label: tracks.label("TALQEEN") } : x
  );
  // Opened from «جاهزون للاختبار»: straight to the exams tab on that juz'.
  const [intent] = useState(() => takeCardIntent(studentId));
  const [section, setSection] = useState<Section | null>(intent?.tab && tracks.has("EXAMS") ? intent.tab : null);
  const [editing, setEditing] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // A suggested review chosen from the map: opens the review form on that range.
  const [prefill, setPrefill] = useState<{ range: QuranRange; n: number } | null>(null);

  const student = s.get("students", studentId);
  if (!student) {
    return (
      <div className="card">
        <p className="muted">الطالب غير موجود على هذا الجهاز.</p>
        <button className="secondary" onClick={onClose}>
          رجوع
        </button>
      </div>
    );
  }

  const today = todayStr();
  const quran = s.byStudent("quran_entries").get(studentId) ?? [];
  const arabic = s.byStudent("arabic_entries").get(studentId) ?? [];
  const edu = s.byStudent("edu_notes").get(studentId) ?? [];
  const enrollments = s.byStudent("student_arabic_enrollments").get(studentId) ?? [];
  const att = s.get("attendance", `${studentId}|${today}`);
  const unsynced = s.unsyncedStudents().has(studentId);
  const circle = s.get("circles", student.circle_id);
  const moves = s
    .all("student_transfers")
    .filter((t) => t.student_id === studentId && !t.deleted_at)
    .sort((a, b) => b.transfer_date.localeCompare(a.transfer_date));
  const status = att && !att.deleted_at ? (att.status as AttendanceStatus) : null;
  const lastHifz = latestOfTrack(quran, "HIFZ");

  function review(range: QuranRange) {
    setPrefill({ range, n: (prefill?.n ?? 0) + 1 });
    setSection(tracks.has("MURAJAA") ? "MURAJAA" : null);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      await store.fetchStudentHistory(studentId);
      showToast("تم تحميل السجل الكامل");
    } catch {
      showToast("تعذّر التحميل — تحتاج اتصالًا بالإنترنت");
    } finally {
      setLoadingHistory(false);
    }
  }

  return (
    <section className="student-card">
      <div className="card student-head">
        <div className="title">
          <div>
            <button className="link" onClick={onClose}>
              → كل الطلاب
            </button>
            <h2 style={{ margin: "4px 0" }}>
              {student.name} {!student.active && <span className="badge redo">مؤرشف</span>}
            </h2>
            <span className="muted">{circle?.name ?? "—"}</span>
            {unsynced && <span className="badge warn" style={{ marginInlineStart: 8 }}>لم يُحفظ في الحساب بعد</span>}
          </div>
          <button className="link" aria-pressed={editing} onClick={() => setEditing(true)}>
            تعديل الطالب
          </button>
        </div>

        {editing && (
          <Panel title="تعديل بيانات الطالب" onClose={() => setEditing(false)} className="panel-inset">
            <EditStudent studentId={studentId} isAdmin={profile.role === "ADMIN"} onDone={() => setEditing(false)} onDeleted={onClose} />
          </Panel>
        )}

        <div className="att-row">
          <span className="muted">الحضور اليوم:</span>
          {STATUSES.map((st) => {
            const on = status === st || (st === "ABSENT" && status === "EXCUSED");
            return (
              <button
                key={st}
                className={on ? `chip on ${(status ?? st).toLowerCase()}` : "chip"}
                onClick={() => store.setAttendance(studentId, today, on ? null : st)}
              >
                {st === "ABSENT" && status === "EXCUSED" ? ATTENDANCE_LABEL.EXCUSED : ATTENDANCE_LABEL[st]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card today-box">
        <div className="title">
          <h3>تسميع اليوم</h3>
          {lastHifz && (
            <span className="muted small">
              آخر تسميع: {mushaf.formatRange(entryRange(lastHifz))} · {lastHifz.entry_date}
            </span>
          )}
        </div>
        <QuranTrackSection key={`${studentId}-HIFZ`} studentId={studentId} track="HIFZ" entries={quran} compact />
      </div>

      {sections.length > 0 && (
        <div className="tabs sliding card-tabs" role="tablist" aria-label="باقي المتابعة">
          <SlidingIndicator active={section ?? ""} />
          {sections.map((sec) => (
            <button
              key={sec.id}
              role="tab"
              aria-selected={section === sec.id}
              className={section === sec.id ? "active" : ""}
              onClick={() => {
                setPrefill(null);
                setSection(section === sec.id ? null : sec.id);
              }}
            >
              {sec.label}
            </button>
          ))}
        </div>
      )}

      {section && (
        <div className="card">
          {section === "MURAJAA" && !prefill && (
            <details className="review-box">
              <summary>مراجعة اليوم المقترحة</summary>
              <ReviewSuggestions entries={quran} onReview={review} />
            </details>
          )}
          {(section === "TILAWA" || section === "MURAJAA") && (
            <QuranTrackSection
              key={`${studentId}-${section}-${section === "MURAJAA" ? (prefill?.n ?? 0) : 0}`}
              studentId={studentId}
              track={section}
              entries={quran}
              prefill={section === "MURAJAA" ? prefill?.range : null}
            />
          )}
          {section === "MAP" && <MemorizationMap studentId={studentId} entries={quran} onReview={review} />}
          {section === "EXAMS" && (
            <ExamsSection key={studentId} studentId={studentId} exams={s.byStudent("exams").get(studentId) ?? []} initialJuz={intent?.juz} />
          )}
          {section === "TALQEEN" && <TalqeenList entries={quran.filter((e) => e.track === "TALQEEN")} />}
          {section === "ARABIC" && <ArabicSection key={studentId} studentId={studentId} enrollments={enrollments} entries={arabic} />}
          {section === "TARBIYA" && <TarbiyaSection key={studentId} studentId={studentId} notes={edu} />}
        </div>
      )}

      <div className="card-foot">
        <button className="link" aria-expanded={guardian} onClick={() => setGuardian((g) => !g)}>
          رابط وليّ الأمر
        </button>
        <button className="link" onClick={loadHistory} disabled={loadingHistory}>
          {loadingHistory ? "جارٍ التحميل..." : "السجل الأقدم"}
        </button>
        {moves.length > 0 && (
          <details className="moves small">
            <summary>سجل الحلقات ({moves.length})</summary>
            <ul>
              {moves.map((t) => (
                <li key={t.id}>
                  {t.transfer_date}: من «{s.get("circles", t.from_circle_id ?? "")?.name ?? "—"}» إلى «
                  {s.get("circles", t.to_circle_id ?? "")?.name ?? "—"}»
                </li>
              ))}
            </ul>
            <span className="muted">سجلاته قبل كل نقل تبقى محسوبة على حلقته القديمة.</span>
          </details>
        )}
      </div>
      {guardian && (
        <div className="card">
          <GuardianBox studentId={studentId} onEdit={() => setEditing(true)} />
        </div>
      )}
    </section>
  );
}

function TalqeenList({ entries }: { entries: QuranEntry[] }) {
  const { mushaf, showToast } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const list = [...entries].sort(byNewest((e) => e.entry_date));

  if (!list.length) return <p className="muted">لا توجد جلسات تلقين لهذا الطالب. تُسجَّل من شاشة «التلقين».</p>;

  return (
    <ul className="history">
      {list.map((e) => (
        <li key={e.id} className={editingId === e.id ? "editing" : ""}>
          <div style={{ flex: 1 }}>
            <b>{mushaf.formatRange(entryRange(e))}</b>
            <span className="muted"> · {e.entry_date}</span>
            {e.quality && <span className="badge">{e.quality}</span>}
            {e.notes && <div className="small muted">{e.notes}</div>}
            {editingId === e.id && (
              <div className="formgrid compact" style={{ marginTop: 8 }}>
                <select value={quality} onChange={(ev) => setQuality(ev.target.value)}>
                  <option value="">—</option>
                  {QUALITIES.map((q) => (
                    <option key={q}>{q}</option>
                  ))}
                </select>
                <input value={notes} placeholder="ملاحظة" onChange={(ev) => setNotes(ev.target.value)} />
                <button
                  onClick={async () => {
                    await store.save("quran_entries", { ...e, quality: quality || null, notes: notes.trim() || null }, "تعديل تلقين");
                    setEditingId(null);
                    showToast("تم التعديل");
                  }}
                >
                  حفظ
                </button>
              </div>
            )}
          </div>
          <div className="row-actions">
            <button
              className="link"
              onClick={() => {
                setEditingId(e.id);
                setQuality(e.quality ?? "");
                setNotes(e.notes ?? "");
              }}
            >
              تعديل
            </button>
            <button
              className="link danger-link"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `حذف التلقين «${store.get("students", e.student_id)?.name ?? ""}»؟`,
                  body: `${e.entry_date} · ${mushaf.formatRange(entryRange(e))}\n` + "ينتقل إلى سجل المحذوفات، ويستطيع المدير استرجاعه من هناك.",
                  ok: "حذف",
                  danger: true,
                });
                if (ok) await store.softDelete("quran_entries", e.id, "حذف تلقين");
              }}
            >
              حذف
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EditStudent({
  studentId,
  isAdmin,
  onDone,
  onDeleted,
}: {
  studentId: string;
  isAdmin: boolean;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const s = useStore();
  const { supabase, showToast, center } = useApp();
  const student = s.get("students", studentId)!;
  const [name, setName] = useState(student.name);
  const [circleId, setCircleId] = useState(student.circle_id);
  const [guardianName, setGuardianName] = useState(student.guardian_name ?? "");
  const [phone, setPhone] = useState(student.guardian_phone ?? "");
  const [error, setError] = useState("");
  const circles = s.all("circles").filter((c) => c.active || c.id === student.circle_id);

  async function save() {
    if (!name.trim()) return;
    const guardianPhone = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !guardianPhone) return setError("رقم ولي الأمر غير صحيح — اكتبه مثل 0912345678 أو ‎+963912345678");
    await store.save(
      "students",
      { ...student, name: name.trim(), circle_id: circleId, guardian_name: guardianName.trim() || null, guardian_phone: guardianPhone },
      "تعديل بيانات طالب"
    );
    showToast("تم حفظ بيانات الطالب");
    onDone();
  }

  async function toggleArchive() {
    if (!confirm(student.active ? "أرشفة هذا الطالب؟" : "إلغاء أرشفة الطالب؟")) return;
    await store.save("students", { ...student, active: !student.active }, student.active ? "أرشفة طالب" : "إلغاء أرشفة طالب");
    onDone();
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `حذف الطالب «${student.name}»؟`,
      body: "ينتقل إلى سجل المحذوفات ويختفي من كل القوائم والتقارير. تبقى سجلاته كاملة، ويمكن استرجاعه من سجل المحذوفات.",
      ok: "حذف",
      danger: true,
    });
    if (!ok) return;
    const err = await adminSoftDelete(supabase, "student", student.id);
    if (err) return showToast(err);
    showToast(`تم حذف «${student.name}» — تجده في سجل المحذوفات`);
    onDeleted();
  }

  return (
    <div className="formgrid compact" style={{ margin: "10px 0" }}>
      <div>
        <label>الاسم</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label>الحلقة</label>
        <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {circleId !== student.circle_id && (
          <p className="small muted">نقل من اليوم: سجلاته السابقة تبقى محسوبة على حلقته الحالية في الترتيب والتقارير.</p>
        )}
      </div>
      {center.guardian_whatsapp && <>
      <div>
        <label>اسم ولي الأمر</label>
        <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="اختياري" />
      </div>
      <div>
        <label>رقم واتساب ولي الأمر</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" inputMode="tel" placeholder="0912345678" />
      </div>
      </>}
      <div className="row-actions" style={{ alignSelf: "end" }}>
        <button onClick={save}>حفظ</button>
        <button className="secondary" onClick={onDone}>
          إلغاء التعديل
        </button>
        {isAdmin && (
          <button className="secondary" onClick={toggleArchive}>
            {student.active ? "أرشفة" : "إلغاء الأرشفة"}
          </button>
        )}
        {isAdmin && (
          <button className="danger" onClick={remove}>
            حذف
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
