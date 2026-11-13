"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppContext";
import StudentCard from "@/components/StudentCard";
import { useScope } from "@/components/FilterBar";
import Panel from "@/components/Panel";
import ScreenHead from "@/components/ScreenHead";
import { matchesName } from "@/lib/arabic";
import { normalizePhone } from "@/lib/guardian";
import { store, newId, useStore } from "@/lib/offline/store";
import { latestOfTrack } from "@/lib/progress";
import { entryRange } from "@/lib/quran";
import { ATTENDANCE_LABEL, todayStr, type AttendanceStatus } from "@/lib/types";

const RECENT_KEY = "recentStudents";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// الطلاب: find a student and open their card (where attendance and today's recitation are recorded).
// Today's roll call and lesson live in «التسميع اليومي».
export default function Students({
  openId,
  onOpen,
  onClose,
}: {
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const s = useStore();
  const { mushaf, showToast, profile } = useApp();
  const [query, setQuery] = useState("");
  // Typing stays responsive on long lists: the filtered list re-renders at lower priority.
  const deferredQuery = useDeferredValue(query);
  // The section/halaqa filter is shared by every page and remembered (lib/filter.ts).
  const { inScope, scopedCircles } = useScope();
  const [showArchived, setShowArchived] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const listScroll = useRef(0);

  useEffect(() => setRecent(readRecent()), []);

  // Back from a student card: return to the same place in the list.
  useEffect(() => {
    if (!openId && listScroll.current) window.scrollTo({ top: listScroll.current });
  }, [openId]);

  function open(id: string) {
    listScroll.current = window.scrollY;
    onOpen(id);
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    window.scrollTo({ top: 0 });
  }

  if (openId) return <StudentCard studentId={openId} onClose={onClose} />;

  const today = todayStr();
  const quranBy = s.byStudent("quran_entries");
  const unsynced = s.unsyncedStudents();
  const students = s
    .all("students")
    .filter((st) => (showArchived ? !st.active : st.active))
    .filter((st) => inScope(st.circle_id))
    .filter((st) => matchesName(st.name, deferredQuery))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const active = s.all("students").filter((st) => st.active && inScope(st.circle_id));
  const presentToday = active.filter((st) => {
    const a = s.get("attendance", `${st.id}|${today}`);
    return a && !a.deleted_at && (a.status === "PRESENT" || a.status === "LATE");
  }).length;
  const recentStudents = recent.map((id) => s.get("students", id)).filter((st) => st && st.active);

  return (
    <section>
      <ScreenHead
        title="الطلاب"
        text="ابحث عن طالب وافتح بطاقته لتسجيل حضوره وتسميعه."
        action={
          <button className={adding ? "on" : ""} aria-pressed={adding} onClick={() => setAdding(true)}>
            إضافة طالب
          </button>
        }
      />

      {adding && (
        <Panel title="إضافة طالب" onClose={() => setAdding(false)}>
          <AddStudent
            defaultCircleId={scopedCircles[0]?.id ?? ""}
            onCancel={() => setAdding(false)}
            onAdded={(id) => {
              setAdding(false);
              showToast("تمت إضافة الطالب");
              open(id);
            }}
          />
        </Panel>
      )}

      <div className="card">
        {active.length > 0 && (
          <p className="today-line">
            الحضور اليوم: <b>{presentToday}</b> من {active.length}
            <span className="progress">
              <i style={{ width: `${Math.round((presentToday / active.length) * 100)}%` }} />
            </span>
          </p>
        )}
        <div className="search-row" style={{ gridTemplateColumns: "1fr" }}>
          <input type="search" placeholder="ابحث باسم الطالب..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="ابحث باسم الطالب" />
        </div>

        {!query && recentStudents.length > 0 && (
          <div className="recent">
            <span className="muted">فُتحوا مؤخرًا:</span>
            {recentStudents.map((st) => (
              <button key={st!.id} className="chip" onClick={() => open(st!.id)}>
                {st!.name}
              </button>
            ))}
          </div>
        )}

        {!s.status.initialSyncDone && !students.length ? (
          <p className="muted">جارٍ تنزيل البيانات لأول مرة... (يحتاج اتصالًا بالإنترنت)</p>
        ) : students.length ? (
          <ul className="student-list">
            {students.map((st) => {
              const hifz = latestOfTrack(quranBy.get(st.id), "HIFZ");
              const att = s.get("attendance", `${st.id}|${today}`);
              const status = att && !att.deleted_at ? (att.status as AttendanceStatus) : null;
              return (
                <li key={st.id} onClick={() => open(st.id)}>
                  <div>
                    <b>{st.name}</b>
                    {unsynced.has(st.id) && <span className="dot" title="محفوظ على الجهاز، سيُحفظ في الحساب عند الاتصال" />}
                    <div className="small muted">
                      {s.get("circles", st.circle_id)?.name ?? "—"}
                      {hifz && ` · آخر حفظ: ${mushaf.formatRange(entryRange(hifz))}`}
                    </div>
                  </div>
                  {status && (
                    <span className={`badge ${status === "ABSENT" ? "redo" : status === "EXCUSED" ? "warn" : "excellent"}`}>
                      {ATTENDANCE_LABEL[status]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{query ? "لا يوجد طلاب بهذا الاسم." : showArchived ? "لا يوجد طلاب مؤرشفون." : "لا يوجد طلاب بعد."}</p>
        )}

        {profile.role === "ADMIN" && (
          <p className="small">
            <button className="link" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "عرض الطلاب الحاليين" : "عرض المؤرشفين"}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

function AddStudent({
  defaultCircleId,
  onAdded,
  onCancel,
}: {
  defaultCircleId: string;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const s = useStore();
  const { center, tracks } = useApp();
  const circles = s.all("circles").filter((c) => c.active);
  const books = s.all("arabic_books").filter((b) => b.active);
  const [name, setName] = useState("");
  // Starts on the circle the list is filtered to, if any.
  const [circleId, setCircleId] = useState(circles.some((c) => c.id === defaultCircleId) ? defaultCircleId : (circles[0]?.id ?? ""));
  const [bookId, setBookId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  async function add() {
    if (!name.trim() || !circleId) return setError("أدخل الاسم واختر الحلقة");
    const guardianPhone = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !guardianPhone) return setError("رقم ولي الأمر غير صحيح — اكتبه مثل 0912345678");
    const id = newId();
    await store.save(
      "students",
      { id, name: name.trim(), circle_id: circleId, active: true, guardian_phone: guardianPhone },
      `إضافة طالب: ${name.trim()}`
    );
    if (bookId) {
      await store.save(
        "student_arabic_enrollments",
        { id: newId(), student_id: id, book_id: bookId, started_on: todayStr(), finished_on: null, deleted_at: null },
        "تسجيل في كتاب عربية"
      );
    }
    onAdded(id);
  }

  if (!circles.length) return <p className="notice">لا توجد حلقات بعد. يُنشئها المدير من شاشة الإدارة.</p>;

  return (
    <form
      className="formgrid compact"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      noValidate
    >
      <div>
        <label>اسم الطالب</label>
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
      </div>
      {tracks.has("ARABIC") && <div>
        <label>كتاب العربية (اختياري)</label>
        <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">بدون</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>}
      {center.guardian_whatsapp && (
        <div>
          <label>رقم واتساب ولي الأمر (اختياري)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" inputMode="tel" placeholder="0912345678" />
        </div>
      )}
      <div className="row-actions" style={{ alignSelf: "end" }}>
        <button type="submit">حفظ الطالب</button>
        <button type="button" className="secondary" onClick={onCancel}>
          إلغاء
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

