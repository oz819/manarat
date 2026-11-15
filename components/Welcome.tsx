"use client";

import { useI18n } from "@/components/LocaleProvider";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import Panel from "@/components/Panel";
import CircleForm from "@/components/CircleForm";
import Invites from "@/components/center/Invites";
import { store, useStore } from "@/lib/offline/store";

// أول دخول لمركز فارغ: three steps, one button each — add a halaqa, add its students, invite a teacher.
// The admin sees it on «الطلاب» until the centre has students; a teacher is told the admin sets things up.
export default function Welcome({ onAddStudent }: { onAddStudent: () => void }) {
  const { tx } = useI18n();
  const s = useStore();
  const { supabase, profile, center, showToast } = useApp();
  const [step, setStep] = useState<"circle" | "invite" | null>(null);
  const circles = s.all("circles").filter((c) => c.active).length;
  const students = s.all("students").filter((st) => st.active).length;
  const people = s.all("profiles").length;

  if (profile.role !== "ADMIN") {
    return (
      <div className="card welcome">
        <h3>{tx("مرحبًا بك في")} {center.name}</h3>
        <p className="muted">{tx("لم تُضَف حلقات ولا طلاب بعد. يضيفها مدير المركز، ثم تظهر هنا.")}</p>
      </div>
    );
  }

  const steps = [
    { done: circles > 0, title: tx("أضف حلقة"), text: tx("اسم الحلقة وقسمها، ويمكنك كتابة أسماء طلابها مباشرة."), button: tx("أضف حلقة"), act: () => setStep("circle") },
    { done: students > 0, title: tx("أضف طلابها"), text: tx("اسم في كل سطر عند إنشاء الحلقة، أو طالبًا طالبًا."), button: tx("أضف طالبًا"), act: onAddStudent, needs: circles > 0 },
    { done: people > 1, title: tx("ادعُ معلّمًا"), text: tx("يصله رابط بالبريد أو واتساب، ويدخل إلى حلقاته."), button: tx("ادعُ معلّمًا"), act: () => setStep("invite") },
  ];

  return (
    <div className="card welcome">
      <h3>{tx("مرحبًا بك في تلاوة")}</h3>
      <p className="muted">{tx("ثلاث خطوات ويصبح مركزك جاهزًا:")}</p>
      <ol className="welcome-steps">
        {steps.map((st, i) => (
          <li key={st.title} className={st.done ? "done" : ""}>
            <span className="welcome-num" aria-hidden="true">{st.done ? "✓" : i + 1}</span>
            <div>
              <b>{st.title}</b>
              <p className="muted small">{st.text}</p>
            </div>
            {!st.done && (
              <button className={i === steps.findIndex((x) => !x.done) ? "" : "secondary"} onClick={st.act} disabled={st.needs === false}>
                {st.button}
              </button>
            )}
          </li>
        ))}
      </ol>
      {step === "circle" && (
        <Panel title={tx("حلقة جديدة")} onClose={() => setStep(null)} className="panel-inset">
          <CircleForm
            supabase={supabase}
            onCreated={async (c) => {
              await store.sync();
              setStep(null);
              showToast(c.students ? tx("أُنشئت «{0}» مع {1} طالبًا", [c.name, c.students]) : tx("أُنشئت «{0}»", [c.name]));
            }}
          />
        </Panel>
      )}
      {step === "invite" && (
        <Panel title={tx("دعوة معلّم")} onClose={() => setStep(null)} className="panel-inset">
          <Invites />
        </Panel>
      )}
    </div>
  );
}
