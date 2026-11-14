"use client";

import { useEffect, useRef, useState } from "react";

// «المظهر» in the app header: colours, font and text size. Per device (localStorage), applied as
// attributes on <html>. The default is «الكحلي الملكي» in Cairo; «مضايا» is the Madaya centre's own look
// (app/madaya.css); «ألوان المركز» is the platform look in the centre's chosen colours (app/theme.css).
// Each swatch shows what the theme looks like: its main colour on its light page background.

export const UI_THEMES = [
  { id: "navy", label: "الكحلي الملكي (الافتراضي)", swatch: "linear-gradient(135deg,#1e3a8a 50%,#f0f5ff 50%)" },
  { id: "madaya", label: "مضايا", swatch: "linear-gradient(135deg,#0d3b33 50%,#f3f6f2 50%)" },
  { id: "center", label: "ألوان المركز", swatch: "#1b2550" },
  { id: "gold", label: "الذهبي الدافئ", swatch: "linear-gradient(135deg,#b45309 50%,#fffbeb 50%)" },
] as const;
export const UI_FONTS = [
  { id: "cairo", label: "Cairo (الافتراضي)", css: "var(--font-cairo)" },
  { id: "plex", label: "Tahoma", css: "Tahoma" },
  { id: "ibm", label: "IBM Plex", css: "var(--font-body)" },
  { id: "tajawal", label: "Tajawal", css: "var(--font-tajawal)" },
  { id: "amiri", label: "Amiri", css: "var(--font-amiri-ui)" },
] as const;
export const UI_SIZES = [
  { id: "sm", label: "صغير" },
  { id: "md", label: "متوسط" },
  { id: "lg", label: "كبير" },
] as const;

type Prefs = { theme: string; font: string; size: string };
const KEY = "manarat:appearance";
const DEFAULTS: Prefs = { theme: "navy", font: "cairo", size: "md" };

function read(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return {
      theme: UI_THEMES.some((t) => t.id === v.theme) ? v.theme! : DEFAULTS.theme,
      font: UI_FONTS.some((f) => f.id === v.font) ? v.font! : DEFAULTS.font,
      size: UI_SIZES.some((z) => z.id === v.size) ? v.size! : DEFAULTS.size,
    };
  } catch {
    return DEFAULTS;
  }
}

function apply(p: Prefs) {
  const root = document.documentElement;
  if (p.theme === "center") {
    delete root.dataset.uiTheme;
    delete root.dataset.theme; // back to the device's light/dark setting
  } else {
    root.dataset.uiTheme = p.theme;
    root.dataset.theme = "light"; // the other themes are light-only, even on a dark-mode device
  }
  if (p.font === "plex") delete root.dataset.font;
  else root.dataset.font = p.font;
  if (p.size === "md") delete root.dataset.fs;
  else root.dataset.fs = p.size;
}

/** Clears the attributes when the app unmounts (the public pages keep their own look). */
function clear() {
  const root = document.documentElement;
  delete root.dataset.uiTheme;
  delete root.dataset.theme;
  delete root.dataset.font;
  delete root.dataset.fs;
}

export default function Appearance() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = read();
    setPrefs(p);
    apply(p);
    return clear;
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function set(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="appearance" ref={box}>
      <button type="button" className="secondary appearance-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        🎨 المظهر
      </button>
      {open && (
        <div className="appearance-pop" role="dialog" aria-label="المظهر">
          <div className="ap-title">الألوان</div>
          <div className="ap-swatches">
            {UI_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ap-swatch${prefs.theme === t.id ? " on" : ""}`}
                style={{ background: t.swatch }}
                title={t.label}
                aria-label={t.label}
                aria-pressed={prefs.theme === t.id}
                onClick={() => set({ theme: t.id })}
              />
            ))}
          </div>

          <div className="ap-title">الخط</div>
          <div className="ap-row">
            {UI_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`ap-chip${prefs.font === f.id ? " on" : ""}`}
                style={{ fontFamily: `${f.css}, sans-serif` }}
                aria-pressed={prefs.font === f.id}
                onClick={() => set({ font: f.id })}
              >
                بسم الله
                <small>{f.label}</small>
              </button>
            ))}
          </div>

          <div className="ap-title">حجم الخط</div>
          <div className="ap-row">
            {UI_SIZES.map((z) => (
              <button
                key={z.id}
                type="button"
                className={`ap-chip size-${z.id}${prefs.size === z.id ? " on" : ""}`}
                aria-pressed={prefs.size === z.id}
                onClick={() => set({ size: z.id })}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
