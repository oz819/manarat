"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { useApp, type AppCtx } from "@/components/AppContext";
import { ALL_TRACKS, type TrackKey } from "@/lib/tracks";

// Writes the centre's tracks and its name for التلقين, then reloads the centre so the whole app follows.
async function saveTracks(app: AppCtx, on: Set<TrackKey>, label: string): Promise<string> {
  const name = label.trim();
  if (name && (name.length < 2 || name.length > 30)) return "اسم التلقين من حرفين إلى 30 حرفًا";
  if (!navigator.onLine) return "حفظ الإعدادات يحتاج اتصالًا بالإنترنت";
  const { error } = await app.supabase
    .from("centers")
    .update({ enabled_tracks: ALL_TRACKS.map((t) => t.key).filter((k) => k === "HIFZ" || on.has(k)), talqeen_label: name || null })
    .eq("id", app.center.id);
  if (error) return error.message;
  await app.refreshCenter();
  return "";
}

// «قسم التلقين» in الإدارة: one switch for التلقين alone (the other tracks stay as they are) and the
// centre's own name for it. Switched off, it disappears from the app; nothing recorded in it is deleted.
export function TalqeenSetting() {
  const { tx } = useI18n();
  const app = useApp();
  const { center, tracks, showToast } = app;
  const [enabled, setEnabled] = useState(() => tracks.has("TALQEEN"));
  const [label, setLabel] = useState(center.talqeen_label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = enabled !== tracks.has("TALQEEN") || (enabled && (label.trim() || null) !== (center.talqeen_label ?? null));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const on = new Set(tracks.list);
    if (enabled) on.add("TALQEEN");
    else on.delete("TALQEEN");
    setBusy(true);
    // Switching off keeps the name the centre chose, for when it is switched on again.
    const msg = await saveTracks(app, on, enabled ? label : (center.talqeen_label ?? ""));
    setBusy(false);
    if (msg) return setError(msg);
    showToast(enabled ? tx("تم حفظ قسم {0}", [label.trim() || tx("التلقين")]) : tx("تم إيقاف قسم التلقين"));
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3>{tx("🎙️ قسم التلقين")}</h3>
      <label className="inline">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {enabled ? tx("مفعّل") : tx("غير مفعّل")}
      </label>
      {enabled && (
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="ts-talqeen">{tx("اسم القسم في مركزك (اختياري)")}</label>
          <input id="ts-talqeen" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder={tx("مثلًا: التسميع")} />
        </div>
      )}
      <p className="muted small">{tx("التلقين مفعّل افتراضيًا للمراكز الجديدة، واستخدامه اختياري. يمكنك تركه دون جلسات أو إيقافه هنا؛ عند إيقافه يختفي من التطبيق، ولا يُحذف شيء مما سُجّل فيه.")}</p>
      {error && <p className="error-text">{tx(error)}</p>}
      <div className="ob-actions">
        <span />
        <button type="submit" disabled={!dirty || busy}>
          {busy ? tx("جارٍ الحفظ…") : tx("حفظ")}
        </button>
      </div>
    </form>
  );
}

// مسارات المتابعة (ملاحظة 4): which follow-up tracks this centre uses. الحفظ always; the rest are off
// until switched on here. A track that is off disappears from the whole app and the parents' link;
// what was recorded in it stays in the database and comes back if it is switched on again.
export default function CenterTracks() {
  const { tx } = useI18n();
  const app = useApp();
  const { center, tracks, showToast } = app;
  const [on, setOn] = useState<Set<TrackKey>>(() => new Set(tracks.list));
  const [label, setLabel] = useState(center.talqeen_label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    ALL_TRACKS.some((t) => on.has(t.key) !== tracks.has(t.key)) || (label.trim() || null) !== (center.talqeen_label ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const msg = await saveTracks(app, on, label);
    setBusy(false);
    if (msg) return setError(msg);
    showToast(tx("تم حفظ مسارات المتابعة"));
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3>{tx("مسارات المتابعة")}</h3>
      <p className="muted small">{tx("اختر ما يتابعه مركزك. ما لا تختاره يختفي من التطبيق ومن رابط وليّ الأمر، ولا يُحذف شيء مما سُجّل فيه.")}</p>
      <div className="track-pick">
        {ALL_TRACKS.map((t) => (
          <label key={t.key} className={`track-opt${on.has(t.key) ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={t.key === "HIFZ" || on.has(t.key)}
              disabled={t.key === "HIFZ"}
              onChange={(ev) => {
                const next = new Set(on);
                if (ev.target.checked) next.add(t.key);
                else next.delete(t.key);
                setOn(next);
              }}
            />
            <span>
              <b>{t.key === "TALQEEN" && label.trim() ? label.trim() : tx(t.label)}</b>
              <small className="muted">{tx(t.hint)}</small>
            </span>
          </label>
        ))}
      </div>
      {on.has("TALQEEN") && (
        <div className="field">
          <label htmlFor="ct-talqeen">{tx("اسم «التلقين» في مركزك (اختياري)")}</label>
          <input id="ct-talqeen" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder={tx("مثلًا: التسميع")} />
        </div>
      )}
      {error && <p className="error-text">{tx(error)}</p>}
      <div className="ob-actions">
        <span />
        <button type="submit" disabled={!dirty || busy}>
          {busy ? tx("جارٍ الحفظ…") : tx("حفظ المسارات")}
        </button>
      </div>
    </form>
  );
}
