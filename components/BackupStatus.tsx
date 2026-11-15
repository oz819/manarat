"use client";

import { staffText, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useState } from "react";

// 💾 النسخة الاحتياطية (admin dashboard): the nightly backup's last runs, read from GitHub's public
// API (the repository is public, no key needed). Warns when a day passes without a good copy.
// The copies themselves are encrypted files on the run's page («Artifacts»).

const RUNS = "https://api.github.com/repos/oz819/telawah/actions/workflows/db-backup.yml/runs?branch=main&per_page=10";
const STALE_HOURS = 30;

type Run = { status: string; conclusion: string | null; created_at: string; html_url: string };

export default function BackupStatus() {
  const { tx, locale } = useI18n();
  const [runs, setRuns] = useState<{ list: Run[]; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    fetch(RUNS, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { workflow_runs?: Run[] }) => !cancelled && setRuns({ list: d.workflow_runs ?? [], at: Date.now() }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="card backup-card">
        <h3>{tx("💾 النسخة الاحتياطية")}</h3>
        <p className="muted">{tx("تعذّر الوصول إلى GitHub الآن لمعرفة حالة النسخ.")}</p>
      </div>
    );
  }
  if (!runs) return null;

  const latest = runs.list[0];
  const good = runs.list.find((r) => r.status === "completed" && r.conclusion === "success");
  const hours = good ? (runs.at - new Date(good.created_at).getTime()) / 3600000 : Infinity;
  const ok = hours <= STALE_HOURS;
  const latestFailed = latest?.status === "completed" && latest.conclusion !== "success";

  return (
    <div className={`card backup-card ${ok ? "" : "warn-card"}`}>
      <h3>
        {tx("💾 النسخة الاحتياطية")} <span className={`badge ${ok ? "excellent" : "redo"}`}>{ok ? tx("✓ تعمل") : tx("⚠️ تحتاج انتباه")}</span>
      </h3>
      {good ? (
        <p>
          {tx("آخر نسخة ناجحة:")} <b>{when(locale, good.created_at)}</b>{" "}
          <a href={good.html_url} target="_blank" rel="noreferrer">
            {tx("تنزيلها")}</a>
        </p>
      ) : (
        <p>{tx("لا توجد نسخة ناجحة بعد.")}</p>
      )}
      {latestFailed && latest && (
        <p className="error-text">
          {tx("آخر محاولة فشلت (")}{when(locale, latest.created_at)}).{" "}
          <a href={latest.html_url} target="_blank" rel="noreferrer">
            {tx("التفاصيل")}</a>
        </p>
      )}
      {latest?.status !== "completed" && latest && <p className="muted">{tx("نسخة قيد التنفيذ الآن…")}</p>}
      <p className="small muted">{tx("تُؤخذ تلقائيًا كل ليلة الساعة 3:00 وتُحفظ مشفّرة 30 يومًا. للتنزيل افتح الرابط ثم «Artifacts» أسفل الصفحة.")}</p>
    </div>
  );
}

function when(locale: Locale, iso: string): string {
  const tx = (source: string, values?: readonly (string | number | null | undefined)[]) => staffText(locale, source, values);
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Damascus" };
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : "en-GB", { ...opts, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : "en-GB", { ...opts, hour: "numeric", minute: "2-digit" }).format(d);
  return tx("{0}، الساعة {1}", [day, time]);
}
