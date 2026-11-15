import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/tracks.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { tracksOf, ALL_TRACKS } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('new or uncached centres enable Talqeen with the database default tracks', () => {
  for (const center of [undefined, null, {}, { enabled_tracks: [] }]) {
    assert.equal(tracksOf(center).has('TALQEEN'), true);
    assert.deepEqual(tracksOf(center).list, ALL_TRACKS.map((t) => t.key));
  }
});

test('a centre can opt out without defaults overriding its saved choice', () => {
  const center = { enabled_tracks: ['HIFZ', 'ARABIC'], talqeen_label: 'التسميع' };
  assert.equal(tracksOf(center).has('TALQEEN'), false);
  assert.equal(tracksOf(center).has('ARABIC'), true);
  assert.equal(tracksOf(center).label('TALQEEN'), 'التسميع');
  assert.equal(tracksOf({ ...center, enabled_tracks: [...center.enabled_tracks, 'TALQEEN'] }).has('TALQEEN'), true);
  assert.deepEqual(center.enabled_tracks, ['HIFZ', 'ARABIC']);
});
