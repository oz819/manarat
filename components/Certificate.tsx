"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/offline/store";
import { juzTitle } from "@/lib/exams";
import type { Exam } from "@/lib/types";
import { AppContext } from "@/components/AppContext";

// شهادة إتمام جزء: an A4 landscape certificate for a passed juz' exam, printed (or saved as PDF)
// straight from the browser. Only the certificate is printed: the app is hidden meanwhile.
export default function Certificate({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const { tx, locale } = useI18n();
  const s = useStore();
  const center = useContext(AppContext)?.center;
  const student = s.get("students", exam.student_id);
  const female = s.get("circles", student?.circle_id ?? "")?.section === "FEMALE";
  const g = (m: string, f: string) => (female ? f : m);

  useEffect(() => {
    const done = () => document.body.classList.remove("printing-cert");
    window.addEventListener("afterprint", done);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      done();
      window.removeEventListener("afterprint", done);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  function print() {
    document.body.classList.add("printing-cert");
    window.print();
  }

  const [y, m, d] = exam.exam_date.split("-").map(Number);
  const when = new Date(y, m - 1, d);
  const hijri = fmt(locale === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-GB-u-ca-islamic-umalqura", when);
  const greg = fmt(locale === "ar" ? "ar-SY" : "en-GB", when);

  return createPortal(
    <div className="cert-overlay" role="dialog" aria-label={tx("شهادة إتمام جزء")}>
      <div className="cert-actions no-print-cert">
        <button onClick={print}>{tx("🖨️ طباعة / حفظ PDF")}</button>
        <button className="secondary" onClick={onClose}>
          {tx("إغلاق")}</button>
      </div>
      <div className="cert-scroll">
        <div className="cert-sheet" dir={locale === "ar" ? "rtl" : "ltr"}>
          <div className="cert-frame">
            <span className="cert-corner tl" aria-hidden />
            <span className="cert-corner tr" aria-hidden />
            <span className="cert-corner bl" aria-hidden />
            <span className="cert-corner br" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {center?.logo_url && <img className="cert-logo" src={center.logo_url} alt="" />}
            {center?.name && <div className="cert-center">{center.name}</div>}
            <div className="cert-basmala" dir="rtl" lang="ar">بسم الله الرحمن الرحيم</div>
            <h1 className="cert-title">{tx("شهادة إتمام حفظ")}</h1>
            <p className="cert-text">
              {tx("يشهد المركز بأنّ")} {g(tx("الطالب"), tx("الطالبة"))}
            </p>
            <div className="cert-name">{student?.name ?? "—"}</div>
            <p className="cert-text">
              {g(tx("قد أتمّ"), tx("قد أتمّت"))}  {locale === "ar" ? "حفظ" : "memorizing"} <b>{locale === "ar" ? juzTitle(exam.juz_no ?? 0) : `Juz ${exam.juz_no}`}</b>  {tx("من القرآن الكريم،")}<br />
              {g(tx("واجتاز"), tx("واجتازت"))}  {tx("الاختبار فيه بعلامة")} <b>{Number(exam.score)}</b>  {tx("من 100.")}</p>
            <p className="cert-dua">{tx("نسأل الله أن")} {g(tx("يجعله"), tx("يجعلها"))}  {tx("من أهل القرآن الذين هم أهل الله وخاصّته")}</p>
            <div className="cert-date">
              <span>{hijri}</span>
              <span>{tx("الموافق")} {greg}  {tx("م")}</span>
            </div>
            <div className="cert-signs">
              <div>
                <span>{tx("المختبِر")}</span>
                <b>{exam.examiner ?? ""}</b>
                <i />
              </div>
              <div>
                <span>{tx("مدير المركز")}</span>
                <b>&nbsp;</b>
                <i />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function fmt(locale: string, d: Date): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}
