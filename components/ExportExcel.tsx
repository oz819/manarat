"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { useStore } from "@/lib/offline/store";
import { SECTION_LABEL, type Section } from "@/lib/filter";
import { EXAM_KIND_LABEL, examTitle } from "@/lib/exams";
import { xlsxBlob, type Sheet } from "@/lib/xlsx";
import { ATTENDANCE_LABEL, TRACK_LABEL, todayStr, type AttendanceStatus, type ExamKind, type QuranTrack } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type TableName = keyof Database["public"]["Tables"];

// تصدير Excel (admin): one .xlsx with the students, the Quran reports, attendance and exams of a
// period, read straight from the server (the whole history, not just this device's copy).
export default function ExportExcel() {
  const { tx, locale } = useI18n();
  const s = useStore();
  const { supabase, mushaf } = useApp();
  const today = todayStr();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Every row of a query, 1000 at a time (the server's page size).
  async function all<T>(table: TableName, build: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await build(base(table)).range(i, i + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return out;
    }
  }
  function base(table: TableName) {
    return supabase.from(table).select("*");
  }

  async function run() {
    setError("");
    if (!from || !to || from > to) return setError(tx("اختر فترة صحيحة"));
    if (!navigator.onLine) return setError(tx("التصدير يحتاج اتصالًا بالإنترنت"));
    setBusy(true);
    try {
      type R = Record<string, unknown>;
      const [students, quran, att, exams] = await Promise.all([
        all<R>("students", (q) => q.is("deleted_at", null).order("name").order("id")),
        all<R>("quran_entries", (q) => q.is("deleted_at", null).gte("entry_date", from).lte("entry_date", to).order("entry_date").order("id")),
        all<R>("attendance", (q) => q.is("deleted_at", null).gte("att_date", from).lte("att_date", to).order("att_date").order("student_id")),
        all<R>("exams", (q) => q.is("deleted_at", null).gte("exam_date", from).lte("exam_date", to).order("exam_date").order("id")),
      ]);
      const stu = new Map(students.map((x) => [x.id as string, x]));
      const name = (id: unknown) => (stu.get(id as string)?.name as string) ?? "—";
      const circleOf = (studentId: unknown) => s.get("circles", (stu.get(studentId as string)?.circle_id as string) ?? "");
      const circle = (studentId: unknown) => circleOf(studentId)?.name ?? "";
      const teacher = (id: unknown) => (id ? (s.get("profiles", id as string)?.name ?? "") : "");
      const pos = (sno: unknown, ayah: unknown) => (sno ? `${mushaf.name(sno as number)} ${ayah ?? ""}`.trim() : "");

      const sheets: Sheet[] = [
        {
          name: tx("الطلاب"),
          rows: [
            [tx("الطالب"), tx("الحلقة"), tx("القسم"), tx("الحالة"), tx("ولي الأمر"), tx("رقم ولي الأمر"), tx("تاريخ الإضافة")],
            ...students
              .sort((a, b) => circle(a.id).localeCompare(circle(b.id), "ar") || String(a.name).localeCompare(String(b.name), "ar"))
              .map((x) => {
                const c = circleOf(x.id);
                return [
                  x.name as string,
                  c?.name ?? "",
                  c?.section ? tx(SECTION_LABEL[c.section as Section]) : "",
                  x.active ? tx("نشط") : tx("مؤرشف"),
                  (x.guardian_name as string) ?? "",
                  x.guardian_phone ? `+${x.guardian_phone}` : "",
                  String(x.created_at).slice(0, 10),
                ];
              }),
          ],
        },
        {
          name: tx("التقارير"),
          rows: [
            [tx("التاريخ"), tx("الطالب"), tx("الحلقة"), tx("النوع"), tx("من"), tx("إلى"), tx("التقدير"), tx("ملاحظات"), tx("المحفّظ")],
            ...quran.map((e) => [
              e.entry_date as string,
              name(e.student_id),
              circle(e.student_id),
              tx(TRACK_LABEL[e.track as QuranTrack] ?? (e.track as string)),
              pos(e.from_surah_no, e.from_ayah),
              pos(e.to_surah_no, e.to_ayah),
              tx((e.quality as string) ?? ""),
              (e.notes as string) ?? "",
              teacher(e.teacher_id),
            ]),
          ],
        },
        {
          name: tx("الحضور"),
          rows: [
            [tx("التاريخ"), tx("الطالب"), tx("الحلقة"), tx("الحالة"), tx("المحفّظ")],
            ...att.map((a) => [
              a.att_date as string,
              name(a.student_id),
              circle(a.student_id),
              tx(ATTENDANCE_LABEL[a.status as AttendanceStatus] ?? (a.status as string)),
              teacher(a.teacher_id),
            ]),
          ],
        },
        {
          name: tx("الاختبارات"),
          rows: [
            [tx("التاريخ"), tx("الطالب"), tx("الحلقة"), tx("النوع"), tx("الاختبار"), tx("العلامة"), tx("النتيجة"), tx("المختبِر"), tx("ملاحظات")],
            ...exams.map((x) => [
              x.exam_date as string,
              name(x.student_id),
              circle(x.student_id),
              tx(EXAM_KIND_LABEL[x.kind as ExamKind] ?? (x.kind as string)),
              examTitle({ kind: x.kind as string, juz_no: x.juz_no as number | null, surah_no: x.surah_no as number | null }, mushaf, locale),
              x.score as number,
              x.passed ? tx("ناجح") : tx("لم ينجح"),
              (x.examiner as string) ?? "",
              (x.notes as string) ?? "",
            ]),
          ],
        },
      ];
      const url = URL.createObjectURL(xlsxBlob(sheets.map(sheet => ({ ...sheet, rtl: locale === "ar" }))));
      const a = document.createElement("a");
      a.href = url;
      a.download = tx("حلقات-القرآن-{0}-إلى-{1}.xlsx", [from, to]);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(tx("تعذّر التصدير: {0}", [(e as Error).message]));
    }
    setBusy(false);
  }

  return (
    <div className="card export-excel">
      <h3>{tx("📤 تصدير Excel")}</h3>
      <p className="small muted">{tx("ملف Excel بصيغة ‎.xlsx فيه جميع الطلاب، وتقارير القرآن والحضور والاختبارات للفترة التي تختارها. يحتاج اتصالًا بالإنترنت ويصدّر البيانات المحفوظة في الحساب؛ انتظر «تم الحفظ ✓» أولًا.")}</p>
      <div className="export-row">
        <label>
          {tx("من")}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {tx("إلى")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={run} disabled={busy}>
          {busy ? tx("جارٍ التجهيز...") : tx("⬇️ تنزيل الملف")}
        </button>
      </div>
      {error && <p className="error-text">{tx(error)}</p>}
    </div>
  );
}
