// New centres start with every track enabled, matching the database default. Talqeen is optional:
// admins can disable it in settings without deleting history. Explicit saved choices take priority.

export type TrackKey = "HIFZ" | "MURAJAA" | "TILAWA" | "TALQEEN" | "ARABIC" | "TARBIYA" | "EXAMS";

export const ALL_TRACKS: { key: TrackKey; label: string; hint: string }[] = [
  { key: "HIFZ", label: "الحفظ", hint: "دائمًا" },
  { key: "MURAJAA", label: "المراجعة", hint: "مراجعة المحفوظ" },
  { key: "TILAWA", label: "التلاوة", hint: "القراءة من المصحف" },
  { key: "TALQEEN", label: "التلقين", hint: "للصغار: الحفظ سماعًا" },
  { key: "ARABIC", label: "العربية", hint: "كتب العربية بالصفحات" },
  { key: "TARBIYA", label: "التربية", hint: "ملاحظات تربوية" },
  { key: "EXAMS", label: "الاختبارات", hint: "اختبارات الأجزاء والشهادات" },
];

export const DEFAULT_TRACKS: TrackKey[] = ALL_TRACKS.map((track) => track.key);

type WithTracks = { enabled_tracks?: string[] | null; talqeen_label?: string | null } | null | undefined;

export type Tracks = {
  has: (k: TrackKey) => boolean;
  label: (k: TrackKey) => string;
  list: TrackKey[];
};

export function tracksOf(c: WithTracks): Tracks {
  const on = new Set<TrackKey>((c?.enabled_tracks?.length ? c.enabled_tracks : DEFAULT_TRACKS) as TrackKey[]);
  on.add("HIFZ");
  const talqeen = c?.talqeen_label?.trim() || "التلقين";
  return {
    has: (k) => on.has(k),
    label: (k) => (k === "TALQEEN" ? talqeen : ALL_TRACKS.find((t) => t.key === k)!.label),
    list: ALL_TRACKS.map((t) => t.key).filter((k) => on.has(k)),
  };
}
