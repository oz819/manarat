"use client";

import { staffText, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { usePersistentState } from "@/lib/usePersistentState";
import ProgressRing from "@/components/ProgressRing";
import { useScope } from "@/components/FilterBar";
import { useHistoryScope } from "@/components/ranking/useHistoryScope";
import type { CircleOn } from "@/lib/transfers";
import SendReports from "@/components/SendReports";
import { LOCAL_WINDOW_DAYS, useStore } from "@/lib/offline/store";
import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import {
  ATTENDANCE_LABEL,
  TRACK_LABEL,
  addDays,
  todayStr,
  type ArabicBook,
  type ArabicEntry,
  type Attendance,
  type AttendanceStatus,
  type CircleLesson,
  type QuranEntry,
  type QuranTrack,
  type Student,
} from "@/lib/types";

type TrackKey = QuranTrack | "ARABIC" | "TARBIYA" | "ATTENDANCE" | "LESSON";
const TRACKS: { id: TrackKey; label: string }[] = [
  { id: "HIFZ", label: "الحفظ" },
  { id: "TILAWA", label: "التلاوة" },
  { id: "MURAJAA", label: "المراجعة" },
  { id: "TALQEEN", label: "التلقين" },
  { id: "ARABIC", label: "العربية" },
  { id: "TARBIYA", label: "التربية" },
  { id: "ATTENDANCE", label: "الحضور" },
  { id: "LESSON", label: "الدرس" },
];

type Period = "day" | "range" | "month";
type TarbiyaRow = { id: string; student_id: string; record_date: string; area: string; note: string };
type ReportData = {
  quran: QuranEntry[];
  arabic: ArabicEntry[];
  tarbiya: TarbiyaRow[];
  attendance: Attendance[];
  /** The halaqat's lessons (درس اليوم); shown for students present that day. */
  lessons: CircleLesson[];
};

type Cell = { text: string; empty: boolean };
type Row = { student: Student; cells: Partial<Record<TrackKey, Cell>> };

// Flexible reporting (spec §5.3): scope × period × tracks. Built server-side by report_data();
// offline it falls back to this device's local copy and says so.
export default function Reports() {
  const { tx, locale, date: formatDate } = useI18n();
  const s = useStore();
  const { supabase, mushaf, tracks: centerTracks } = useApp();
  // التلقين only when the centre uses it, under the centre's own name for it.
  const options = TRACKS.filter((t) => t.id !== "TALQEEN" || centerTracks.has("TALQEEN")).map((t) =>
    t.id === "TALQEEN" ? { ...t, label: centerTracks.label("TALQEEN") } : { ...t, label: tx(t.label) }
  );
  // Who the report covers: the students in the shared filter (section / halaqa / all), or one of them.
  const { filter, inScope, label: filterName } = useScope();
  const allStudents = s
    .all("students")
    .filter((st) => st.active && inScope(st.circle_id))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const [scope, setScope] = usePersistentState<"filter" | "student">("reports.mode", "filter");
  const [savedStudentId, setStudentId] = useState(allStudents[0]?.id ?? "");
  const studentId = allStudents.some((st) => st.id === savedStudentId) ? savedStudentId : (allStudents[0]?.id ?? "");
  const circleId = filter.startsWith("c:") ? filter.slice(2) : null;
  const [period, setPeriod] = useState<Period>("day");
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(addDays(todayStr(), -6));
  const [to, setTo] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [tracks, setTracks] = useState<Set<TrackKey>>(() =>
    new Set<TrackKey>(["HIFZ", "TILAWA", "MURAJAA", ...(centerTracks.has("TALQEEN") ? (["TALQEEN"] as const) : []), "ATTENDANCE", "LESSON"])
  );
  const [data, setData] = useState<ReportData | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const [pFrom, pTo] =
    period === "day"
      ? [day, day]
      : period === "range"
        ? [from, to]
        : [`${month}-01`, addDays(`${addMonth(month)}-01`, -1)];

  // A moved student's past days stay in their old halaqa's reports (نقل الطلاب).
  const history = useHistoryScope();
  const students =
    scope === "filter"
      ? history
          .pool(
            s.all("students").filter((st) => st.active),
            pFrom,
            pTo
          )
          .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      : allStudents.filter((st) => st.id === studentId);
  const studentIds = new Set(students.map((st) => st.id));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const local = (): ReportData => ({
        quran: s.all("quran_entries").filter((e) => !e.deleted_at && e.entry_date >= pFrom && e.entry_date <= pTo),
        arabic: s.all("arabic_entries").filter((e) => !e.deleted_at && e.entry_date >= pFrom && e.entry_date <= pTo),
        tarbiya: s.all("edu_notes").filter((n) => !n.deleted_at && n.record_date >= pFrom && n.record_date <= pTo),
        attendance: s.all("attendance").filter((a) => !a.deleted_at && a.att_date >= pFrom && a.att_date <= pTo),
        lessons: s.all("circle_lessons").filter((l) => !l.deleted_at && l.lesson_date >= pFrom && l.lesson_date <= pTo),
      });
      if (!navigator.onLine) {
        if (!cancelled) {
          setData(local());
          setOffline(true);
          setLoading(false);
        }
        return;
      }
      const { data: res, error: err } = await supabase.rpc("report_data", {
        p_from: pFrom,
        p_to: pTo,
        ...(scope === "filter" && circleId && !history.moved ? { p_circle_id: circleId } : {}),
        ...(scope === "student" ? { p_student_id: studentId } : {}),
      });
      if (cancelled) return;
      if (err) {
        setData(local());
        setOffline(true);
        if (!/fetch|network/i.test(err.message)) setError(err.message);
      } else {
        const r = res as unknown as ReportData;
        setData({ ...r, lessons: r.lessons ?? [] });
        setOffline(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Re-query when the filters change; local data changes don't need a server round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, pFrom, pTo, scope, circleId, studentId, history.moved]);

  const books = s.lookup("arabic_books");
  // The filter's students, on the days they were in its halaqat.
  const keep = <R extends { student_id: string }>(rows: R[], day: (r: R) => string) =>
    rows.filter((r) => studentIds.has(r.student_id) && (scope !== "filter" || inScope(history.circleOn(r.student_id, day(r)) ?? "")));
  const filtered: ReportData | null = data && {
    quran: keep(data.quran, (e) => e.entry_date),
    arabic: keep(data.arabic, (e) => e.entry_date),
    tarbiya: keep(data.tarbiya, (n) => n.record_date),
    attendance: keep(data.attendance, (a) => a.att_date),
    lessons: data.lessons,
  };
  const chosen = options.filter((t) => tracks.has(t.id));
  const rows = filtered ? buildRows(locale, students, filtered, chosen.map((t) => t.id), period, mushaf, books, history.circleOn) : [];
  const scopeLabel =
    scope === "student" ? (s.get("students", studentId)?.name ?? "—") : filter === "all" ? tx("جميع الحلقات") : filterName;
  const periodLabel = period === "day" ? formatDate(pFrom) : period === "month" ? formatDate(`${month}-01`, { month: "long", year: "numeric" }) : `${formatDate(pFrom)} – ${formatDate(pTo)}`;
  const whatsapp = buildWhatsApp(locale, rows, chosen, scopeLabel, periodLabel);
  const timeline =
    scope === "student" && filtered
      ? buildTimeline(locale, filtered, chosen.map((t) => t.id), mushaf, books, history.circleOn, s.get("students", studentId))
      : null;

  function copy() {
    navigator.clipboard?.writeText(whatsapp);
  }

  function csv() {
    const header = [tx("الطالب"), ...chosen.map((t) => t.label)];
    const lines = [header, ...rows.map((r) => [r.student.name, ...chosen.map((t) => r.cells[t.id]?.text ?? "")])];
    const body = lines.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${pFrom}-${pTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section>
      <div className="card no-print">
        <div className="title">
          <h3>{tx("📊 التقارير")}</h3>
          <button className={sending ? "on" : ""} aria-pressed={sending} onClick={() => setSending(true)}>
            {tx("📤 إرسال تقارير الحلقة")}</button>
        </div>
        <div className="formgrid compact">
          <div>
            <label>{tx("النطاق")}</label>
            <select value={scope === "student" ? "student" : "filter"} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="filter">{filter === "all" ? tx("كل الطلاب") : filter.startsWith("s:") ? tx("كل {0}", [filterName]) : tx("طلاب {0}", [filterName])}</option>
              <option value="student">{tx("طالب واحد")}</option>
            </select>
          </div>
          {scope === "student" && (
            <div>
              <label>{tx("الطالب")}</label>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {allStudents.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>{tx("الفترة")}</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="day">{tx("يوم")}</option>
              <option value="range">{tx("من تاريخ إلى تاريخ")}</option>
              <option value="month">{tx("شهر")}</option>
            </select>
          </div>
          {period === "day" && (
            <div>
              <label>{tx("اليوم")}</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
          )}
          {period === "range" && (
            <>
              <div>
                <label>{tx("من")}</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label>{tx("إلى")}</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {period === "month" && (
            <div>
              <label>{tx("الشهر")}</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          )}
        </div>
        <div className="recent" style={{ marginTop: 10 }}>
          <span className="muted">{tx("المسارات:")}</span>
          {options.map((t) => (
            <label key={t.id} className="chip inline">
              <input
                type="checkbox"
                checked={tracks.has(t.id)}
                onChange={(e) => {
                  const next = new Set(tracks);
                  if (e.target.checked) next.add(t.id);
                  else next.delete(t.id);
                  setTracks(next);
                }}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {sending && (
        <div className="no-print">
          <SendReports onClose={() => setSending(false)} />
        </div>
      )}

      {offline && (
        <div className="notice no-print">
          {tx("بدون اتصال: التقرير من بيانات هذا الجهاز فقط وقد يكون ناقصًا")}{pFrom < addDays(todayStr(), -LOCAL_WINDOW_DAYS) && tx(" (الجهاز يحتفظ بآخر {0} يومًا فقط)", [LOCAL_WINDOW_DAYS])}.
        </div>
      )}
      {error && <p className="error-text">{tx(error)}</p>}

      <div className="card print-area">
        <div className="title">
          <h3>
            {scopeLabel} — {periodLabel}
          </h3>
          <div className="row-actions no-print">
            <button className="secondary" onClick={copy}>
              {tx("نسخ لواتساب")}</button>
            <button className="secondary" onClick={() => window.print()}>
              {tx("طباعة / PDF")}</button>
            <button className="secondary" onClick={csv}>
              CSV
            </button>
          </div>
        </div>
        {filtered && <SummaryRings data={filtered} studentCount={students.length} />}
        {loading && !data ? (
          <p className="muted">{tx("جارٍ التحميل...")}</p>
        ) : timeline ? (
          timeline.length ? (
            <table>
              <thead>
                <tr>
                  <th>{tx("التاريخ")}</th>
                  <th>{tx("المسار")}</th>
                  <th>{tx("التفاصيل")}</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((t, i) => (
                  <tr key={i}>
                    <td>{formatDate(t.date)}</td>
                    <td>{t.track}</td>
                    <td>{t.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{tx("لا توجد إدخالات في هذه الفترة.")}</p>
          )
        ) : (
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{tx("الطالب")}</th>
                  {chosen.map((t) => (
                    <th key={t.id}>{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student.id}>
                    <td>
                      <b>{r.student.name}</b>
                    </td>
                    {chosen.map((t) => (
                      <td key={t.id} className={r.cells[t.id]?.empty ? "muted" : ""}>
                        {r.cells[t.id]?.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function addMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function buildRows(locale: Locale,
  students: Student[],
  d: ReportData,
  tracks: TrackKey[],
  period: Period,
  mushaf: Mushaf,
  books: Map<string, ArabicBook>,
  circleOn: CircleOn
): Row[] {
  const tx = (source: string, values?: readonly (string | number | null | undefined)[]) => staffText(locale, source, values);
  const quran = groupBy(d.quran, (e) => e.student_id);
  const arabic = groupBy(d.arabic, (e) => e.student_id);
  const tarbiya = groupBy(d.tarbiya, (n) => n.student_id);
  const att = groupBy(d.attendance, (a) => a.student_id);
  const empty = (text = period === "day" ? tx("لم يُسجَّل") : "—"): Cell => ({ text, empty: true });

  return students.map((student) => {
    const cells: Row["cells"] = {};
    for (const t of tracks) {
      if (t === "LESSON") {
        const taken = attendedLessons(student, att.get(student.id), d.lessons, circleOn);
        cells[t] = taken.length ? { text: taken.map((l) => l.title).join("، "), empty: false } : empty("—");
      } else if (t === "ATTENDANCE") {
        const list = att.get(student.id) ?? [];
        if (period === "day") {
          cells[t] = list[0] ? { text: tx(ATTENDANCE_LABEL[list[0].status as AttendanceStatus]), empty: false } : empty();
        } else {
          const counts = new Map<string, number>();
          for (const a of list) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
          cells[t] = list.length
            ? {
                text: (["PRESENT", "LATE", "EXCUSED", "ABSENT"] as AttendanceStatus[])
                  .filter((st) => counts.get(st))
                  .map((st) => `${tx(ATTENDANCE_LABEL[st])} ${counts.get(st)}`)
                  .join("، "),
                empty: false,
              }
            : empty();
        }
      } else if (t === "ARABIC") {
        const list = (arabic.get(student.id) ?? []).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
        if (!list.length) cells[t] = empty();
        else if (period === "day") {
          cells[t] = { text: list.map((e) => tx("{0} ص {1}–{2}", [books.get(e.book_id)?.title ?? "", e.from_page, e.to_page])).join("، "), empty: false };
        } else {
          const pages = list.reduce((n, e) => n + e.to_page - e.from_page + 1, 0);
          cells[t] = { text: tx("{0} صفحة (ص {1} ← {2})", [pages, list[0].from_page, Math.max(...list.map((e) => e.to_page))]), empty: false };
        }
      } else if (t === "TARBIYA") {
        const list = tarbiya.get(student.id) ?? [];
        cells[t] = list.length
          ? { text: period === "day" ? list.map((n) => `${tx(n.area)}: ${n.note}`).join(" | ") : tx("{0} ملاحظة", [list.length]), empty: false }
          : empty();
      } else {
        const list = (quran.get(student.id) ?? [])
          .filter((e) => e.track === t)
          .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
        const ranges = list.map(entryRange).filter((r): r is QuranRange => !!r);
        if (!list.length) cells[t] = empty();
        else if (period === "day") {
          cells[t] = {
            text: list.map((e) => `${mushaf.formatRange(entryRange(e), locale)}${e.quality ? ` (${tx(e.quality)})` : ""}`).join("، "),
            empty: false,
          };
        } else {
          const amount = t === "HIFZ" ? mushaf.coverage(ranges) : ranges.reduce((n, r) => n + mushaf.length(r), 0);
          const span = ranges.length
            ? `${mushaf.formatRange({ from: ranges[0].from, to: ranges[0].from }, locale)} ← ${mushaf.formatRange({ from: ranges[ranges.length - 1].to, to: ranges[ranges.length - 1].to }, locale)}`
            : "";
          cells[t] = { text: tx("{0} آية · {1} مرة{2}", [amount, list.length, span ? ` · ${span}` : ""]), empty: false };
        }
      }
    }
    return { student, cells };
  });
}

// The lessons of the student's halaqa on the days they were present or late.
// The lessons of the halaqa the student was in on each day they attended.
function attendedLessons(student: Student, att: Attendance[] | undefined, lessons: CircleLesson[], circleOn: CircleOn): CircleLesson[] {
  const days = new Set((att ?? []).filter((a) => a.status === "PRESENT" || a.status === "LATE").map((a) => a.att_date));
  return lessons
    .filter((l) => days.has(l.lesson_date) && l.circle_id === (circleOn(student.id, l.lesson_date) ?? student.circle_id))
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
}

function buildTimeline(locale: Locale, d: ReportData, tracks: TrackKey[], mushaf: Mushaf, books: Map<string, ArabicBook>, circleOn: CircleOn, student?: Student) {
  const tx = (source: string, values?: readonly (string | number | null | undefined)[]) => staffText(locale, source, values);
  const items: { date: string; order: string; track: string; text: string }[] = [];
  for (const e of d.quran) {
    if (!tracks.includes(e.track as TrackKey)) continue;
    items.push({
      date: e.entry_date,
      order: e.created_at,
      track: tx(TRACK_LABEL[e.track as QuranTrack]),
      text: `${mushaf.formatRange(entryRange(e), locale)}${e.quality ? ` — ${tx(e.quality)}` : ""}${e.notes ? ` — ${e.notes}` : ""}`,
    });
  }
  if (tracks.includes("ARABIC")) {
    for (const e of d.arabic) {
      items.push({
        date: e.entry_date,
        order: e.created_at,
        track: tx("العربية"),
        text: tx("{0} ص {1}–{2}{3}", [books.get(e.book_id)?.title ?? "", e.from_page, e.to_page, e.quality ? ` — ${tx(e.quality)}` : ""]),
      });
    }
  }
  if (tracks.includes("TARBIYA")) {
    for (const n of d.tarbiya) items.push({ date: n.record_date, order: "", track: tx("التربية"), text: `${tx(n.area)}: ${n.note}` });
  }
  if (tracks.includes("ATTENDANCE")) {
    for (const a of d.attendance) items.push({ date: a.att_date, order: "", track: tx("الحضور"), text: tx(ATTENDANCE_LABEL[a.status as AttendanceStatus]) });
  }
  if (tracks.includes("LESSON") && student) {
    for (const l of attendedLessons(student, d.attendance, d.lessons, circleOn)) items.push({ date: l.lesson_date, order: "~", track: tx("الدرس"), text: l.title });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order));
}

function buildWhatsApp(locale: Locale, rows: Row[], tracks: { id: TrackKey; label: string }[], scope: string, period: string): string {
  const tx = (source: string, values?: readonly (string | number | null | undefined)[]) => staffText(locale, source, values);
  // Per student: "- name" then one "label: value" line per recorded track, e.g.
  //   - أحمد
  //   الحفظ: الحشر 10–16 (جيد جدًا)
  //   الحضور: حاضر
  //   الدرس: أحكام الوضوء
  let out = tx("📖 تقرير حلقات القرآن — {0}\n👥 {1}\n👤 الطلاب: {2}\n", [period, scope, rows.length]);
  for (const [i, r] of rows.entries()) {
    out += `\n${i ? "\n" : ""}- ${r.student.name}`;
    for (const t of tracks) {
      const c = r.cells[t.id];
      if (c && !c.empty) out += `\n${t.label}: ${c.text}`;
    }
    if (tracks.every((t) => r.cells[t.id]?.empty ?? true)) out += tx(": لم يُسجَّل");
  }
  return out;
}

// At-a-glance percentages for the selected scope/period, shown above the detailed table.
function SummaryRings({ data, studentCount }: { data: ReportData; studentCount: number }) {
  const { tx } = useI18n();
  const attended = data.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const reciters = new Set(data.quran.map((e) => e.student_id)).size;
  const graded = data.quran.filter((e) => e.quality);
  const strong = graded.filter((e) => e.quality === "ممتاز" || e.quality === "جيد جدًا").length;
  return (
    <div className="rings">
      <ProgressRing label={tx("نسبة الحضور")} value={attended} total={data.attendance.length} />
      <ProgressRing label={tx("طلاب سمّعوا")} value={reciters} total={studentCount} color="var(--blue)" />
      <ProgressRing label={tx("ممتاز / جيد جدًا")} value={strong} total={graded.length} color="var(--gold)" />
    </div>
  );
}
