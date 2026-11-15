"use client";

import { useI18n } from "@/components/LocaleProvider";
import type { JuzProgress } from "@/lib/juz";

// The 30 juz' as a grid: filled green when memorized in full, partly filled by the share
// memorized, plain when not started. Each cell says its percent in words for screen readers.
export default function JuzGrid({
  juz,
  selected,
  onSelect,
}: {
  juz: JuzProgress[];
  selected?: number | null;
  onSelect?: (n: number) => void;
}) {
  const { tx } = useI18n();
  return (
    <div className="juz-grid" role="list" aria-label={tx("خريطة الأجزاء الثلاثين")}>
      {juz.map((j) => {
        const cls = `juz-cell ${j.percent === 100 ? "full" : j.percent > 0 ? "part" : ""} ${selected === j.juz ? "sel" : ""}`;
        const label = tx("الجزء {0}: {1}", [j.juz, j.percent === 100 ? tx("محفوظ كاملًا") : j.percent ? `${j.percent}%` : tx("لم يبدأ")]);
        const style = { "--fill": `${j.percent}%` } as React.CSSProperties;
        return onSelect ? (
          <button key={j.juz} type="button" role="listitem" className={cls} style={style} title={tx(label)} aria-label={tx(label)} onClick={() => onSelect(j.juz)}>
            {j.juz}
          </button>
        ) : (
          <span key={j.juz} role="listitem" className={cls} style={style} title={tx(label)} aria-label={tx(label)}>
            {j.juz}
          </span>
        );
      })}
    </div>
  );
}
