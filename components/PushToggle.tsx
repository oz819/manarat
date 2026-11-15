"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/push";

// 🔔 in the header: turn this device's notifications on or off (Web Push, where supported).
export default function PushToggle() {
  const { tx } = useI18n();
  const { supabase, showToast } = useApp();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pushSupported()) return;
    currentSubscription().then((s) => setOn(!!s), () => setOn(false));
  }, []);
  if (on === null) return null;

  async function toggle() {
    if (on) {
      await disablePush(supabase);
      setOn(false);
      return showToast(tx("أُوقفت الإشعارات على هذا الجهاز"));
    }
    const err = await enablePush(supabase);
    if (err) return showToast(err);
    setOn(true);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    showToast(res?.ok ? tx("تم تفعيل الإشعارات — أرسلنا إشعارًا تجريبيًا") : tx("تم تفعيل الإشعارات"));
  }

  return (
    <button type="button" className="logout" onClick={toggle} title={on ? tx("إيقاف الإشعارات") : tx("تفعيل الإشعارات")} aria-pressed={on}>
      {on ? tx("🔔 مفعّلة") : tx("🔕 تفعيل")}
    </button>
  );
}
