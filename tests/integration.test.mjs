import test from 'node:test';
import assert from 'node:assert/strict';
import { setupVendor } from './helpers/vendor.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../dist/presets.js';
import { DEFAULT_OPTIONS, inferColumns, suggestDuplicateKeys, cleanData, parseRequirements } from '../dist/engine.js';
import { configurationFingerprint, assessRequirements, buildReportTables, splitReportTables, buildJSONReport, resultCounts } from '../dist/report.js';
import { makeWorkbook, readFile, parseDelimited } from '../dist/io.js';

setupVendor();

function contextFor(headers, rows, options = {}, preset = 'generic') {
  const columns = inferColumns(headers, rows, preset);
  const settings = { ...DEFAULT_OPTIONS, duplicateKeys: suggestDuplicateKeys(columns, preset), ...options };
  const result = cleanData({ headers, rows, columns, options: settings });
  return { result, headers, columns, options: settings, filename: '测试.csv', sheetName: '数据', presetName: preset, processedAt: '2026-10-10T03:00:00.000Z', importNotes: [], requirements: { status: 'none', text: '', recognized: [], unresolved: [] } };
}

test('every built-in requirement example is recognized before any rule is applied', () => {
  for (const [preset, example] of Object.entries(EXAMPLES)) {
    const columns = inferColumns(example.headers, example.rows, preset);
    const options = { ...DEFAULT_OPTIONS, duplicateKeys: suggestDuplicateKeys(columns, preset) };
    const draft = parseRequirements(example.requirements, columns, options);
    assert.equal(draft.unresolved.length, 0, `${preset}: ${JSON.stringify(draft.unresolved)}`);
    assert.ok(draft.recognized.length >= 4);
  }
});

test('education composite identity retains one student enrolled in different courses through XLSX export', async () => {
  const example = EXAMPLES.education;
  const context = contextFor(example.headers, example.rows, { duplicateMode: 'removeExact' }, 'education');
  const student = context.result.keptRows.filter(row => row.values[0] === '0001');
  assert.equal(student.length, 2);
  assert.deepEqual(student.map(row => row.values[2]), ['Python 基础', 'Python 进阶']);
  assert.equal(context.result.keptRows.filter(row => row.values[0] === '0005').length, 2, 'conflicting registration records remain');
  const bytes = await makeWorkbook(buildReportTables(context));
  const imported = await readFile({ name: '结果.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  assert.equal(imported.sheets.length, 7);
  assert.equal(imported.sheets[0].rows.filter(row => row[0] === '0001').length, 2);
  assert.equal(imported.sheets[0].rows[0][0], '0001');
});

test('manual changes after applying a requirement are explicitly recorded as overridden', () => {
  const context = contextFor(['邮箱'], [['User@EXAMPLE.COM']]);
  const text = '邮箱域名转小写';
  const draft = parseRequirements(text, context.columns, context.options);
  const applied = { text, ...draft, fingerprint: configurationFingerprint(draft.columns, draft.options) };
  const changedOptions = { ...draft.options, normalizeEmail: false };
  const assessment = assessRequirements(applied, text, draft.columns, changedOptions);
  assert.equal(assessment.status, 'overridden');
  context.requirements = assessment;
  context.options = changedOptions;
  context.result = cleanData({ headers: context.headers, rows: [['User@EXAMPLE.COM']], columns: context.columns, options: changedOptions });
  assert.equal(context.result.keptRows[0].values[0], 'User@EXAMPLE.COM');
  const report = buildReportTables(context).at(-1).rows;
  assert.equal(report.some(row => row[0] === '已应用需求'), false);
  assert.ok(report.some(row => row[0].startsWith('先前规则草案')));
});

test('unapplied and edited requirement text cannot be represented as executed', () => {
  const context = contextFor(['姓名'], [['甲']]);
  const pending = assessRequirements(null, '自动补全手机号', context.columns, context.options);
  assert.equal(pending.status, 'pending');
  const draft = parseRequirements('姓名必填', context.columns, context.options);
  const applied = { text: '姓名必填', ...draft, fingerprint: configurationFingerprint(draft.columns, draft.options) };
  context.requirements = assessRequirements(applied, '自动补齐姓名', draft.columns, draft.options);
  assert.equal(context.requirements.status, 'edited');
  const report = buildJSONReport(context);
  assert.equal(report.requirements.text, '自动补齐姓名');
  assert.equal(buildReportTables(context).at(-1).rows.some(row => row[0] === '已应用需求'), false);
});

test('blank rows survive import when requested and removal counts only include actually removed blanks', () => {
  const parsed = parseDelimited('名称\n甲\n甲\n\n');
  assert.equal(parsed.rows.length, 3);
  const context = contextFor(parsed.headers, parsed.rows, { dropEmptyRows: false, duplicateMode: 'removeExact', duplicateKeys: [] });
  assert.equal(context.result.stats.removedRows, 1);
  assert.equal(context.result.stats.emptyRows, 1);
  assert.equal(resultCounts(context.result).removedEmptyRows, 0);
  const report = new Map(buildReportTables(context).at(-1).rows);
  assert.equal(report.get('移除记录中的全空行'), '0');
});

test('retained issue counts exclude removed duplicates while the audit preserves all issues', () => {
  const context = contextFor(['邮箱'], [['bad'], ['bad']], { duplicateMode: 'removeExact', duplicateKeys: [] });
  assert.equal(context.result.stats.reviewRows, 1);
  assert.equal(resultCounts(context.result).reviewIssueCount, 1);
  assert.equal(context.result.stats.issueCount, 2);
  const table = buildReportTables(context)[1];
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows.filter(row => row[5] === '待确认').length, 1);
});

test('100-column accepted data still exports its full 103-column removal audit', async () => {
  const headers = Array.from({ length: 100 }, (_, i) => `字段${i + 1}`);
  const context = contextFor(headers, [headers.map(() => '值')]);
  const tables = buildReportTables(context);
  assert.equal(tables[4].headers.length, 103);
  const bytes = await makeWorkbook(tables);
  assert.ok(bytes.length > 0);
});

test('audit table splitting preserves every entry and header in order', () => {
  const table = { name: '修改明细', headers: ['行号', '原值'], rows: Array.from({ length: 11 }, (_, i) => [String(i), '原文']) };
  const split = splitReportTables([table], 4);
  assert.deepEqual(split.map(t => t.rows.length), [4, 4, 3]);
  assert.deepEqual(split.flatMap(t => t.rows), table.rows);
  assert.ok(split.every(t => t.headers === table.headers));
  assert.deepEqual(split.map(t => t.name), ['修改明细_1', '修改明细_2', '修改明细_3']);
});

test('the page has local assets for every script, stylesheet, icon and module reference', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const htmlRefs = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(match => match[1]);
  for (const ref of htmlRefs) assert.ok(existsSync(path.resolve(dist, ref)), ref);
  for (const file of ['app.js', 'engine.js', 'io.js', 'presets.js', 'report.js']) {
    const source = readFileSync(path.join(dist, file), 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)) assert.ok(existsSync(path.resolve(dist, match[1])), `${file}: ${match[1]}`);
  }
  assert.equal(/(?:src|href)="https?:\/\//.test(html), false, 'runtime files use no CDN');
});
