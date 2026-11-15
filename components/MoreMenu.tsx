"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useRef, useState } from "react";

// «⋯ المزيد»: the screen's less-used commands, so each screen keeps a single prominent button.
export default function MoreMenu({ items, label = "المزيد" }: { items: { label: string; onClick: () => void }[]; label?: string }) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="more" ref={ref}>
      <button type="button" className="link more-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯ {tx(label)}
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="account-link"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {tx(it.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
