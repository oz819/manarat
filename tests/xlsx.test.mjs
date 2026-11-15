import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/xlsx.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { xlsxBlob } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('XLSX is a valid ZIP with sheet-level RTL and lossless Arabic/text cells', async () => {
  const file = xlsxBlob([{ name: 'الطلاب', rows: [['الاسم', 'الهاتف', 'عدد'], ['أحمد & محمد', '0912345678', 42], ['=1+1', '"quoted" <text>', null]] }]);
  assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // Independent ZIP/CRC and XML readers from Python's standard library; no extra packages.
  const report = JSON.parse(execFileSync('python3', ['-c', `
import io, json, sys, zipfile, xml.etree.ElementTree as ET
z = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
for name in z.namelist(): ET.fromstring(z.read(name))
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
wb = ET.fromstring(z.read('xl/workbook.xml'))
# rightToLeft belongs to sheetView, never workbookView (Excel workbook schema).
assert 'rightToLeft' not in wb.find('s:bookViews/s:workbookView', ns).attrib
sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
assert sheet.find('s:sheetViews/s:sheetView', ns).get('rightToLeft') == '1'
assert sheet.find('s:sheetViews/s:sheetView/s:pane', ns).get('state') == 'frozen'
assert not sheet.findall('.//s:f', ns), 'user input must never become executable formulas'
cells = {c.get('r'): ''.join(c.itertext()) for c in sheet.findall('.//s:c', ns)}
print(json.dumps(cells))
`], { input: Buffer.from(await file.arrayBuffer()), encoding: 'utf8' }));
  assert.equal(report.A2, 'أحمد & محمد');
  assert.equal(report.B2, '0912345678');
  assert.equal(report.C2, '42');
  assert.equal(report.A3, '=1+1');
  assert.equal(report.B3, '"quoted" <text>');
});
