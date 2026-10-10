import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS, cleanData, parseRequirements } from '../dist/engine.js';
import { PRESETS } from '../dist/presets.js';
import { parseDelimited } from '../dist/io.js';
import { getLocale, setLocale, localize } from '../dist/i18n.js';
import {
  configurationFingerprint, assessRequirements, requirementNote,
  buildReportTables, buildJSONReport, splitReportTables,
} from '../dist/report.js';

beforeEach(() => setLocale('zh-CN'));
afterEach(() => setLocale('zh-CN'));

function makeContext() {
  // Some real data deliberately matches catalog entries, to catch accidental
  // translation of field names and values while translating the audit labels.
  const headers = ['编号', '字段', '邮箱', '处理报告'];
  const columns = [
    { name: '编号', outputName: '原始值', type: 'id', required: true },
    { name: '字段', outputName: '字段', type: 'text', required: true },
    { name: '邮箱', outputName: '邮箱', type: 'email', required: false },
    { name: '处理报告', outputName: '处理报告', type: 'text', required: false },
  ];
  const rows = [
    ['001', ' 保留 ', 'bad', '清洗数据'],
    ['001', '保留', 'bad', '清洗数据'],
    ['002', '甲', 'a@example.com', '字段规则'],
    ['002', '乙', 'a@example.com', '字段规则'],
    ['', '', '', ''],
    ['', '名称缺编号', 'b@example.com', '开启'],
    ['003', '全角', ' TEST@EXAMPLE.COM ', '修改明细'],
  ];
  const options = { ...DEFAULT_OPTIONS, duplicateMode: 'removeExact', duplicateKeys: [0] };
  const text = '去除首尾空白；按编号检查重复；仅移除完全相同的重复行；自动补齐邮箱';
  const draft = parseRequirements(text, columns, options);
  assert.equal(draft.recognized.length, 3);
  assert.equal(draft.unresolved.length, 1);
  const applied = { text, ...draft, fingerprint: configurationFingerprint(draft.columns, draft.options) };
  const requirements = assessRequirements(applied, text, draft.columns, draft.options);
  const result = cleanData({ headers, rows, columns: draft.columns, options: draft.options, sourceRows: [12, 13, 20, 21, 30, 35, 40] });
  const importNotes = parseDelimited('\n编号,字段,邮箱,处理报告\n001,保留,bad,清洗数据\n\n').notes;
  return {
    result, headers, columns: draft.columns, options: draft.options,
    filename: '处理报告.csv', sheetName: '清洗数据', processedAt: '2026-10-10T03:00:00.000Z',
    presetId: 'customer', presetName: 'Name cached in an earlier UI language',
    requirements, importNotes,
  };
}

const chineseTableNames = ['清洗数据', '待确认问题', '修改明细', '重复检查', '移除记录', '字段规则', '处理报告'];
const englishTableNames = ['Cleaned data', 'Review issues', 'Change log', 'Duplicate check', 'Removed records', 'Field rules', 'Processing report'];

test('Chinese report table names and audit headers retain their established meanings', () => {
  const context = makeContext();
  const tables = buildReportTables(context);
  assert.deepEqual(tables.map(table => table.name), chineseTableNames);
  assert.deepEqual(tables[1].headers, ['原文件行号', '字段', '原始值', '处理后值', '问题说明', '记录状态']);
  assert.deepEqual(tables[2].headers, ['原文件行号', '字段', '原始值', '处理后值', '处理规则']);
  assert.deepEqual(tables[4].headers, ['原文件行号', '保留原行', '移除原因', ...context.headers]);
  assert.deepEqual(tables[5].headers, ['原字段', '导出名称', '类型', '必填', '去重依据']);
  assert.deepEqual(tables[6].headers, ['项目', '内容']);
  const summary = new Map(tables[6].rows);
  assert.equal(summary.get('预设'), '客户资料');
  assert.equal(summary.get('源文件'), '处理报告.csv');
  assert.equal(summary.get('移除记录中的全空行'), '1');
  assert.equal(summary.get('用户输入的需求'), context.requirements.text);
  assert.ok(tables[1].rows.some(row => row[5] === '已移除记录中的问题'));
  assert.ok(tables[1].rows.some(row => row[5] === '待确认'));
});

test('Switching report language translates audit messages and labels without changing data or the run snapshot', () => {
  const context = makeContext();
  const snapshot = JSON.stringify(context);
  const fingerprint = configurationFingerprint(context.columns, context.options);
  const chinese = buildReportTables(context);
  setLocale('en');
  const english = buildReportTables(context);
  assert.deepEqual(english.map(table => table.name), englishTableNames);
  assert.deepEqual(english[1].headers, ['Source row', 'Field', 'Original value', 'Processed value', 'Issue', 'Record status']);
  assert.deepEqual(english[4].headers.slice(0, 3), ['Source row', 'Retained source row', 'Removal reason']);
  assert.deepEqual(english[4].headers.slice(3), context.headers);
  assert.deepEqual(english[0].headers, chinese[0].headers);
  assert.deepEqual(english[0].rows, chinese[0].rows);
  assert.equal(english[0].rows[0][1], '保留');
  assert.equal(english[0].rows[0][3], '清洗数据');
  assert.deepEqual(english[4].rows.map(row => row.slice(3)), chinese[4].rows.map(row => row.slice(3)));
  assert.deepEqual(english[5].rows.map(row => row.slice(0, 2)), context.columns.map(column => [column.name, column.outputName]));
  assert.ok(english[5].rows.every(row => !/\p{Script=Han}/u.test(row[2])));
  assert.ok(english[1].rows.every(row => !/\p{Script=Han}/u.test(row[4])));
  assert.ok(english[2].rows.every(row => !/\p{Script=Han}/u.test(row[4])));
  assert.ok(english[1].rows.some(row => row[1] === 'Entire row'));
  assert.ok(english[1].rows.some(row => row[1] === '邮箱'), 'real field names remain unchanged');
  assert.ok(english[1].rows.some(row => row[5] === 'Issue in a removed record'));
  assert.ok(english[1].rows.some(row => row[5] === 'Needs review'));
  assert.ok(english[3].rows.some(row => row[2] === 'Conflicting values for the same key' && row[3] === 'Retained'));
  assert.ok(english[3].rows.some(row => row[2] === 'Same key' && row[3] === 'Removed'));
  assert.ok(english[4].rows.some(row => row[2] === 'Identical duplicate row'));
  assert.ok(english[4].rows.some(row => row[2] === 'Empty row'));
  const reportRows = english[6].rows;
  const summary = new Map(reportRows);
  assert.equal(summary.get('Preset'), 'Customer records');
  assert.equal(summary.get('Source file'), '处理报告.csv');
  assert.equal(summary.get('Worksheet'), '清洗数据');
  assert.equal(summary.get('Duplicate key'), '编号');
  assert.equal(summary.get('User requirement text'), context.requirements.text);
  assert.ok(reportRows.filter(row => row[0] === 'Import note').every(row => !/\p{Script=Han}/u.test(row[1])));
  for (const requirement of context.requirements.recognized) {
    assert.ok(reportRows.some(row => row[0] === 'Applied requirement' && row[1] === `${requirement.text} → ${localize(requirement.description, 'en')}`));
  }
  for (const requirement of context.requirements.unresolved) {
    assert.ok(reportRows.some(row => row[0] === 'Unexecuted requirement' && row[1] === `${requirement.text}; ${localize(requirement.reason, 'en')}`));
  }
  assert.equal(configurationFingerprint(context.columns, context.options), fingerprint);
  assert.equal(JSON.stringify(context), snapshot, 'report rendering must not mutate the stored run');
  setLocale('zh-CN');
  assert.deepEqual(buildReportTables(context), chinese, 'changing display language back restores the original report wording');
});

test('JSON report keeps stable English keys and codes while localizing human-readable messages in a copy', () => {
  const context = makeContext();
  const snapshot = JSON.stringify(context);
  const chinese = buildJSONReport(context);
  setLocale('en');
  const english = buildJSONReport(context);
  assert.deepEqual(Object.keys(english), Object.keys(chinese));
  assert.ok(Object.keys(english).every(key => /^[A-Za-z]+$/.test(key)));
  assert.equal(chinese.tool, 'Qingshu Data Cleaner');
  assert.equal(english.tool, 'Qingshu Data Cleaner');
  assert.equal(chinese.version, '1.1');
  assert.equal(english.version, '1.1');
  assert.equal(chinese.language, 'zh-CN');
  assert.equal(english.language, 'en');
  assert.deepEqual(english.stats, chinese.stats);
  assert.deepEqual(english.options, context.options);
  assert.deepEqual(english.fields, context.columns);
  assert.equal(english.source, context.filename);
  assert.equal(english.sheet, context.sheetName);
  assert.equal(english.requirements.status, context.requirements.status);
  assert.equal(english.requirements.text, context.requirements.text);
  assert.equal(english.requirements.appliedText, context.requirements.appliedText);
  assert.deepEqual(english.requirements.recognized.map(requirement => requirement.text), context.requirements.recognized.map(requirement => requirement.text));
  assert.deepEqual(english.requirements.unresolved.map(requirement => requirement.text), context.requirements.unresolved.map(requirement => requirement.text));
  assert.deepEqual(english.requirements.recognized.map(requirement => requirement.description), context.requirements.recognized.map(requirement => localize(requirement.description, 'en')));
  assert.deepEqual(english.requirements.unresolved.map(requirement => requirement.reason), context.requirements.unresolved.map(requirement => localize(requirement.reason, 'en')));
  assert.deepEqual(english.importNotes, context.importNotes.map(note => localize(note, 'en')));
  assert.notEqual(english.requirements, context.requirements);
  assert.notEqual(english.requirements.recognized[0], context.requirements.recognized[0]);
  assert.equal(JSON.stringify(context), snapshot);
  assert.equal(Object.hasOwn(english, 'rows'), false, 'the summary report does not add whole-table data');
});

test('Built-in preset IDs resolve current display names while custom and legacy names remain literal', () => {
  const context = makeContext();
  setLocale('en');
  for (const preset of PRESETS) {
    const summary = new Map(buildReportTables({ ...context, presetId: preset.id, presetName: 'stale label' }).at(-1).rows);
    assert.equal(summary.get('Preset'), localize(preset.name, 'en'));
    assert.equal(/\p{Script=Han}/u.test(summary.get('Preset')), false);
  }
  const custom = { ...context, presetId: 'custom:123', presetName: '客户资料' };
  assert.equal(new Map(buildReportTables(custom).at(-1).rows).get('Preset'), '客户资料');
  const legacy = { ...context, presetId: undefined, presetName: '教育 · 学员名册' };
  assert.equal(new Map(buildReportTables(legacy).at(-1).rows).get('Preset'), '教育 · 学员名册');
  setLocale('zh-CN');
  assert.equal(new Map(buildReportTables({ ...custom, presetName: 'Customer records' }).at(-1).rows).get('预设'), 'Customer records');
});

test('Requirement application states and configuration fingerprints stay stable across display languages', () => {
  const context = makeContext();
  const fingerprint = configurationFingerprint(context.columns, context.options);
  const statuses = ['pending', 'edited', 'overridden', 'applied'];
  const chinese = statuses.map(status => requirementNote({ ...context.requirements, status }));
  assert.equal(requirementNote({ ...context.requirements, status: 'none' }), '');
  setLocale('en');
  assert.equal(configurationFingerprint(context.columns, context.options), fingerprint);
  statuses.forEach((status, index) => {
    const note = requirementNote({ ...context.requirements, status });
    assert.equal(note, localize(chinese[index], 'en'));
    assert.equal(/\p{Script=Han}/u.test(note), false);
  });
  const changedOptions = { ...context.options, normalizeEmail: !context.options.normalizeEmail };
  const applied = { ...context.requirements, text: context.requirements.appliedText, fingerprint };
  const assessment = assessRequirements(applied, applied.text, context.columns, changedOptions);
  assert.equal(assessment.status, 'overridden');
  const rows = buildReportTables({ ...context, requirements: assessment }).at(-1).rows;
  assert.equal(rows.some(row => row[0] === 'Applied requirement'), false);
  assert.ok(rows.some(row => row[0] === 'Earlier rule draft (check current configuration)'));
  assert.match(requirementNote({ ...context.requirements, unresolved: [] }), /review them in the field settings/);
  assert.equal(getLocale(), 'en');
});

test('Report errors and split audit names follow the current language while preserving table contents', () => {
  const context = makeContext();
  assert.throws(() => buildReportTables({}), /请先运行清洗/);
  setLocale('en');
  assert.throws(() => buildReportTables({}), /Run cleaning first/);
  assert.throws(() => buildJSONReport({}), /Run cleaning first/);
  const changeTable = buildReportTables(context)[2];
  const table = { ...changeTable, rows: Array.from({ length: 5 }, (_, i) => [String(i), '字段', '保留', '保留', '原文']) };
  const split = splitReportTables([table], 2);
  assert.deepEqual(split.map(part => part.name), ['Change log_1', 'Change log_2', 'Change log_3']);
  assert.deepEqual(split.flatMap(part => part.rows), table.rows);
  assert.ok(split.every(part => part.headers === table.headers));
});
