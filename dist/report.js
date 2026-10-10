import { BASE_RULES, TYPES, PRESETS } from './presets.js';
import { tr, localize, getLocale } from './i18n.js';

export function configurationFingerprint(columns, options) {
  return JSON.stringify({
    columns: columns.map(c => ({ name: c.name, outputName: c.outputName, type: c.type, required: Boolean(c.required) })),
    options: Object.fromEntries([...BASE_RULES.map(r => [r.key, Boolean(options[r.key])]), ['duplicateMode', options.duplicateMode], ['duplicateKeys', [...(options.duplicateKeys || [])]]]),
  });
}

export function assessRequirements(applied, currentText, columns, options) {
  const text = String(currentText || '').trim();
  if (!applied) return { status: text ? 'pending' : 'none', text, recognized: [], unresolved: [] };
  const status = text !== applied.text.trim() ? 'edited'
    : applied.fingerprint !== configurationFingerprint(columns, options) ? 'overridden' : 'applied';
  return { status, text, appliedText: applied.text, recognized: applied.recognized.map(r => ({ ...r })), unresolved: applied.unresolved.map(r => ({ ...r })) };
}

export function requirementNote(assessment) {
  if (assessment.status === 'pending') return tr('需求文字尚未生成并应用草案；运行时仅执行当前面板规则。', 'The requirement text has not been turned into an applied draft. This run uses only the current panel rules.');
  if (assessment.status === 'edited') return tr('需求文字已修改，尚未重新应用；当前按面板规则执行。', 'The requirement text was edited and has not been applied again. The current panel rules are used.');
  if (assessment.status === 'overridden') return tr('草案之后又修改了规则，最终按当前面板执行；报告会保留原草案供核对。', 'The rules were changed after the draft was applied. The current panel rules are used, and the earlier draft is retained in the report for comparison.');
  if (assessment.status === 'applied') return assessment.unresolved.length
    ? tr(`已应用 ${assessment.recognized.length} 项需求规则；${assessment.unresolved.length} 项待确认，未自动执行`, `${assessment.recognized.length} requirement rules applied; ${assessment.unresolved.length} require review and were not executed automatically`)
    : tr(`已应用 ${assessment.recognized.length} 项需求规则；可在字段设置中核对`, `${assessment.recognized.length} requirement rules applied; review them in the field settings`);
  return '';
}

function reportPresetName(context) {
  const builtin = PRESETS.find(preset => preset.id === context.presetId);
  return builtin ? localize(builtin.name) : context.presetName;
}

function localizedRequirements(requirements) {
  if (!requirements) return requirements;
  return {
    ...requirements,
    recognized: (requirements.recognized || []).map(requirement => ({ ...requirement, description: localize(requirement.description) })),
    unresolved: (requirements.unresolved || []).map(requirement => ({ ...requirement, reason: localize(requirement.reason) })),
  };
}

export function resultCounts(result) {
  return {
    removedEmptyRows: result.rows.filter(row => row.removed && row.original.every(value => String(value).trim() === '')).length,
    reviewIssueCount: result.keptRows.reduce((count, row) => count + row.issues.length, 0),
  };
}

export function buildReportTables(context) {
  const { result: r, headers, columns, options, filename, sheetName, processedAt, importNotes = [], requirements } = context;
  if (!r) throw new Error(tr('请先运行清洗', 'Run cleaning first'));
  const issueRows = [], changeRows = [];
  for (const row of r.rows) {
    for (const issue of row.issues) issueRows.push([String(row.sourceRow), issue.column == null ? tr('整行', 'Entire row') : headers[issue.column], issue.column == null ? '' : String(row.original[issue.column] ?? ''), issue.column == null ? '' : String(row.values[issue.column] ?? ''), localize(issue.message), row.removed ? tr('已移除记录中的问题', 'Issue in a removed record') : tr('待确认', 'Needs review')]);
    for (const change of row.changes) changeRows.push([String(row.sourceRow), headers[change.column], String(change.before ?? ''), String(change.after ?? ''), localize(change.reason)]);
  }
  const s = r.stats, counts = resultCounts(r);
  const report = [
    [tr('处理时间（UTC）', 'Processed at (UTC)'), processedAt], [tr('源文件', 'Source file'), filename], [tr('工作表', 'Worksheet'), sheetName], [tr('预设', 'Preset'), reportPresetName(context)],
    [tr('输入记录', 'Input records'), s.inputRows], [tr('输出记录', 'Output records'), s.outputRows], [tr('规范化记录', 'Normalized records'), s.changedRows], [tr('单元格修改', 'Changed cells'), s.changedCells],
    [tr('待确认记录（未移除）', 'Records needing review (retained)'), s.reviewRows], [tr('保留记录中的问题', 'Issues in retained records'), counts.reviewIssueCount], [tr('问题总数（含移除记录）', 'Total issues (including removed records)'), s.issueCount],
    [tr('重复组', 'Duplicate groups'), s.duplicateGroups], [tr('重复记录（首条之外）', 'Duplicate records (excluding the first)'), s.duplicateRows], [tr('移除记录', 'Removed records'), s.removedRows],
    [tr('原有全空行', 'Originally empty rows'), s.emptyRows], [tr('移除记录中的全空行', 'Empty rows among removed records'), counts.removedEmptyRows],
    [tr('去重依据', 'Duplicate key'), options.duplicateKeys.length ? options.duplicateKeys.map(i => columns[i].name).join(' + ') : options.duplicateMode === 'removeExact' ? tr('按整行精确匹配', 'Exact match of the entire row') : tr('未设置', 'Not set')],
    [tr('重复处理', 'Duplicate handling'), options.duplicateMode === 'removeExact' ? tr('仅移除完全相同记录；同键冲突保留', 'Remove only identical records; retain conflicts with the same key') : tr('仅标记，全部保留', 'Mark only; retain all records')],
    [tr('说明', 'Notes'), tr('清洗数据包含待确认记录；无可靠依据的信息未自动补齐。所有数据以文本单元格导出。', 'Cleaned data includes records that still need review. Missing information was not filled without reliable evidence. All data is exported as text cells.')],
  ];
  for (const rule of BASE_RULES) report.push([localize(rule.title), options[rule.key] ? tr('开启', 'On') : tr('关闭', 'Off')]);
  for (const note of [...new Set(importNotes.map(message => localize(message)))]) report.push([tr('导入说明', 'Import note'), note]);
  if (requirements) {
    if (requirements.text) report.push([tr('用户输入的需求', 'User requirement text'), requirements.text]);
    const note = requirementNote(requirements);
    if (note) report.push([tr('需求应用状态', 'Requirement application status'), note]);
    const label = requirements.status === 'applied' ? tr('已应用需求', 'Applied requirement') : tr('先前规则草案（请核对当前配置）', 'Earlier rule draft (check current configuration)');
    for (const req of requirements.recognized) report.push([label, `${req.text} → ${localize(req.description)}`]);
    for (const req of requirements.unresolved) report.push([tr('未执行需求', 'Unexecuted requirement'), tr(`${req.text}；${localize(req.reason, 'zh-CN')}`, `${req.text}; ${localize(req.reason, 'en')}`)]);
  }
  const removed = r.rows.filter(row => row.removed).map(row => [String(row.sourceRow), row.duplicateOf != null ? String(row.duplicateOf) : '', row.duplicateOf != null ? tr('完全相同的重复行', 'Identical duplicate row') : tr('全空行', 'Empty row'), ...row.original]);
  const duplicateRows = r.duplicates.map(d => [String(d.sourceRow), d.duplicateOf != null ? String(d.duplicateOf) : '', d.conflict ? tr('同键内容冲突', 'Conflicting values for the same key') : tr('相同键', 'Same key'), d.removed ? tr('已移除', 'Removed') : tr('保留', 'Retained')]);
  return [
    { name: tr('清洗数据', 'Cleaned data'), headers: r.headers, rows: r.keptRows.map(row => row.values) },
    { name: tr('待确认问题', 'Review issues'), headers: [tr('原文件行号', 'Source row'), tr('字段', 'Field'), tr('原始值', 'Original value'), tr('处理后值', 'Processed value'), tr('问题说明', 'Issue'), tr('记录状态', 'Record status')], rows: issueRows },
    { name: tr('修改明细', 'Change log'), headers: [tr('原文件行号', 'Source row'), tr('字段', 'Field'), tr('原始值', 'Original value'), tr('处理后值', 'Processed value'), tr('处理规则', 'Applied rule')], rows: changeRows },
    { name: tr('重复检查', 'Duplicate check'), headers: [tr('原文件行号', 'Source row'), tr('关联原行', 'Related source row'), tr('检查结果', 'Check result'), tr('处理方式', 'Action')], rows: duplicateRows },
    { name: tr('移除记录', 'Removed records'), headers: [tr('原文件行号', 'Source row'), tr('保留原行', 'Retained source row'), tr('移除原因', 'Removal reason'), ...headers], rows: removed },
    { name: tr('字段规则', 'Field rules'), headers: [tr('原字段', 'Original field'), tr('导出名称', 'Output name'), tr('类型', 'Type'), tr('必填', 'Required'), tr('去重依据', 'Duplicate key')], rows: columns.map((c, i) => [c.name, c.outputName, localize(TYPES[c.type]), c.required ? tr('是', 'Yes') : tr('否', 'No'), options.duplicateKeys.includes(i) ? tr('是', 'Yes') : tr('否', 'No')]) },
    { name: tr('处理报告', 'Processing report'), headers: [tr('项目', 'Item'), tr('内容', 'Content')], rows: report.map(row => row.map(String)) },
  ];
}

export function splitReportTables(tables, maxRows = 250000) {
  return tables.flatMap(table => {
    if (table.rows.length <= maxRows) return [table];
    const chunks = [];
    for (let start = 0; start < table.rows.length; start += maxRows) chunks.push({ name: `${table.name}_${chunks.length + 1}`, headers: table.headers, rows: table.rows.slice(start, start + maxRows) });
    return chunks;
  });
}

export function buildJSONReport(context) {
  if (!context.result) throw new Error(tr('请先运行清洗', 'Run cleaning first'));
  return {
    tool: 'Qingshu Data Cleaner',
    version: '1.1',
    language: getLocale(),
    source: context.filename,
    sheet: context.sheetName,
    processedAt: context.processedAt,
    stats: { ...context.result.stats, ...resultCounts(context.result) },
    options: context.options,
    fields: context.columns,
    requirements: localizedRequirements(context.requirements),
    importNotes: (context.importNotes || []).map(note => localize(note)),
  };
}
