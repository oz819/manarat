"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppContext";
import { newId, store, useStore } from "@/lib/offline/store";
import { normalizePhone } from "@/lib/guardian";
import { parseStudents, STUDENT_IMPORT_TEMPLATE } from "@/lib/studentImport";

// استيراد جماعي للطلاب: columns are name, halaqa, guardian's name, guardian's phone (only the name
// is required). A halaqa that doesn't match goes to the one picked below. Students are added
// through the offline outbox like any other, so it works on a weak connection too.
export default function ImportStudents() {
  const { showToast } = useApp();
  const s = useStore();
  const circles = s.all("circles").filter((c) => c.active);
  const [text, setText] = useState("");
  const [fallback, setFallback] = useState("");
  const [busy, setBusy] = useState(false);

  const { rows, parseError } = useMemo(() => {
    try { return { rows: parseStudents(text), parseError: "" }; }
    catch (error) { return { rows: [], parseError: (error as Error).message }; }
  }, [text]);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", STUDENT_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "قالب-استيراد-الطلاب.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const byName = new Map(circles.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const circleOf = (r: (typeof rows)[number]) => byName.get(r.circle.trim().toLowerCase()) ?? fallback;
  const missing = rows.filter((r) => !circleOf(r)).length;

  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1024 * 1024) return showToast("الملف أكبر من 1 ميغابايت");
    if (/\.xlsx?$/i.test(f.name)) return showToast("احفظ ملف Excel بصيغة CSV أولًا، أو انسخ الخلايا والصقها هنا");
    setText(await f.text());
  }

  async function run() {
    if (!rows.length || missing) return;
    setBusy(true);
    for (const r of rows) {
      await store.save(
        "students",
        {
          id: newId(),
          name: r.name.slice(0, 100),
          circle_id: circleOf(r),
          active: true,
          guardian_name: r.guardian.slice(0, 100) || null,
          guardian_phone: normalizePhone(r.phone),
        },
        `استيراد طالب: ${r.name}`
      );
    }
    setBusy(false);
    setText("");
    showToast(`أُضيف ${rows.length} طالبًا`);
  }

  return (
    <div className="card">
      <h3>📥 استيراد طلاب من CSV أو لصق Excel</h3>
      <p className="small muted">
        الأعمدة بالترتيب: اسم الطالب، الحلقة، اسم ولي الأمر، رقم ولي الأمر. انسخ الخلايا من Excel والصقها هنا، أو ارفع ملف CSV بترميز UTF-8. الاسم مطلوب؛ وبقية الحقول اختيارية إذا اخترت الحلقة أدناه.
      </p>
      <p className="small muted">ملفات ‎.xlsx و‎.xls لا تُرفع مباشرة: احفظها من Excel بصيغة CSV UTF-8، أو انسخ الخلايا والصقها. اجعل عمود الهاتف نصًا للحفاظ على الصفر في بدايته.</p>
      <button type="button" className="link" onClick={downloadTemplate}>تنزيل قالب CSV</button>
      <textarea aria-label="بيانات الطلاب للاستيراد" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"أحمد محمد\tحلقة أبي بكر\tمحمد\t0991234567"} dir="auto" />
      <div className="formgrid compact" style={{ marginTop: 8 }}>
        <div>
          <label>ملف CSV</label>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} />
        </div>
        <div>
          <label>حلقة لمن لم تُذكر حلقته</label>
          <select value={fallback} onChange={(e) => setFallback(e.target.value)}>
            <option value="">— اختر —</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {parseError && <p className="error-text" role="alert">{parseError}</p>}
      {rows.length > 0 && (
        <p className="small" style={{ marginTop: 8 }}>
          {rows.length} طالبًا جاهزون للإضافة
          {missing > 0 && <span className="error-text"> — {missing} بلا حلقة معروفة: اختر حلقة لهم</span>}
        </p>
      )}
      <button type="button" onClick={run} disabled={!rows.length || missing > 0 || busy} style={{ marginTop: 8 }}>
        {busy ? "جارٍ الإضافة..." : `إضافة ${rows.length || ""} طالب`}
      </button>
    </div>
  );
}
