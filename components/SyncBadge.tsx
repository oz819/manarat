"use client";

import { staffText, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { store, useStore } from "@/lib/offline/store";

function timeAgo(locale: Locale, iso: string | null): string {
  const tx = (source: string, values?: readonly (string | number | null | undefined)[]) => staffText(locale, source, values);
  if (!iso) return tx("لم يتم بعد");
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return tx("الآن");
  if (mins < 60) return tx("قبل {0} دقيقة", [mins]);
  const h = Math.round(mins / 60);
  return h < 24 ? tx("قبل {0} ساعة", [h]) : new Date(iso).toLocaleString(locale === "ar" ? "ar-SY" : "en-GB");
}

// Whether the work is saved. The words are about saving, never "sync" (users asked "sync… with what?"):
// saved ✓ / saving… / kept on this device until the connection is back. The mechanism (outbox) is unchanged.
export default function SyncBadge() {
  const { tx, locale } = useI18n();
  const s = useStore();
  const [open, setOpen] = useState(false);
  const st = s.status;

  let cls = "ok";
  let text = tx("تم الحفظ ✓");
  if (st.failed) {
    cls = "bad";
    text = tx("⚠ لم يُحفظ {0}", [st.failed]);
  } else if (st.authProblem) {
    cls = "warn";
    text = tx("🔒 محفوظ على الجهاز، سجّل الدخول ليُحفظ في الحساب");
  } else if (st.pending) {
    cls = "warn";
    text = st.online ? tx("جارٍ الحفظ…") : tx("محفوظ على الجهاز، سيُحفظ في الحساب عند الاتصال");
  } else if (!st.online) {
    cls = "off";
    text = tx("تم الحفظ ✓ · بلا اتصال");
  } else if (st.syncing) {
    text = tx("جارٍ الحفظ…");
  }

  return (
    <>
      <button className={`sync-badge ${cls}`} onClick={() => setOpen((o) => !o)}>
        {text}
      </button>
      {open && (
        <div className="sync-panel" role="dialog">
          <div className="title">
            <b>{tx("حالة الحفظ")}</b>
            <button className="link" onClick={() => setOpen(false)}>
              {tx("إغلاق")}</button>
          </div>
          <p className="small muted">
            {st.online ? tx("متصل بالإنترنت.") : tx("بلا اتصال: التعديلات محفوظة على الجهاز، وتُحفظ في حساب المركز تلقائيًا عند عودة الاتصال.")}
            <br />
            {tx("آخر حفظ في الحساب:")} {timeAgo(locale, st.lastSyncAt)}
          </p>
          {st.authProblem && (
            <p className="notice small">{tx("انتهت جلسة الدخول. سجّل الدخول من جديد وتُحفظ التعديلات في الحساب تلقائيًا.")}</p>
          )}
          {st.lastError && !st.failed && <p className="small error-text">{st.lastError}</p>}
          <button className="secondary" onClick={() => store.sync()} disabled={st.syncing || !st.online} style={{ width: "100%" }}>
            {st.syncing ? tx("جارٍ الحفظ…") : tx("حفظ الآن")}
          </button>
          {s.outboxItems().length > 0 && (
            <ul className="outbox">
              {s.outboxItems().map((o) => (
                <li key={o.seq} className={o.status}>
                  <div>
                    <b>{tx(o.label)}</b>
                    <div className="small muted">{new Date(o.createdAt).toLocaleString(locale === "ar" ? "ar-SY" : "en-GB")}</div>
                    {o.error && <div className="small error-text">{tx("السبب:")} {o.error}</div>}
                  </div>
                  {o.status === "failed" && (
                    <div className="row-actions">
                      <button className="link" onClick={() => store.retry(o.seq!)}>
                        {tx("إعادة المحاولة")}</button>
                      <button
                        className="link danger-link"
                        onClick={() => confirm(tx("تجاهل هذا التغيير واستعادة نسخة الخادم؟")) && store.discard(o.seq!)}
                      >
                        {tx("تجاهل")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
