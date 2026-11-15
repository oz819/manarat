"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { rankingSettings } from "@/lib/rankingSettings";
import { WEEK_DAYS, type RankingSettings } from "@/lib/ranking";
import { QUALITIES } from "@/lib/types";

// What each grade is worth, the first day of the week and when the course started.
// Admins edit; teachers see the values in use.
export default function SettingsForm({ settings }: { settings: RankingSettings }) {
  const { tx } = useI18n();
  const { supabase, profile, showToast } = useApp();
  const admin = profile.role === "ADMIN";
  const [draft, setDraft] = useState<RankingSettings | null>(null);
  const [error, setError] = useState("");
  const v = draft ?? settings;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    for (const q of QUALITIES) {
      const n = Number(v.grades[q]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return setError(tx("قيمة «{0}» يجب أن تكون بين 0 و100", [q]));
    }
    if (!Number.isInteger(Number(v.passMark)) || v.passMark < 1 || v.passMark > 100) return setError(tx("علامة النجاح يجب أن تكون بين 1 و100"));
    const err = await rankingSettings.save(supabase, v);
    if (err) return setError(err);
    setError("");
    setDraft(null);
    showToast(tx("تم حفظ الإعدادات"));
  }

  return (
    <form className="card" onSubmit={save}>
      <h3>{tx("⚙️ إعدادات الترتيب")}</h3>
      {!admin && <p className="muted">{tx("هذه الإعدادات يعدّلها المدير.")}</p>}
      <h4>{tx("قيمة كل تقدير من 100")}</h4>
      <div className="formgrid compact">
        {QUALITIES.map((q) => (
          <div key={q}>
            <label>{tx(q)}</label>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              disabled={!admin}
              value={v.grades[q] ?? ""}
              onChange={(e) => setDraft({ ...v, grades: { ...v.grades, [q]: e.target.value === "" ? NaN : Number(e.target.value) } })}
            />
          </div>
        ))}
      </div>
      <h4>{tx("الاختبارات")}</h4>
      <div className="formgrid compact">
        <div>
          <label>{tx("علامة النجاح بالاختبار (من 100)")}</label>
          <input
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            disabled={!admin}
            value={Number.isFinite(v.passMark) ? v.passMark : ""}
            onChange={(e) => setDraft({ ...v, passMark: e.target.value === "" ? NaN : Number(e.target.value) })}
            aria-label={tx("علامة النجاح")}
          />
        </div>
      </div>
      <h4>{tx("الأسبوع والدورة")}</h4>
      <div className="formgrid compact">
        <div>
          <label>{tx("أول يوم في الأسبوع")}</label>
          <select disabled={!admin} value={v.weekStart} onChange={(e) => setDraft({ ...v, weekStart: Number(e.target.value) })}>
            {[6, 0, 1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {tx(WEEK_DAYS[d])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>{tx("بداية الدورة")}</label>
          <input
            type="date"
            disabled={!admin}
            value={v.courseStart ?? ""}
            onChange={(e) => setDraft({ ...v, courseStart: e.target.value || null })}
          />
        </div>
      </div>
      {admin && (
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="submit" disabled={!draft}>
            {tx("حفظ الإعدادات")}</button>
          {draft && (
            <button type="button" className="secondary" onClick={() => setDraft(null)}>
              {tx("تراجع")}</button>
          )}
        </div>
      )}
      {error && <p className="error-text">{tx(error)}</p>}
    </form>
  );
}
