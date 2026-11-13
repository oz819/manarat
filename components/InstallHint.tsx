"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "installHintDismissed";
const VISITS_KEY = "installHintVisits";
// Shown once, on the third time the app is opened — not on every visit.
const SHOW_ON_VISIT = 3;

// Counts this visit and decides, once per page load (effects may run twice in development).
let due: boolean | null = null;
function dueThisLoad(): boolean {
  if (due !== null) return due;
  due = false;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return due;
    const visits = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
    localStorage.setItem(VISITS_KEY, String(visits));
    if (visits >= SHOW_ON_VISIT) {
      // Seen once is enough: it won't come back on the next visit even if it wasn't closed.
      localStorage.setItem(DISMISS_KEY, "1");
      due = true;
    }
  } catch {}
  return due;
}

// Installing the app to the home screen keeps it working offline and iOS far less likely to evict its
// stored data (spec §6.3). Suggested once, after a few visits — never on every visit.
export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(!standalone && dueThisLoad());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <div className="notice install-hint">
      <b>📲 ثبّت التطبيق على الشاشة الرئيسية</b> ليعمل بدون إنترنت وتبقى بياناتك محفوظة على الجهاز.
      <div className="small" style={{ marginTop: 6 }}>
        {ios ? (
          <>في Safari: اضغط زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية».</>
        ) : deferred ? (
          <button
            onClick={async () => {
              await deferred.prompt();
              setDeferred(null);
              dismiss();
            }}
          >
            تثبيت الآن
          </button>
        ) : (
          <>من قائمة المتصفح ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</>
        )}
        <button className="link" onClick={dismiss} style={{ marginInlineStart: 10 }}>
          لاحقًا
        </button>
      </div>
    </div>
  );
}
