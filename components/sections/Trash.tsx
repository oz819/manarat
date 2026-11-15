"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store } from "@/lib/offline/store";

type Kind =
  | "profile"
  | "student"
  | "circle"
  | "arabic_book"
  | "quran_entry"
  | "arabic_entry"
  | "edu_note"
  | "talqeen_session";

type Item = { kind: Kind; id: string; label: string; detail: string; deleted_at: string; deleted_by_name: string | null };

const KIND_LABEL: Record<Kind, string> = {
  profile: "حساب",
  student: "طالب",
  circle: "حلقة",
  arabic_book: "كتاب عربية",
  quran_entry: "تسميع",
  arabic_entry: "درس عربية",
  edu_note: "ملاحظة تربوية",
  talqeen_session: "جلسة تلقين",
};

// What a permanent purge takes with it, shown in the second (red) confirmation.
const PURGE_WARNING: Record<Kind, string> = {
  profile: "الحساب سيُمسح نهائيًا. سجلات الطلاب التي سجّلها تبقى، لكن يُزال اسمه منها.",
  student: "الطالب سيُمسح نهائيًا مع كل سجلاته: التسميع والحضور والعربية والملاحظات.",
  circle: "الحلقة ستُمسح نهائيًا.",
  arabic_book: "الكتاب سيُمسح نهائيًا.",
  quran_entry: "هذا التسميع سيُمسح نهائيًا.",
  arabic_entry: "هذا الدرس سيُمسح نهائيًا.",
  edu_note: "هذه الملاحظة ستُمسح نهائيًا.",
  talqeen_session: "الجلسة ستُمسح نهائيًا مع إدخالات التلقين التابعة لها.",
};



// Admin-only trash (سجل المحذوفات): everything soft-deleted, with restore and permanent purge.
// Online only: it reads and writes the server directly, then nudges a sync so lists update.
export default function Trash() {
  const { tx, date } = useI18n();
  const { supabase, showToast } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data, error } = await supabase.rpc("admin_trash");
    if (error) {
      setError(/fetch|network/i.test(error.message) ? "سجل المحذوفات يحتاج اتصالًا بالإنترنت" : error.message);
      setItems((prev) => prev ?? []);
      return;
    }
    setItems((data ?? []) as Item[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(it: Item, action: "admin_restore" | "admin_purge", done: string) {
    setBusy(it.id);
    setError("");
    const { error } = await supabase.rpc(action, { p_kind: it.kind, p_id: it.id });
    setBusy(null);
    if (error) return setError(error.message);
    showToast(done);
    store.requestSync(0);
    await load();
  }

  async function restore(it: Item) {
    const ok = await confirmDialog({
      title: tx("استرجاع {0} «{1}»؟", [tx(KIND_LABEL[it.kind]), it.label]),
      body: tx("سيعود إلى مكانه في كل القوائم كما كان."),
      ok: tx("استرجاع"),
    });
    if (ok) await run(it, "admin_restore", tx("تم استرجاع «{0}»", [it.label]));
  }

  async function purge(it: Item) {
    const first = await confirmDialog({
      title: tx("مسح {0} «{1}» نهائيًا؟", [tx(KIND_LABEL[it.kind]), it.label]),
      body: tx("سيُحذف من قاعدة البيانات ولن يظهر في سجل المحذوفات بعد ذلك."),
      ok: tx("متابعة"),
      danger: true,
    });
    if (!first) return;
    const second = await confirmDialog({
      title: tx("⚠️ لا رجعة في هذه الخطوة"),
      body: tx("{0} لا يمكن لأحد استرجاعه بعدها. هل أنت متأكد تمامًا؟", [tx(PURGE_WARNING[it.kind])]),
      ok: tx("نعم، احذف نهائيًا"),
      danger: true,
    });
    if (second) await run(it, "admin_purge", tx("تم حذف «{0}» نهائيًا", [it.label]));
  }

  const kinds = items ? (Array.from(new Set(items.map((i) => i.kind))) as Kind[]) : [];
  const shown = (items ?? []).filter((i) => filter === "all" || i.kind === filter);

  return (
    <section>
      <div className="card">
        <div className="title">
          <h3>{tx("🗑️ سجل المحذوفات")}</h3>
          <button className="secondary" onClick={load}>
            {tx("تحديث")}</button>
        </div>
        <p className="small muted">
          {tx("كل ما يُحذف من التطبيق يبقى هنا حتى تسترجعه أو تمسحه نهائيًا. الحساب المحذوف لا يستطيع تسجيل الدخول ما دام هنا.")}</p>
        {items && items.length > 0 && (
          <div className="recent">
            <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
              {tx("الكل (")}{items.length})
            </button>
            {kinds.map((k) => (
              <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
                {tx(KIND_LABEL[k])} ({items.filter((i) => i.kind === k).length})
              </button>
            ))}
          </div>
        )}
        {error && <p className="error-text">{tx(error)}</p>}
        {!items ? (
          <p className="muted">{tx("جارٍ التحميل...")}</p>
        ) : !shown.length ? (
          <p className="muted center trash-empty">{tx("سجل المحذوفات فارغ 👌")}</p>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table className="trash-table">
              <thead>
                <tr>
                  <th>{tx("الاسم")}</th>
                  <th>{tx("النوع")}</th>
                  <th>{tx("حذفه")}</th>
                  <th>{tx("متى")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={`${it.kind}:${it.id}`}>
                    <td>
                      <b>{it.label}</b>
                      {it.detail && <div className="small muted">{it.detail}</div>}
                    </td>
                    <td>
                      <span className={`badge kind-${it.kind}`}>{tx(KIND_LABEL[it.kind])}</span>
                    </td>
                    <td>{it.deleted_by_name ?? <span className="muted">{tx("غير معروف")}</span>}</td>
                    <td className="small muted">{date(it.deleted_at, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="row-actions">
                      <button className="link" disabled={busy === it.id} onClick={() => restore(it)}>
                        {tx("استرجاع")}</button>
                      <button className="link danger-link" disabled={busy === it.id} onClick={() => purge(it)}>
                        {tx("مسح نهائي")}</button>
                    </td>
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
