import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/studentImport.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { parseTable, parseStudents, STUDENT_IMPORT_TEMPLATE } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('Arabic UTF-8 CSV template and Excel clipboard keep phone numbers as text', () => {
  assert.deepEqual(parseStudents('\uFEFF' + STUDENT_IMPORT_TEMPLATE + 'أحمد,الفجر,محمد,0912345678'), [
    { name: 'أحمد', circle: 'الفجر', guardian: 'محمد', phone: '0912345678' },
  ]);
  assert.equal(parseStudents('أحمد\tالفجر\tمحمد\t+962790000000')[0].phone, '+962790000000');
});

test('a first student named اسماء is retained, while an exact header is skipped', () => {
  assert.equal(parseStudents('اسماء محمد\nأسماء خالد').length, 2);
  assert.equal(parseStudents('Student Name\tCircle\nAdam Smith\tA')[0].name, 'Adam Smith');
  assert.deepEqual(parseStudents(STUDENT_IMPORT_TEMPLATE), []);
  assert.equal(parseStudents('\r\n\n' + STUDENT_IMPORT_TEMPLATE + 'أحمد,الفجر,,')[0].circle, 'الفجر');
});

test('commas inside quotes do not override a semicolon separator', () => {
  assert.deepEqual(parseTable('"أحمد, محمد";الفجر;"أبو ""أحمد""";0912345678'), [
    ['أحمد, محمد', 'الفجر', 'أبو "أحمد"', '0912345678'],
  ]);
});

test('quoted multiline cells stay in one row, CRLF and blank lines are handled', () => {
  assert.deepEqual(parseTable('أحمد,الفجر,"محمد\r\nخالد",0912345678\r\n\r\nعمر,الفجر,,'), [
    ['أحمد', 'الفجر', 'محمد\r\nخالد', '0912345678'],
    ['عمر', 'الفجر', '', ''],
  ]);
});
