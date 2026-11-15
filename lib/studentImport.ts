export type ImportStudent = { name: string; circle: string; guardian: string; phone: string };

export const STUDENT_IMPORT_TEMPLATE = "اسم الطالب,الحلقة,اسم ولي الأمر,رقم ولي الأمر\r\n";

/** Excel clipboard (TSV) or CSV. Detect delimiters outside quotes and preserve quoted line breaks. */
export function parseTable(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").trimStart();
  const counts = new Map([["\t", 0], [",", 0], [";", 0]]);
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (ch === "\n" || ch === "\r") break;
      if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
    }
  }
  const sep = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "";
  quoted = false;
  const finishRow = () => {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      finishRow();
    } else cell += ch;
  }
  finishRow();
  return rows;
}

// Exact matches: a student's name such as «أسماء» or «اسماء» is never mistaken for a header.
const HEAD = /^(?:الاسم|اسم|اسم الطالب|اسم الطالبة|الطالب|name|student|student name)$/i;

export function parseStudents(text: string): ImportStudent[] {
  const rows = parseTable(text);
  if (HEAD.test(rows[0]?.[0] ?? "")) rows.shift();
  return rows.map((r) => ({ name: r[0] ?? "", circle: r[1] ?? "", guardian: r[2] ?? "", phone: r[3] ?? "" }))
    .filter((r) => r.name.length >= 2);
}
