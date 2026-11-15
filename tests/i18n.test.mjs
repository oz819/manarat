import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const english = JSON.parse(readFileSync(resolve(root, 'lib/staff-en.json'), 'utf8'));
const modules = new Map();
function moduleUrl(file) {
  if (modules.has(file)) return modules.get(file);
  let source = readFileSync(file, 'utf8');
  if (file.endsWith('/i18n.ts')) source = source.replace('import staffEnglish from "./staff-en.json";', `const staffEnglish = ${JSON.stringify(english)};`);
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  outputText = outputText.replace(/from ["']([^"']+)["']/g, (match, spec) => {
    if (!spec.startsWith('@/') && !spec.startsWith('.')) return match;
    const target = spec.startsWith('@/') ? resolve(root, spec.slice(2) + '.ts') : resolve(dirname(file), spec + '.ts');
    return `from ${JSON.stringify(moduleUrl(target))}`;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
  modules.set(file, url);
  return url;
}
const { staffText, dirOf, formatDate, formatNumber } = await import(moduleUrl(resolve(root, 'lib/i18n.ts')));
const { dailyMessage, monthlyMessage, dayLines, absenceMessage } = await import(moduleUrl(resolve(root, 'lib/familyMessages.ts')));
const { Mushaf } = await import(moduleUrl(resolve(root, 'lib/quran.ts')));

test('Arabic source/default and English interpolation preserve opaque user content', () => {
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('en'), 'ltr');
  assert.equal(staffText('ar', 'حذف الطالب «{0}»؟', ['الحفظ']), 'حذف الطالب «الحفظ»؟');
  assert.equal(staffText('en', 'حذف الطالب «{0}»؟', ['الحفظ']), 'Delete student “الحفظ”?');
  assert.equal(staffText('en', 'unknown user message'), 'unknown user message');
  assert.equal(staffText('en', 'constructor'), 'constructor');
  assert.equal(staffText('en', 'تم حفظ {0}', ['{1} $&']), 'Saved {1} $&');
});

test('every catalogue entry preserves its numbered placeholders', () => {
  const slots = (text) => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
  for (const [ar, en] of Object.entries(english)) {
    assert.ok(en.trim(), ar);
    assert.deepEqual(slots(en), slots(ar), ar);
  }
});

test('explicit staff translation calls all have English entries', () => {
  const files = readdirSync(resolve(root, 'components'), { recursive: true }).filter(f => f.endsWith('.tsx')).map(f => resolve(root, 'components', f));
  files.push(resolve(root, 'app/signup/page.tsx'));
  const missing = [];
  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'tx' && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        if (!Object.hasOwn(english, key)) missing.push(`${file}: ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  assert.deepEqual(missing, []);
});

test('display translations do not rewrite stored grades, names or custom messages', () => {
  const entry = { track: 'HIFZ', quality: 'ممتاز', from_surah_no: 1, to_surah_no: 1, from_ayah: 1, to_ayah: 2, created_at: '' };
  const before = structuredClone(entry);
  const mushaf = new Mushaf([{ surah_no: 1, name: 'الفاتحة', ayah_count: 7 }]);
  const lines = dayLines(mushaf, [entry], { status: 'PRESENT' }, { title: 'الحفظ' }, undefined, 'en');
  assert.match(lines[0], /Memorization: الفاتحة.*Excellent/);
  assert.equal(lines[1], 'Attendance: Present');
  assert.equal(lines[2], 'Lesson: الحفظ');
  assert.deepEqual(entry, before);
  const student = { name: 'الحفظ' };
  assert.match(dailyMessage(student, '2026-11-15', lines, undefined, false, 'en'), /- الحفظ/);
  assert.match(monthlyMessage(student, '2026-11', { ayat: 12, recitations: 3, days: 4, attended: 3, rank: 2, rankOf: 5, exams: [] }, undefined, false, 'en'), /Circle rank: 2 of 5/);
  assert.equal(absenceMessage('رسالة خاصة: {الاسم} / {العدد}', student, 3, false, 'en'), 'رسالة خاصة: الحفظ / 3');
  assert.match(absenceMessage('', student, 3, false, 'en'), /missed الحفظ/);
});

test('date-only records keep the same day and numbers follow the locale', () => {
  assert.equal(formatDate('en', '2026-11-15'), '15 Nov 2026');
  assert.equal(formatDate('en', 'invalid'), 'invalid');
  assert.equal(formatNumber('en', 1234), '1,234');
  assert.match(formatNumber('ar', 1234), /١/);
});

// The writer stores XML uncompressed, so inspect its public output directly.
test('spreadsheet exports default to RTL and can use LTR without changing cell content', async () => {
  const { xlsxBlob } = await import(moduleUrl(resolve(root, 'lib/xlsx.ts')));
  const sheet = { name: 'Students', rows: [['Student', 'Grade'], ['الحفظ', 'ممتاز']] };
  const arabic = await xlsxBlob([sheet]).text();
  const english = await xlsxBlob([{ ...sheet, rtl: false }]).text();
  assert.match(arabic, /rightToLeft="1"/);
  assert.match(english, /rightToLeft="0"/);
  assert.match(english, /الحفظ/);
  assert.match(english, /ممتاز/);
});
