"use client";

import { useState } from "react";
import { store, useStore } from "@/lib/offline/store";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم يتم بعد";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const h = Math.round(mins / 60);
  return h < 24 ? `قبل ${h} ساعة` : new Date(iso).toLocaleString("ar");
}

// Whether the work is saved. The words are about saving, never "sync" (users asked "sync… with what?"):
// saved ✓ / saving… / kept on this device until the connection is back. The mechanism (outbox) is unchanged.
export default function SyncBadge() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const st = s.status;

  let cls = "ok";
  let text = "تم الحفظ ✓";
  if (st.failed) {
    cls = "bad";
    text = `⚠ لم يُحفظ ${st.failed}`;
  } else if (st.authProblem) {
    cls = "warn";
    text = "🔒 محفوظ على الجهاز، سجّل الدخول ليُحفظ في الحساب";
  } else if (st.pending) {
    cls = "warn";
    text = st.online ? "جارٍ الحفظ…" : "محفوظ على الجهاز، سيُحفظ في الحساب عند الاتصال";
  } else if (!st.online) {
    cls = "off";
    text = "تم الحفظ ✓ · بلا اتصال";
  } else if (st.syncing) {
    text = "جارٍ الحفظ…";
  }

  return (
    <>
      <button className={`sync-badge ${cls}`} onClick={() => setOpen((o) => !o)}>
        {text}
      </button>
      {open && (
        <div className="sync-panel" role="dialog">
          <div className="title">
            <b>حالة الحفظ</b>
            <button className="link" onClick={() => setOpen(false)}>
              إغلاق
            </button>
          </div>
          <p className="small muted">
            {st.online ? "متصل بالإنترنت." : "بلا اتصال: التعديلات محفوظة على الجهاز، وتُحفظ في حساب المركز تلقائيًا عند عودة الاتصال."}
            <br />
            آخر حفظ في الحساب: {timeAgo(st.lastSyncAt)}
          </p>
          {st.authProblem && (
            <p className="notice small">انتهت جلسة الدخول. سجّل الدخول من جديد وتُحفظ التعديلات في الحساب تلقائيًا.</p>
          )}
          {st.lastError && !st.failed && <p className="small error-text">{st.lastError}</p>}
          <button className="secondary" onClick={() => store.sync()} disabled={st.syncing || !st.online} style={{ width: "100%" }}>
            {st.syncing ? "جارٍ الحفظ…" : "حفظ الآن"}
          </button>
          {s.outboxItems().length > 0 && (
            <ul className="outbox">
              {s.outboxItems().map((o) => (
                <li key={o.seq} className={o.status}>
                  <div>
                    <b>{o.label}</b>
                    <div className="small muted">{new Date(o.createdAt).toLocaleString("ar")}</div>
                    {o.error && <div className="small error-text">السبب: {o.error}</div>}
                  </div>
                  {o.status === "failed" && (
                    <div className="row-actions">
                      <button className="link" onClick={() => store.retry(o.seq!)}>
                        إعادة المحاولة
                      </button>
                      <button
                        className="link danger-link"
                        onClick={() => confirm("تجاهل هذا التغيير واستعادة نسخة الخادم؟") && store.discard(o.seq!)}
                      >
                        تجاهل
                      </button>
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
