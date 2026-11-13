import type { QuranEntry, Surah } from "@/lib/types";

export type QuranPos = { surah: number; ayah: number };
export type QuranRange = { from: QuranPos; to: QuranPos };

// Prefix sums so "absolute ayah index" lookups are O(1).
export class Mushaf {
  readonly surahs: Surah[];
  readonly total: number;
  private before: number[];

  constructor(surahs: Surah[]) {
    this.surahs = [...surahs].sort((a, b) => a.surah_no - b.surah_no);
    this.before = [0];
    let sum = 0;
    for (const s of this.surahs) {
      this.before[s.surah_no] = sum;
      sum += s.ayah_count;
    }
    this.total = sum;
  }

  surah(no: number): Surah | undefined {
    return this.surahs[no - 1]?.surah_no === no ? this.surahs[no - 1] : this.surahs.find((s) => s.surah_no === no);
  }

  name(no: number | null | undefined): string {
    return (no && this.surah(no)?.name) || "—";
  }

  ayahCount(no: number): number {
    return this.surah(no)?.ayah_count ?? 0;
  }

  /** 1-based absolute index of an ayah in the mushaf. */
  index(p: QuranPos): number {
    return (this.before[p.surah] ?? 0) + p.ayah;
  }

  /** Ayahs in an inclusive range. */
  length(r: QuranRange): number {
    return Math.max(0, this.index(r.to) - this.index(r.from) + 1);
  }

  percent(p: QuranPos): number {
    return this.total ? Math.round((this.index(p) / this.total) * 100) : 0;
  }

  /** The ayah right after p, wrapping into the next surah; null at the end of the mushaf. */
  next(p: QuranPos): QuranPos | null {
    if (p.ayah < this.ayahCount(p.surah)) return { surah: p.surah, ayah: p.ayah + 1 };
    if (p.surah < 114) return { surah: p.surah + 1, ayah: 1 };
    return null;
  }

  /** Mirrors the DB trigger private.validate_quran_range so offline entries are rarely rejected at sync. */
  validate(r: QuranRange): string | null {
    const fromMax = this.ayahCount(r.from.surah);
    const toMax = this.ayahCount(r.to.surah);
    if (!fromMax || !toMax) return "رقم السورة غير صحيح";
    if (r.from.ayah < 1 || r.from.ayah > fromMax || r.to.ayah < 1 || r.to.ayah > toMax) {
      return "رقم الآية خارج حدود السورة";
    }
    if (this.index(r.from) > this.index(r.to)) return "بداية المقطع بعد نهايته";
    return null;
  }

  formatRange(r: QuranRange | null): string {
    if (!r) return "—";
    if (r.from.surah === r.to.surah) {
      return r.from.ayah === r.to.ayah
        ? `${this.name(r.from.surah)} ${r.from.ayah}`
        : `${this.name(r.from.surah)} ${r.from.ayah}–${r.to.ayah}`;
    }
    return `${this.name(r.from.surah)} ${r.from.ayah} ← ${this.name(r.to.surah)} ${r.to.ayah}`;
  }

  /** Distinct ayahs covered by a set of ranges (overlaps counted once). */
  coverage(ranges: QuranRange[]): number {
    const spans = ranges
      .map((r) => [this.index(r.from), this.index(r.to)] as const)
      .filter(([a, b]) => b >= a)
      .sort((x, y) => x[0] - y[0]);
    let covered = 0;
    let curStart = -1;
    let curEnd = -2;
    for (const [a, b] of spans) {
      if (a > curEnd + 1) {
        if (curEnd >= curStart && curStart >= 0) covered += curEnd - curStart + 1;
        curStart = a;
        curEnd = b;
      } else if (b > curEnd) {
        curEnd = b;
      }
    }
    if (curStart >= 0) covered += curEnd - curStart + 1;
    return covered;
  }

  /** Distinct ayahs covered in each surah (overlaps counted once). */
  bySurah(ranges: QuranRange[]): Map<number, number> {
    const hit = new Set<number>();
    for (const r of ranges) for (let i = this.index(r.from); i <= this.index(r.to); i++) hit.add(i);
    const out = new Map<number, number>();
    for (const sr of this.surahs) {
      const start = this.before[sr.surah_no] ?? 0;
      let n = 0;
      for (let a = 1; a <= sr.ayah_count; a++) if (hit.has(start + a)) n++;
      if (n) out.set(sr.surah_no, n);
    }
    return out;
  }

  /**
   * What was memorized, told in surahs rather than ayahs (ملاحظة 7): «سورة الكهف كاملة + 20 آية من مريم»,
   * «3 سور كاملة»، «3 سور كاملة + أجزاء من سورتين». The data stays in ayahs; this is only how it reads.
   */
  describeSurahs(ranges: QuranRange[]): string {
    const per = this.bySurah(ranges);
    if (!per.size) return "لا شيء بعد";
    const full: number[] = [];
    const part: [number, number][] = [];
    for (const [no, n] of per) (n >= this.ayahCount(no) ? full.push(no) : part.push([no, n]));
    const fullText =
      full.length === 0 ? "" : full.length === 1 ? `سورة ${this.name(full[0])} كاملة` : full.length === 2 ? `سورتا ${this.name(full[0])} و${this.name(full[1])}` : `${surahCount(full.length)} كاملة`;
    const partText =
      part.length === 0 ? "" : part.length === 1 ? `${ayahCount(part[0][1])} من ${this.name(part[0][0])}` : `أجزاء من ${surahCount(part.length)}`;
    return [fullText, partText].filter(Boolean).join(" + ");
  }
}

/** «سورة واحدة»، «سورتان»، «3 سور»، «11 سورة». */
export function surahCount(n: number): string {
  if (n === 1) return "سورة واحدة";
  if (n === 2) return "سورتين";
  return n <= 10 ? `${n} سور` : `${n} سورة`;
}

/** «آية واحدة»، «آيتان»، «5 آيات»، «20 آية». */
export function ayahCount(n: number): string {
  if (n === 1) return "آية واحدة";
  if (n === 2) return "آيتان";
  return n <= 10 ? `${n} آيات` : `${n} آية`;
}

export function entryRange(e: Pick<QuranEntry, "from_surah_no" | "from_ayah" | "to_surah_no" | "to_ayah">): QuranRange | null {
  if (e.from_surah_no == null || e.from_ayah == null || e.to_surah_no == null || e.to_ayah == null) return null;
  return { from: { surah: e.from_surah_no, ayah: e.from_ayah }, to: { surah: e.to_surah_no, ayah: e.to_ayah } };
}
