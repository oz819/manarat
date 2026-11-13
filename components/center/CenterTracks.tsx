"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { ALL_TRACKS, type TrackKey } from "@/lib/tracks";

// مسارات المتابعة (ملاحظة 4): which follow-up tracks this centre uses. الحفظ always; the rest are off
// until switched on here. A track that is off disappears from the whole app and the parents' link;
// what was recorded in it stays in the database and comes back if it is switched on again.
export default function CenterTracks() {
  const { supabase, center, tracks, showToast, refreshCenter } = useApp();
  const [on, setOn] = useState<Set<TrackKey>>(() => new Set(tracks.list));
  const [label, setLabel] = useState(center.talqeen_label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    ALL_TRACKS.some((t) => on.has(t.key) !== tracks.has(t.key)) || (label.trim() || null) !== (center.talqeen_label ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = label.trim();
    if (name && (name.length < 2 || name.length > 30)) return setError("اسم التلقين من حرفين إلى 30 حرفًا");
    if (!navigator.onLine) return setError("حفظ الإعدادات يحتاج اتصالًا بالإنترنت");
    setBusy(true);
    const { error } = await supabase
      .from("centers")
      .update({ enabled_tracks: ALL_TRACKS.map((t) => t.key).filter((k) => k === "HIFZ" || on.has(k)), talqeen_label: name || null })
      .eq("id", center.id);
    setBusy(false);
    if (error) return setError(error.message);
    await refreshCenter();
    showToast("تم حفظ مسارات المتابعة");
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3>مسارات المتابعة</h3>
      <p className="muted small">اختر ما يتابعه مركزك. ما لا تختاره يختفي من التطبيق ومن رابط وليّ الأمر، ولا يُحذف شيء مما سُجّل فيه.</p>
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
              <b>{t.key === "TALQEEN" && label.trim() ? label.trim() : t.label}</b>
              <small className="muted">{t.hint}</small>
            </span>
          </label>
        ))}
      </div>
      {on.has("TALQEEN") && (
        <div className="field">
          <label htmlFor="ct-talqeen">اسم «التلقين» في مركزك (اختياري)</label>
          <input id="ct-talqeen" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="مثلًا: التسميع" />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="ob-actions">
        <span />
        <button type="submit" disabled={!dirty || busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ المسارات"}
        </button>
      </div>
    </form>
  );
}
