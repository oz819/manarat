"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Profile, Role } from "@/lib/types";
import { Mushaf } from "@/lib/quran";
import { SURAHS } from "@/lib/surahs";
import { store, useStore } from "@/lib/offline/store";
import { filterStore, teacherTitle } from "@/lib/filter";
import { getMeta, setMeta } from "@/lib/offline/idb";
import { ACCOUNT_DELETED_MESSAGE, ACCOUNT_DISABLED_MESSAGE, NOT_REGISTERED_MESSAGE } from "@/lib/messages";
import { AppContext } from "@/components/AppContext";
import Students from "@/components/sections/Students";
import Reports from "@/components/sections/Reports";
import Ranking from "@/components/sections/Ranking";
import Manage from "@/components/sections/Manage";
import Trash from "@/components/sections/Trash";
import Dashboard from "@/components/sections/Dashboard";
import AuditLog from "@/components/sections/AuditLog";
import ConfirmDialogHost from "@/components/ConfirmDialog";
import SyncBadge from "@/components/SyncBadge";
import SlidingIndicator from "@/components/SlidingIndicator";
import InstallHint from "@/components/InstallHint";
import FilterBar from "@/components/FilterBar";
import Toast, { useToast } from "@/components/Toast";
import { CenterMark } from "@/components/center/Geo";
import Appearance from "@/components/Appearance";
import { applyPalette, type MyContext } from "@/lib/center";
import { tracksOf } from "@/lib/tracks";

type Page = "students" | "talqeen" | "reports" | "ranking" | "dashboard" | "manage" | "trash" | "audit";

const NAV: { id: Page; label: string }[] = [
  { id: "students", label: "👨‍🎓 الطلاب" },
  { id: "reports", label: "📊 التقارير" },
  { id: "ranking", label: "⭐ المتفوقون" },
];

// Admins and the centre's owner only: the database keeps these out of a teacher's reach.
// «الإدارة» and the two logs come right after «المتفوقون»; «اللوحة» last.
const ADMIN_NAV: { id: Page; label: string }[] = [
  { id: "manage", label: "⚙️ الإدارة" },
  { id: "audit", label: "📜 سجل التعديلات" },
  { id: "trash", label: "🗑️ سجل المحذوفات" },
  { id: "dashboard", label: "📈 اللوحة" },
];
// «talqeen» stays a known page so old links and saved history don't break; its session form now
// lives in «الطلاب», so opening it lands there.
const PAGES = new Set<Page>(["students", "talqeen", "reports", "ranking", "dashboard", "manage", "trash", "audit"]);
const landing = (v: View): View => (v.page === "talqeen" ? { ...v, page: "students" } : v);

type CachedProfile = { userId: string; profile: Profile; centerId?: string; ctx?: MyContext };

const BLOCKED_MESSAGE: Record<NonNullable<MyContext["blocked"]>, string> = {
  NO_CENTER: NOT_REGISTERED_MESSAGE,
  SUSPENDED: "حساب المركز موقوف حاليًا. تواصلوا مع إدارة المنصة.",
  DELETED: ACCOUNT_DELETED_MESSAGE,
  DISABLED: ACCOUNT_DISABLED_MESSAGE,
};

// What's on screen. Each change is a browser history entry, so the phone's back button steps
// back inside the app (student card → list → previous tab) instead of leaving it.
type View = { page: Page; studentId: string | null };
const HOME: View = { page: "students", studentId: null };

export default function AppShell() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ctx, setCtx] = useState<MyContext | null>(null);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [view, setView] = useState<View>(HOME);
  const page = view.page;
  const { toast, showToast } = useToast();
  const s = useStore();

  useEffect(() => {
    let started = false;
    (async () => {
      // getSession() reads the locally stored session, so the app opens offline. When online we
      // also re-check the profile on the server (role/active may have changed).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (navigator.onLine) router.replace("/");
        else setBlockedMessage("أول تسجيل دخول يحتاج اتصالًا بالإنترنت.");
        return;
      }
      const userId = session.user.id;
      const cached = await getMeta<CachedProfile>("profile");
      const cachedP = cached?.userId === userId ? cached.profile : null;
      const cachedC = cached?.userId === userId ? (cached.ctx ?? null) : null;

      // Who I am in the centre I work in now (memberships). Returns false when the app can't open.
      const fromServer = async (): Promise<{ p: Profile; c: MyContext } | false | null> => {
        const { data, error } = await supabase.rpc("my_context");
        if (error || !data) return null;
        const c = data as unknown as MyContext;
        const m = c.membership;
        if (!c.center || !m) {
          // Just signed up for a new centre and hasn't created it yet: finish that first.
          if (c.blocked === "NO_CENTER" && !c.centers.length && session.user.user_metadata?.pending_center) {
            router.replace("/onboarding");
            return false;
          }
          if (c.is_platform_admin && c.blocked === "NO_CENTER") {
            router.replace("/super");
            return false;
          }
          setProfile(null);
          setBlockedMessage(BLOCKED_MESSAGE[c.blocked ?? "NO_CENTER"]);
          if (c.blocked !== "SUSPENDED") await supabase.auth.signOut({ scope: "local" });
          return false;
        }
        return { p: { id: userId, name: m.name, role: m.role as Role, active: m.active, default_filter: m.default_filter }, c };
      };

      const open = async (p: Profile, c: MyContext | null) => {
        // A different account or a different centre on this device: start from a clean local copy,
        // unless the previous one still has unsaved changes (those are kept and sent).
        if (cached && (cached.userId !== userId || (cached.centerId && cached.centerId !== c?.center?.id))) {
          await store.ensureLoaded();
          if (store.status.pending + store.status.failed === 0) await store.reset();
        }
        await setMeta("profile", { userId, profile: p, centerId: c?.center?.id, ctx: c ?? undefined } satisfies CachedProfile);
        applyPalette(c?.center);
        setCtx(c);
        setProfile(p);
        filterStore.init(supabase, userId, p.default_filter);
        await store.start(supabase, userId);
        started = true;
      };

      // ملاحظة 9: back on this device with the same account — open at once from the saved copy and check
      // with the server meanwhile, instead of making every opening wait for the network.
      if (cachedP && cachedC?.center) {
        await open(cachedP, cachedC);
        if (!navigator.onLine) return;
        const fresh = await fromServer();
        if (!fresh) {
          if (fresh === false) store.stop();
          return;
        }
        if (fresh.c.center!.id !== cachedC.center.id) {
          // The current centre changed on another device: reopen on the right one.
          if (store.status.pending + store.status.failed === 0) await store.reset();
          location.reload();
          return;
        }
        await setMeta("profile", { userId, profile: fresh.p, centerId: fresh.c.center!.id, ctx: fresh.c } satisfies CachedProfile);
        applyPalette(fresh.c.center);
        setCtx(fresh.c);
        setProfile(fresh.p);
        return;
      }

      let p: Profile | null = cachedP;
      let c: MyContext | null = cachedC;
      if (navigator.onLine) {
        const fresh = await fromServer();
        if (fresh === false) return;
        if (fresh) ({ p, c } = fresh);
      }
      if (!p) {
        setBlockedMessage("تعذّر التحقق من الحساب. اتصل بالإنترنت وأعد المحاولة.");
        return;
      }
      await open(p, c);
    })();
    return () => {
      if (started) store.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = (history.state as { view?: View } | null)?.view;
    if (current && PAGES.has(current.page)) setView(landing(current));
    else history.replaceState({ ...history.state, view: HOME }, "");
    const onPop = (e: PopStateEvent) => {
      const v = (e.state as { view?: View } | null)?.view;
      setView(v && PAGES.has(v.page) ? landing(v) : HOME);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function go(to: View) {
    const next = landing(to);
    if (next.page === view.page && next.studentId === view.studentId) return;
    setView(next);
    history.pushState({ view: next }, "");
  }
  const setPage = (p: Page) => go({ page: p, studentId: null });
  function openStudent(id: string) {
    go({ page: "students", studentId: id });
  }
  function closeStudent() {
    // Opened from the list: undo that history entry so back/forward stay in step.
    if ((history.state as { view?: View } | null)?.view?.studentId) history.back();
    else setView({ ...view, studentId: null });
  }

  // Deleted or disabled while the app is open: the next sync brings the change, then sign out.
  // Removed from the centre: my row leaves the centre's member list (or turns inactive).
  const own = profile ? s.get("profiles", profile.id) : undefined;
  const revoked = own ? !!own.deleted_at || !own.active : !!profile && s.all("profiles").length > 0;
  useEffect(() => {
    if (!revoked) return;
    setBlockedMessage(own?.deleted_at ? ACCOUNT_DELETED_MESSAGE : ACCOUNT_DISABLED_MESSAGE);
    setProfile(null);
    store.stop();
    supabase.auth.signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revoked]);

  const tracks = useMemo(() => tracksOf(ctx?.center), [ctx?.center]);
  // The surahs ship with the app (lib/surahs.ts); the synced table is used once it is on the device.
  const synced = s.all("quran_surahs");
  const surahs = synced.length === 114 ? synced : SURAHS;
  const mushaf = useMemo(() => new Mushaf(surahs), [surahs]);

  async function refreshCenter() {
    const { data } = await supabase.rpc("my_context");
    if (!data) return;
    const c = data as unknown as MyContext;
    applyPalette(c.center);
    setCtx(c);
  }

  async function switchCenter(id: string) {
    if (!ctx || id === ctx.center?.id) return;
    if (navigator.onLine) await store.sync();
    if (store.status.pending + store.status.failed > 0) {
      showToast("بعض التعديلات محفوظة على الجهاز ولم تُحفظ في الحساب بعد. اتصل بالإنترنت وانتظر «تم الحفظ ✓» ثم بدّل المركز");
      return;
    }
    const { error } = await supabase.rpc("switch_center", { p_center_id: id });
    if (error) return showToast(error.message);
    await store.reset();
    location.reload();
  }

  // ملاحظة 9: leaving is immediate — send what is waiting (a few seconds at most), never a full pull,
  // then clear the session and this device's copy and go to the login page.
  async function logout() {
    await store.flush();
    const unsent = store.status.pending + store.status.failed;
    if (unsent > 0) {
      const ok = confirm(
        `لديك ${unsent} تعديل محفوظ على هذا الجهاز ولم يُحفظ في الحساب بعد. تسجيل الخروج الآن يحذفه نهائيًا.\n\nهل تريد تسجيل الخروج رغم ذلك؟`
      );
      if (!ok) return;
    }
    store.stop();
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/");
    void store.reset();
  }

  if (blockedMessage) {
    return (
      <div className="login">
        <div className="loginbox">
          <h1>تلاوة</h1>
          <p className="center">{blockedMessage}</p>
          <button style={{ width: "100%", marginTop: 13 }} onClick={() => router.replace("/")}>
            العودة إلى الصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !ctx?.center || mushaf.total === 0) {
    return (
      <div className="login">
        <p className="muted center">
          {profile && !s.status.online
            ? "بدون اتصال: البيانات لم تُنزَّل على هذا الجهاز بعد. اتصل بالإنترنت مرة واحدة."
            : s.status.lastError
              ? `تعذّر تنزيل البيانات: ${s.status.lastError}`
              : "جارٍ التحميل..."}
        </p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ supabase, profile, mushaf, showToast, center: ctx!.center!, isOwner: !!ctx?.membership?.is_owner, isPlatformAdmin: !!ctx?.is_platform_admin, refreshCenter, tracks }}>
      <header className="no-print">
        <div className="headerrow">
          <div className="brand-row">
            <CenterMark name={ctx?.center?.name ?? "تلاوة"} logo={ctx?.center?.logo_url} />
            <div className="brand-text">
              <h1>{ctx?.center?.name ?? "تلاوة"}</h1>
              <div className="dates">
                <span className="hijri">
                  {greeting()} · {hijriToday()}
                </span>
                <span className="gregorian">{gregorianToday()}</span>
              </div>
            </div>
          </div>
          <div className="userbox">
            <span>
              {profile.name} — {profile.role === "ADMIN" ? (ctx?.membership?.is_owner ? "صاحب المركز" : "مدير") : teacherTitle(profile.default_filter, s.all("circles"))}
            </span>
            <div className="userbox-actions">
              {ctx && ctx.centers.filter((c) => c.active).length > 1 && (
                <select className="center-switch" aria-label="المركز" value={ctx.center?.id} onChange={(e) => switchCenter(e.target.value)}>
                  {ctx.centers.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {ctx?.is_platform_admin && (
                <Link href="/super" className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }}>
                  المنصة
                </Link>
              )}
              <SyncBadge />
              <Appearance />
              <button className="secondary" onClick={() => router.push("/")}>الرئيسية</button>
              <button onClick={logout}>خروج</button>
            </div>
          </div>
        </div>
      </header>

      <nav className="no-print sliding">
        <SlidingIndicator active={page} />
        {(profile.role === "ADMIN" ? [...NAV, ...ADMIN_NAV] : NAV).map((n) => (
          <button key={n.id} className={page === n.id ? "active" : ""} onClick={() => setPage(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>

      {profile.role === "ADMIN" && ctx?.center && !ctx.center.onboarded && (
        <div className="plan-banner no-print">
          <span>أكمل إعداد مركزك: الشعار والألوان وأول حلقة وطلابها وأول معلّم.</span>
          <Link href="/onboarding" className="btn" style={{ padding: "6px 12px" }}>
            إكمال الإعداد
          </Link>
        </div>
      )}

      <main>
        {page !== "students" ? (
          <div className="back-row no-print">
            <button type="button" className="link back-btn" onClick={() => setPage("students")}>
              → رجوع
            </button>
          </div>
        ) : (
          !view.studentId && (
            <div className="back-row no-print">
              <Link href="/" className="link back-btn">
                → رجوع إلى الرئيسية
              </Link>
            </div>
          )
        )}
        <div className="no-print">
          <InstallHint />
          {((page === "students" && !view.studentId) || page === "reports" || page === "ranking" || page === "dashboard") && <FilterBar />}
        </div>
        {page === "students" && <Students openId={view.studentId} onOpen={openStudent} onClose={closeStudent} />}
        {page === "reports" && <Reports />}
        {page === "ranking" && <Ranking />}
        {page === "dashboard" && profile.role === "ADMIN" && <Dashboard openStudent={openStudent} openManage={() => setPage("manage")} />}
        {page === "manage" && profile.role === "ADMIN" && <Manage />}
        {page === "trash" && profile.role === "ADMIN" && <Trash />}
        {page === "audit" && profile.role === "ADMIN" && <AuditLog />}
      </main>

      <Toast text={toast} />
      <ConfirmDialogHost />
    </AppContext.Provider>
  );
}

// e.g. "الخميس، ٨ تشرين الأول ٢٠٢٦ م" — ar-SY gives the Levantine month names.
function gregorianToday(): string {
  try {
    return (
      new Intl.DateTimeFormat("ar-SY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()) +
      " م"
    );
  } catch {
    return "";
  }
}

// The Islamic greeting at every hour of the day.
function greeting(): string {
  return "السلام عليكم ورحمة الله";
}

// Today's date in the Umm al-Qura Hijri calendar, e.g. "١٦ ربيع الآخر ١٤٤٨ هـ".
function hijriToday(): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  } catch {
    return "";
  }
}

