"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";

type Report = {
  id: string;
  scope_label: string;
  kind: string;
  period_from: string;
  period_to: string;
  body: string;
  sent_by_name: string | null;
  created_at: string;
  read_at: string | null;
};

// التقارير الواردة (ملاحظة 5): the halaqa reports teachers send with «إرسال للإدارة». Newest first;
// unread ones stand out, and opening one marks it read.
export default function ReportsInbox() {
  const { tx, locale } = useI18n();
  const { supabase, profile } = useApp();
  const [list, setList] = useState<Report[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("circle_reports")
      .select("id, scope_label, kind, period_from, period_to, body, sent_by_name, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return setError(navigator.onLine ? error.message : "عرض التقارير الواردة يحتاج اتصالًا بالإنترنت");
    setError("");
    setList(data as Report[]);
  }, [supabase]);

  useEffect(() => {
    let stale = false;
    (async () => {
      const { data, error } = await supabase
        .from("circle_reports")
        .select("id, scope_label, kind, period_from, period_to, body, sent_by_name, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (stale) return;
      if (error) return setError(navigator.onLine ? error.message : "عرض التقارير الواردة يحتاج اتصالًا بالإنترنت");
      setList(data as Report[]);
    })();
    return () => {
      stale = true;
    };
  }, [supabase]);

  async function open(r: Report) {
    setOpenId(openId === r.id ? null : r.id);
    if (r.read_at) return;
    await supabase.from("circle_reports").update({ read_at: new Date().toISOString(), read_by: profile.id }).eq("id", r.id);
    setList((l) => l?.map((x) => (x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
  }

  const unread = list?.filter((r) => !r.read_at).length ?? 0;
  const period = (r: Report) => (r.period_from === r.period_to ? r.period_from : `${r.period_from} ← ${r.period_to}`);

  return (
    <div className="card">
      <div className="title">
        <h3>{tx("التقارير الواردة")} {unread > 0 && <span className="badge warn">{unread}  {tx("جديد")}</span>}</h3>
        <button className="link" onClick={load}>
          {tx("تحديث")}</button>
      </div>
      <p className="muted small">{tx("تقارير الحلقات التي أرسلها المعلّمون من شاشة «التقارير».")}</p>
      {error && <p className="error-text">{tx(error)}</p>}
      {list === null && !error ? (
        <p className="muted">{tx("جارٍ التحميل…")}</p>
      ) : list && list.length === 0 ? (
        <p className="muted">{tx("لم يصل أي تقرير بعد.")}</p>
      ) : (
        <ul className="inbox">
          {list?.map((r) => (
            <li key={r.id} className={r.read_at ? "" : "unread"}>
              <button type="button" className="inbox-row" onClick={() => open(r)} aria-expanded={openId === r.id}>
                <b>{r.scope_label}</b>
                <span className="muted small">
                  {period(r)} · {r.sent_by_name ?? tx("معلّم")} · {new Date(r.created_at).toLocaleString(locale === "ar" ? "ar-SY" : "en-GB", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </button>
              {openId === r.id && <pre className="inbox-body">{r.body}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
