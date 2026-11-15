"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SyncBadge from "@/components/SyncBadge";
import PushToggle from "@/components/PushToggle";
import { pushSupported } from "@/lib/push";
import type { MyContext } from "@/lib/center";
import type { Profile } from "@/lib/types";

// The app header's one account button. Everything about "me" is in its small menu: who I am, whether
// my work is saved, notifications, switching centre, the platform (for its admins) and signing out.
export default function AccountMenu({
  profile,
  ctx,
  onSwitch,
  onLogout,
}: {
  profile: Profile;
  ctx: MyContext;
  onSwitch: (centerId: string) => void;
  onLogout: () => void;
}) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const centers = ctx.centers.filter((c) => c.active);
  const role = profile.role === "ADMIN" ? (ctx.membership?.is_owner ? tx("صاحب المركز") : tx("مدير")) : tx("معلّم");

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
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        <span>{tx("حسابي")}</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <b>{profile.name}</b>
            <span className="muted small">{role}</span>
          </div>
          <div className="account-row">
            <span className="muted small">{tx("حالة الحفظ")}</span>
            <SyncBadge />
          </div>
          {pushSupported() && (
            <div className="account-row">
              <span className="muted small">{tx("الإشعارات على هذا الجهاز")}</span>
              <PushToggle />
            </div>
          )}
          {centers.length > 1 && (
            <label className="account-row">
              <span className="muted small">{tx("المركز")}</span>
              <select className="center-switch" value={ctx.center?.id} onChange={(e) => onSwitch(e.target.value)}>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ctx.is_platform_admin && (
            <Link href="/super" className="account-link" role="menuitem">
              {tx("لوحة المنصة")}</Link>
          )}
          <button type="button" className="account-link danger-link" role="menuitem" onClick={onLogout}>
            {tx("تسجيل الخروج")}</button>
        </div>
      )}
    </div>
  );
}
