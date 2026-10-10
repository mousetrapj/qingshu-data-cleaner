import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS, inferColumns, suggestDuplicateKeys, cleanData, parseRequirements } from '../dist/engine.js';
import { getLocale, setLocale, localize } from '../dist/i18n.js';

function run(headers, rows, options = {}, preset = 'generic', extra = {}) {
  return cleanData({ headers, rows, columns: inferColumns(headers, rows, preset), options, ...extra });
}

test('presets infer only present columns and preserve identifier semantics', () => {
  const columns = inferColumns(['学号', '姓名', '课程', '家长手机号', '报名日期', '金额'], [], 'education');
  assert.deepEqual(columns.map(column => [column.type, column.required]), [
    ['id', true], ['text', true], ['text', false], ['phone', false], ['date', false], ['number', false],
  ]);
  assert.deepEqual(suggestDuplicateKeys(columns, 'education'), [0, 2]);
  assert.deepEqual(suggestDuplicateKeys(inferColumns(['姓名', '课程'], [], 'education'), 'education'), []);
  assert.deepEqual(suggestDuplicateKeys(inferColumns(['手机号', '客户编号']), 'customer'), [1]);
  assert.deepEqual(suggestDuplicateKeys(inferColumns(['SKU', '产品名称']), 'product'), [0]);
  assert.deepEqual(suggestDuplicateKeys(columns, 'generic'), []);
});

test('all values stay strings; leading zeros and internal spaces remain intact', () => {
  const headers = ['学号', '姓名', '金额'];
  const rows = [[' 000123 ', ' 李 小明 ', '0']];
  const result = run(headers, rows, {}, 'education');
  assert.deepEqual(result.keptRows[0].values, ['000123', '李 小明', '0']);
  assert.equal(result.stats.changedCells, 2);
  assert.equal(result.stats.reviewRows, 0);
  assert.deepEqual(rows, [[' 000123 ', ' 李 小明 ', '0']]);
  assert.deepEqual(result.rows[0].original, rows[0]);
});

test('required checks report whitespace but accept zero', () => {
  const columns = [{ name: '值', outputName: '值', type: 'text', required: true }];
  const result = cleanData({ headers: ['值'], rows: [['0'], ['  ']], columns, options: { trim: false, dropEmptyRows: false } });
  assert.equal(result.rows[0].issues.length, 0);
  assert.equal(result.rows[1].issues[0].code, 'REQUIRED');
  assert.equal(result.rows[1].values[0], '  ');
});

test('valid mainland mobile phone formats normalize and invalid content is retained', () => {
  const result = run(['手机号'], [['+86 138-0013-8000'], ['0086-139 0013 8001'], ['+86 123'], ['13800138000转1'], ['13800138000']]);
  assert.deepEqual(result.rows.map(row => row.values[0]), ['13800138000', '13900138001', '+86 123', '13800138000转1', '13800138000']);
  assert.equal(result.stats.reviewRows, 2);
  assert.equal(result.rows[2].issues[0].code, 'PHONE_INVALID');
});

test('email normalization changes only the domain, preserving the local part', () => {
  const result = run(['邮箱'], [['Alice.Smith@EXAMPLE.COM'], ['ab@@example.com'], ['a@b..com'], ['a @example.com']]);
  assert.equal(result.rows[0].values[0], 'Alice.Smith@example.com');
  assert.equal(result.stats.reviewRows, 3);
  assert.deepEqual(result.rows.slice(1).map(row => row.values[0]), ['ab@@example.com', 'a@b..com', 'a @example.com']);
});

test('dates normalize only real year-first dates and preserve time and timezone', () => {
  const result = run(['报名日期'], [
    ['2024/2/29'], ['2026年1月2日'], ['2026.10.9'],
    ['2026/1/2 09:05:02.001'], ['2026-1-2T09:05:02+08:00'],
    ['2025/2/29'], ['2026/4/31'], ['01/02/2026'], ['10/11/12'],
    ['2026/1/2 25:00:00'], ['45292'], ['2026-1-2T09:05:02Z'],
  ]);
  assert.deepEqual(result.rows.slice(0, 5).map(row => row.values[0]), [
    '2024-02-29', '2026-01-02', '2026-10-09', '2026-01-02 09:05:02.001', '2026-01-02T09:05:02+08:00',
  ]);
  assert.equal(result.rows[5].issues[0].code, 'DATE_INVALID');
  assert.equal(result.rows[6].issues[0].code, 'DATE_INVALID');
  assert.equal(result.rows[7].issues[0].code, 'DATE_AMBIGUOUS');
  assert.equal(result.rows[8].issues[0].code, 'DATE_AMBIGUOUS');
  assert.equal(result.rows[9].values[0], '2026/1/2 25:00:00');
  assert.equal(result.rows[10].values[0], '45292');
  assert.equal(result.rows[11].values[0], '2026-01-02T09:05:02Z');
});

test('numbers retain full string precision, negative signs and trailing decimals', () => {
  const result = run(['金额'], [
    ['-9,007,199,254,740,993.00100'], ['+1,234.50'], ['0001.2300'], ['-.5000'], ['0'],
    ['1,23.00'], ['1234,567'], ['￥1,200'], ['1e10'], ['1 200'],
  ]);
  assert.deepEqual(result.rows.slice(0, 5).map(row => row.values[0]), [
    '-9007199254740993.00100', '+1234.50', '0001.2300', '-0.5000', '0',
  ]);
  assert.deepEqual(result.rows.slice(5).map(row => row.values[0]), ['1,23.00', '1234,567', '￥1,200', '1e10', '1 200']);
  assert.equal(result.stats.reviewRows, 5);
  assert.equal(result.rows[8].issues[0].code, 'NUMBER_SCIENTIFIC_NOTATION');
});

test('scientific identifiers and long numeric identifiers are flagged without guesses', () => {
  const result = run(['学号'], [['0000123'], ['1.23457E+17'], ['123456789012345678']], {}, 'education');
  assert.deepEqual(result.rows.map(row => row.values[0]), ['0000123', '1.23457E+17', '123456789012345678']);
  assert.equal(result.rows[0].issues.length, 0);
  assert.equal(result.rows[1].issues[0].code, 'ID_SCIENTIFIC_NOTATION');
  assert.equal(result.rows[2].issues[0].code, 'ID_PRECISION_RISK');
  assert.equal(result.stats.changedCells, 0);
});

test('fullwidth conversion is opt-in and limited to ASCII-width characters', () => {
  const rows = [['ＡＢＣ１２３　①é中文']];
  assert.equal(run(['文本'], rows, { trim: false }).rows[0].values[0], 'ＡＢＣ１２３　①é中文');
  assert.equal(run(['文本'], rows, { trim: false, normalizeWidth: true }).rows[0].values[0], 'ABC123 ①é中文');
});

test('re-running with all transforms disabled restores source values', () => {
  const headers = ['姓名', '手机号', '邮箱', '日期', '金额'];
  const rows = [[' 张三 ', '+86 138-0013-8000', 'Alice@EXAMPLE.COM', '2026/1/2', '1,234.500']];
  const columns = inferColumns(headers);
  const originalColumns = structuredClone(columns);
  const clean = cleanData({ headers, rows, columns });
  assert.equal(clean.stats.changedCells, 5);
  const unchanged = cleanData({ headers, rows, columns, options: {
    trim: false, normalizeWidth: false, normalizePhone: false, normalizeEmail: false, normalizeDate: false, normalizeNumber: false,
  } });
  assert.deepEqual(unchanged.rows[0].values, rows[0]);
  assert.equal(unchanged.stats.changedCells, 0);
  assert.deepEqual(columns, originalColumns);
});

test('incomplete business keys never participate in deletion', () => {
  const result = run(['学号', '课程', '姓名'], [['', '数学', '甲'], ['', '数学', '甲'], ['001', '', '乙'], ['001', '', '乙']], {
    duplicateKeys: [0, 1], duplicateMode: 'removeExact',
  }, 'education');
  assert.equal(result.stats.outputRows, 4);
  assert.equal(result.stats.duplicateRows, 0);
  assert.equal(result.stats.removedRows, 0);
  assert.ok(result.rows.every(row => row.issues.some(issue => issue.code === 'DUPLICATE_KEY_INCOMPLETE')));
});

test('joint keys cannot collide through delimiters inside cell contents', () => {
  const result = run(['学号', '课程', '姓名'], [['a|b', 'c', '甲'], ['a', 'b|c', '乙'], ['ab', 'c', '丙'], ['a', 'bc', '丁']], {
    duplicateKeys: [0, 1], duplicateMode: 'removeExact',
  });
  assert.equal(result.stats.duplicateGroups, 0);
  assert.equal(result.stats.outputRows, 4);
});

test('exact duplicates can be marked without being removed', () => {
  const result = run(['学号', '姓名'], [['001', '甲'], ['001', '甲']], { duplicateKeys: [0], duplicateMode: 'mark' }, 'education');
  assert.equal(result.stats.outputRows, 2);
  assert.equal(result.stats.duplicateGroups, 1);
  assert.equal(result.stats.duplicateRows, 1);
  assert.equal(result.rows[1].duplicateOf, 2);
  assert.equal(result.rows[1].status, 'duplicate');
  assert.deepEqual(result.duplicates, [{ sourceRow: 3, duplicateOf: 2, conflict: false, removed: false }]);
});

test('removeExact compares cleaned full rows and preserves original file row numbers', () => {
  const result = run(['学号', '姓名'], [['001', ' 甲 '], ['001', '甲']], { duplicateKeys: [0], duplicateMode: 'removeExact' }, 'education', { sourceRows: [5, 9] });
  assert.equal(result.stats.outputRows, 1);
  assert.equal(result.stats.removedRows, 1);
  assert.equal(result.rows[1].status, 'removed');
  assert.equal(result.rows[1].duplicateOf, 5);
  assert.equal(result.changes[0].sourceRow, 5);
  assert.equal(result.duplicates[0].sourceRow, 9);
});

test('any non-key conflict retains the entire group, even exact matches inside it', () => {
  const result = run(['学号', '课程', '姓名'], [['001', '数学', '甲'], ['001', '数学', '甲'], ['001', '数学', '乙']], {
    duplicateKeys: [0, 1], duplicateMode: 'removeExact',
  }, 'education');
  assert.equal(result.stats.outputRows, 3);
  assert.equal(result.stats.removedRows, 0);
  assert.equal(result.stats.reviewRows, 3);
  assert.equal(result.stats.duplicateRows, 2);
  assert.ok(result.rows.every(row => row.issues.some(issue => issue.code === 'DUPLICATE_CONFLICT')));
  assert.ok(result.duplicates.every(duplicate => duplicate.conflict && !duplicate.removed));
});

test('removeExact without business keys matches complete rows, including optional empty cells', () => {
  const result = run(['姓名', '备注'], [['甲', ''], ['甲', ''], ['乙', '']], { duplicateKeys: [], duplicateMode: 'removeExact' });
  assert.equal(result.stats.outputRows, 2);
  assert.equal(result.stats.duplicateRows, 1);
  assert.equal(result.issues.length, 0);
  assert.equal(run(['姓名'], [['甲'], ['甲']], { duplicateKeys: [], duplicateMode: 'mark' }).stats.duplicateRows, 0);
});

test('empty rows are counted and audited while zero rows remain', () => {
  const result = run(['值'], [[''], ['  '], ['0']], { dropEmptyRows: true });
  assert.equal(result.stats.emptyRows, 2);
  assert.equal(result.stats.removedRows, 2);
  assert.equal(result.stats.outputRows, 1);
  assert.equal(result.keptRows[0].values[0], '0');
  assert.deepEqual(result.rows.map(row => row.status), ['removed', 'removed', 'clean']);
});

test('flattened audit records provide source row, column, original and final strings', () => {
  const result = run(['姓名', '手机号'], [[' 张三 ', 'bad-phone']], {}, 'customer', { sourceRows: [12] });
  assert.deepEqual(result.changes[0], { sourceRow: 12, column: 0, columnName: '姓名', original: ' 张三 ', value: '张三', reason: '去除首尾空白' });
  assert.equal(result.issues[0].sourceRow, 12);
  assert.equal(result.issues[0].columnName, '手机号');
  assert.equal(result.issues[0].original, 'bad-phone');
  assert.equal(result.issues[0].value, 'bad-phone');
  assert.equal(result.stats.issueCount, result.issues.length);
});

test('ragged rows retain extra cells with a visible issue', () => {
  const result = run(['姓名'], [['甲', '不得丢失']]);
  assert.deepEqual(result.headers, ['姓名', '列2']);
  assert.deepEqual(result.keptRows[0].values, ['甲', '不得丢失']);
  assert.equal(result.issues[0].code, 'EXTRA_COLUMNS');
});

test('known requirements produce a complete rule draft without mutating inputs', () => {
  const columns = inferColumns(['学号', '姓名', '课程', '手机号', '邮箱', '报名日期', '金额'], [], 'generic');
  const options = { ...DEFAULT_OPTIONS, trim: false, duplicateKeys: [] };
  const sourceColumns = structuredClone(columns);
  const sourceOptions = structuredClone(options);
  const result = parseRequirements([
    '全表去首尾空格', '学号、姓名必填', '学号保留前导零',
    '手机号去+86空格', '邮箱域名小写', '报名日期统一为YYYY-MM-DD', '金额去除千分位',
    '按学号+课程检查重复', '仅删除完全相同重复行', '同键冲突保留', '空行删除', '将姓名重命名为学员姓名',
  ].join('；'), columns, options);
  assert.equal(result.recognized.length, 12);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.options.duplicateKeys, [0, 2]);
  assert.equal(result.options.duplicateMode, 'removeExact');
  assert.equal(result.options.trim, true);
  assert.equal(result.columns[0].required, true);
  assert.equal(result.columns[1].required, true);
  assert.equal(result.columns[1].outputName, '学员姓名');
  assert.deepEqual(columns, sourceColumns);
  assert.deepEqual(options, sourceOptions);
});

test('requirements support multiple quoted fields, explicit text IDs and renamed references', () => {
  const columns = inferColumns(['学号', '姓名', '手机号']);
  const result = parseRequirements('“学号”、“姓名”设为必填\n将学号设为文本编号。将姓名重命名为学员姓名；学员姓名必填', columns, {});
  assert.equal(result.recognized.length, 4);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.columns[0].type, 'id');
  assert.equal(result.columns[1].outputName, '学员姓名');
});

test('unknown requirements are never partially applied or called recognized', () => {
  const columns = inferColumns(['学号', '姓名', '邮箱', '手机号']);
  const options = { ...DEFAULT_OPTIONS, trim: false, normalizeEmail: false, duplicateKeys: [] };
  const result = parseRequirements([
    '全表去首尾空格并删除无效手机号',
    '所有邮箱转小写',
    '学号、不存在的列必填',
    '按学号检查重复并删除冲突',
    '自动补全缺失手机号',
    '将姓名重命名为学员姓名并删除手机号',
  ].join('；'), columns, options);
  assert.equal(result.recognized.length, 0);
  assert.equal(result.unresolved.length, 6);
  assert.deepEqual(result.columns, columns);
  assert.equal(result.options.trim, false);
  assert.equal(result.options.normalizeEmail, false);
  assert.deepEqual(result.options.duplicateKeys, []);
});

test('unsupported rename collisions are surfaced and do not change the draft', () => {
  const columns = inferColumns(['姓名', '手机号']);
  const result = parseRequirements('将姓名重命名为手机号', columns, {});
  assert.equal(result.recognized.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.deepEqual(result.columns, columns);
});

test('whole-row duplicate removal can be requested without inventing business keys', () => {
  const columns = inferColumns(['姓名', '备注']);
  const parsed = parseRequirements('仅删除完全相同重复行，同键冲突保留', columns, { duplicateKeys: [] });
  assert.equal(parsed.recognized.length, 1);
  assert.equal(parsed.options.duplicateMode, 'removeExact');
  assert.deepEqual(parsed.options.duplicateKeys, []);
  const result = cleanData({ headers: ['姓名', '备注'], rows: [['甲', ''], ['甲', '']], columns: parsed.columns, options: parsed.options });
  assert.equal(result.stats.outputRows, 1);
});

test('table-wide trim requirements support the action before the target fields', () => {
  const columns = inferColumns(['姓名']);
  for (const requirement of ['去除所有字段首尾空格', '去掉所有列的首尾空白', '全表去首尾空格']) {
    const parsed = parseRequirements(requirement, columns, { trim: false });
    assert.equal(parsed.recognized.length, 1, requirement);
    assert.deepEqual(parsed.unresolved, [], requirement);
    assert.equal(parsed.options.trim, true, requirement);
  }
  const unsupported = parseRequirements('去除所有字段首尾空格并删除异常', columns, { trim: false });
  assert.equal(unsupported.recognized.length, 0);
  assert.equal(unsupported.unresolved.length, 1);
  assert.equal(unsupported.options.trim, false);
});

test('phone requirements support both space/prefix orders and describe the full normalization', () => {
  const columns = inferColumns(['手机号']);
  for (const requirement of ['手机号去掉空格和 +86', '手机号去掉 +86 和空格', '手机号去掉空格', '手机号去除空白和0086']) {
    const parsed = parseRequirements(requirement, columns, { normalizePhone: false });
    assert.equal(parsed.recognized.length, 1, requirement);
    assert.deepEqual(parsed.unresolved, [], requirement);
    assert.equal(parsed.options.normalizePhone, true, requirement);
    assert.match(parsed.recognized[0].description, /\+86 \/ 0086 前缀/, requirement);
  }
  for (const requirement of ['手机号去掉空格和 +86 并删除异常', '手机号去掉空格并删除异常']) {
    const parsed = parseRequirements(requirement, columns, { normalizePhone: false });
    assert.equal(parsed.recognized.length, 0, requirement);
    assert.equal(parsed.unresolved.length, 1, requirement);
    assert.equal(parsed.options.normalizePhone, false, requirement);
  }
});

test('an unspecified deduplication request drafts mark-only rules and never guesses a survivor', () => {
  const headers = ['学号', '姓名', '课程'];
  const columns = inferColumns(headers);
  const parsed = parseRequirements('按学号+课程去重', columns, { duplicateKeys: [1], duplicateMode: 'removeExact' });
  assert.equal(parsed.recognized.length, 1);
  assert.deepEqual(parsed.unresolved, []);
  assert.deepEqual(parsed.options.duplicateKeys, [0, 2]);
  assert.equal(parsed.options.duplicateMode, 'mark');
  assert.match(parsed.recognized[0].description, /标记重复，保留所有记录/);
  const cleaned = cleanData({ headers, rows: [['001', '甲', '数学'], ['001', '甲', '数学']], columns: parsed.columns, options: parsed.options });
  assert.equal(cleaned.stats.outputRows, 2);
  assert.equal(cleaned.stats.duplicateRows, 1);
  assert.equal(cleaned.stats.removedRows, 0);
  const unsupported = parseRequirements('按学号+课程去重并保留最新记录', columns, { duplicateKeys: [], duplicateMode: 'mark' });
  assert.equal(unsupported.recognized.length, 0);
  assert.equal(unsupported.unresolved.length, 1);
  assert.deepEqual(unsupported.options.duplicateKeys, []);
});

test('common English headers infer types while preserving exact field names', () => {
  const headers = ['Record ID', 'Student ID', 'Student Name', 'Enrollment Date', 'Product Code', 'Listed Date', 'Contact Phone', 'Email Address', 'Amount'];
  const columns = inferColumns(headers, [], 'education');
  assert.deepEqual(columns.map(column => column.name), headers);
  assert.deepEqual(columns.map(column => column.outputName), headers);
  assert.deepEqual(columns.map(column => column.type), ['id', 'id', 'text', 'date', 'id', 'date', 'phone', 'email', 'number']);
  assert.equal(columns[1].required, true);
  assert.equal(columns[2].required, true);
  assert.deepEqual(suggestDuplicateKeys(inferColumns(['Student ID', 'Name', 'Course'], [], 'education'), 'education'), [0, 2]);
  assert.deepEqual(suggestDuplicateKeys(inferColumns(['Product Code', 'Product Name'], [], 'product'), 'product'), [0]);
});

test('complete English requirements draft and execute the same cleaning rules', () => {
  const previousLocale = getLocale();
  try {
    setLocale('en');
    const headers = ['Student ID', 'Name', 'Course', 'Phone', 'Email', 'Enrollment Date', 'Amount', 'Record ID'];
    const columns = inferColumns(headers);
    const options = { ...DEFAULT_OPTIONS, trim: false, normalizePhone: false, normalizeEmail: false, normalizeDate: false, normalizeNumber: false, dropEmptyRows: false, duplicateKeys: [] };
    const originalColumns = structuredClone(columns);
    const originalOptions = structuredClone(options);
    const requests = [
      'Trim leading/trailing whitespace',
      'Preserve leading zeros in Student ID',
      'Name and Student ID are required',
      'Check duplicates by Student ID + Course',
      'Remove exact duplicate rows',
      'Keep conflicting rows',
      'Remove blank rows',
      'Normalize Phone',
      'Lowercase email domains',
      'Normalize Enrollment Date to YYYY-MM-DD',
      'Remove thousands separators from Amount',
      'Rename Name to Student Name',
      'Convert Record ID to text',
    ];
    const parsed = parseRequirements(requests.join(';\n'), columns, options);
    assert.equal(parsed.recognized.length, requests.length);
    assert.deepEqual(parsed.unresolved, []);
    assert.deepEqual(parsed.recognized.map(rule => rule.text), requests);
    assert.ok(parsed.recognized.every(rule => !/[\u4E00-\u9FFF]/.test(rule.description)));
    assert.match(parsed.recognized[7].description, /Mainland China mobile/);
    assert.match(parsed.recognized[8].description, /domain after @/);
    assert.deepEqual(parsed.options.duplicateKeys, [0, 2]);
    assert.equal(parsed.options.duplicateMode, 'removeExact');
    assert.equal(parsed.columns[0].type, 'id');
    assert.equal(parsed.columns[0].required, true);
    assert.equal(parsed.columns[1].required, true);
    assert.equal(parsed.columns[1].outputName, 'Student Name');
    const rows = [
      [' 00012 ', ' Alice ', 'Math', '+86 138-0013-8000', 'Alice@EXAMPLE.COM', '2026/1/2 09:05:00', '-1,000.500', '0007'],
      ['00012', 'Alice', 'Math', '13800138000', 'Alice@example.com', '2026-01-02 09:05:00', '-1000.500', '0007'],
      ['', '', '', '', '', '', '', ''],
    ];
    const result = cleanData({ headers, rows, columns: parsed.columns, options: parsed.options });
    assert.equal(result.stats.outputRows, 1);
    assert.equal(result.stats.duplicateRows, 1);
    assert.equal(result.stats.emptyRows, 1);
    assert.deepEqual(result.keptRows[0].values, ['00012', 'Alice', 'Math', '13800138000', 'Alice@example.com', '2026-01-02 09:05:00', '-1000.500', '0007']);
    assert.deepEqual(columns, originalColumns);
    assert.deepEqual(options, originalOptions);
  } finally {
    setLocale(previousLocale);
  }
});

test('English column lists preserve names with spaces and quoted conjunctions', () => {
  const previousLocale = getLocale();
  try {
    setLocale('en');
    const columns = inferColumns(['Student ID', 'Student Name', 'Research and Development']);
    const parsed = parseRequirements('"Student Name" and "Research and Development" are required; Preserve leading zeros in Student ID; Rename Student Name to "Parent and Student"', columns, {});
    assert.equal(parsed.recognized.length, 3);
    assert.deepEqual(parsed.unresolved, []);
    assert.equal(parsed.columns[0].type, 'id');
    assert.equal(parsed.columns[1].required, true);
    assert.equal(parsed.columns[2].required, true);
    assert.equal(parsed.columns[1].outputName, 'Parent and Student');
    const incomplete = parseRequirements('Check duplicates by Student ID +', columns, {});
    assert.equal(incomplete.recognized.length, 0);
    assert.equal(incomplete.unresolved.length, 1);
    assert.deepEqual(incomplete.options.duplicateKeys, []);
  } finally {
    setLocale(previousLocale);
  }
});

test('English deduplicate means mark and keep every record until deletion is explicit', () => {
  const previousLocale = getLocale();
  try {
    setLocale('en');
    const headers = ['Student ID', 'Name', 'Course'];
    const columns = inferColumns(headers);
    const parsed = parseRequirements('Deduplicate by Student ID + Course', columns, { duplicateKeys: [1], duplicateMode: 'removeExact' });
    assert.equal(parsed.recognized.length, 1);
    assert.deepEqual(parsed.unresolved, []);
    assert.deepEqual(parsed.options.duplicateKeys, [0, 2]);
    assert.equal(parsed.options.duplicateMode, 'mark');
    assert.match(parsed.recognized[0].description, /keep all records/);
    const rows = [['001', 'Alice', 'Math'], ['001', 'Alice', 'Math']];
    const result = cleanData({ headers, rows, columns: parsed.columns, options: parsed.options });
    assert.equal(result.stats.outputRows, 2);
    assert.equal(result.stats.removedRows, 0);
    assert.equal(result.rows[1].status, 'duplicate');
  } finally {
    setLocale(previousLocale);
  }
});

test('English blank-row and width requests work in either UI language', () => {
  const previousLocale = getLocale();
  try {
    setLocale('zh-CN');
    const columns = inferColumns(['Name']);
    const keep = parseRequirements('Keep blank rows.', columns, { dropEmptyRows: true });
    assert.equal(keep.recognized.length, 1);
    assert.equal(keep.options.dropEmptyRows, false);
    assert.match(keep.recognized[0].description, /保留空白行/);
    const remove = parseRequirements('Remove blank rows; Convert fullwidth ASCII to halfwidth', columns, keep.options);
    assert.equal(remove.recognized.length, 2);
    assert.equal(remove.options.dropEmptyRows, true);
    assert.equal(remove.options.normalizeWidth, true);
    const exact = parseRequirements('Remove exact duplicate rows and keep conflicting rows', columns, {});
    assert.equal(exact.recognized.length, 1);
    assert.equal(exact.options.duplicateMode, 'removeExact');
  } finally {
    setLocale(previousLocale);
  }
});

test('Trim all fields trims only edges and rejects unsupported appended actions', () => {
  const columns = inferColumns(['Name']);
  const parsed = parseRequirements('Trim all fields', columns, { trim: false });
  assert.equal(parsed.recognized.length, 1);
  assert.deepEqual(parsed.unresolved, []);
  assert.equal(parsed.options.trim, true);
  const result = cleanData({ headers: ['Name'], rows: [['  Li Ming  ']], columns: parsed.columns, options: parsed.options });
  assert.equal(result.rows[0].values[0], 'Li Ming');
  const unsupported = parseRequirements('Trim all fields and delete invalid rows', columns, { trim: false });
  assert.equal(unsupported.recognized.length, 0);
  assert.equal(unsupported.unresolved.length, 1);
  assert.equal(unsupported.options.trim, false);
});

test('unsupported English suffixes and incomplete requirements are never partially applied', () => {
  const previousLocale = getLocale();
  try {
    setLocale('en');
    const columns = inferColumns(['Student ID', 'Name', 'Course', 'Phone', 'Email', 'Enrollment Date', 'Amount']);
    const options = { ...DEFAULT_OPTIONS, trim: false, normalizePhone: false, normalizeEmail: false, normalizeDate: false, normalizeNumber: false, dropEmptyRows: false, duplicateKeys: [] };
    const requests = [
      'Trim leading/trailing whitespace and delete invalid rows',
      'Preserve leading zeros in Student ID and delete invalid rows',
      'Name and Missing Column are required',
      'Check duplicates by Student ID + Course and delete invalid rows',
      'Deduplicate by Student ID + Course and keep latest',
      'Remove exact duplicate rows and delete conflicting rows',
      'Keep conflicting rows and delete invalid rows',
      'Normalize Phone and delete invalid rows',
      'Lowercase all emails',
      'Normalize Enrollment Date to YYYY-MM-DD and delete invalid rows',
      'Remove thousands separators from Amount and delete invalid rows',
      'Rename Name to Student Name and delete invalid rows',
      'Convert Student ID to text and delete invalid rows',
      'Remove blank rows and fill missing phones',
    ];
    const parsed = parseRequirements(requests.join(';\n'), columns, options);
    assert.equal(parsed.recognized.length, 0);
    assert.equal(parsed.unresolved.length, requests.length);
    assert.deepEqual(parsed.unresolved.map(rule => rule.text), requests);
    assert.deepEqual(parsed.columns, columns);
    assert.deepEqual(parsed.options, options);
    assert.ok(parsed.unresolved.every(rule => !/[\u4E00-\u9FFF]/.test(rule.reason)));
    assert.match(parsed.unresolved[8].reason, /whole address/);
  } finally {
    setLocale(previousLocale);
  }
});

test('language switches translate existing audit and rule messages without changing data', () => {
  const previousLocale = getLocale();
  try {
    const headers = ['Record ID', 'Name', 'Phone', 'Email', 'Enrollment Date', 'Amount'];
    const rows = [
      [' ００１ ', ' 张 三 ', '+86 138-0013-8000', ' Alice@EXAMPLE.COM ', '2026/1/2 09:05:00', '1,234.500'],
      ['001', '张三', 'invalid', 'broken', '01/02/2026', '￥1,200'],
      ['', '', '', '', '2025/2/29', '1e10'],
    ];
    const columns = inferColumns(headers).map((column, index) => ({ ...column, required: index < 2 }));
    const options = { normalizeWidth: true, duplicateKeys: [0], duplicateMode: 'removeExact' };
    const input = { headers, rows, columns, options, sourceRows: [12, 18, 25] };
    const inputSnapshot = structuredClone(input);
    const requirements = 'Name is required; Rename Name to Student Name; Missing Field is required; Invent missing values';
    setLocale('zh-CN');
    const chinese = cleanData(input);
    const chineseDraft = parseRequirements(requirements, columns, options);
    const savedChineseReason = chinese.changes[0].reason;
    assert.match(savedChineseReason, /全角.*；去除首尾空白/);
    setLocale('en');
    const english = cleanData(input);
    const englishDraft = parseRequirements(requirements, columns, options);
    assert.deepEqual(english.headers, chinese.headers);
    assert.deepEqual(english.stats, chinese.stats);
    assert.deepEqual(english.duplicates, chinese.duplicates);
    assert.deepEqual(english.rows.map(row => ({ sourceRow: row.sourceRow, original: row.original, values: row.values, removed: row.removed, duplicateOf: row.duplicateOf, status: row.status })),
      chinese.rows.map(row => ({ sourceRow: row.sourceRow, original: row.original, values: row.values, removed: row.removed, duplicateOf: row.duplicateOf, status: row.status })));
    assert.deepEqual(englishDraft.columns, chineseDraft.columns);
    assert.deepEqual(englishDraft.options, chineseDraft.options);
    assert.deepEqual(input, inputSnapshot);
    assert.equal(chinese.changes[0].reason, savedChineseReason);
    for (let index = 0; index < chinese.changes.length; index++) {
      assert.equal(localize(chinese.changes[index].reason), english.changes[index].reason);
      assert.equal(localize(english.changes[index].reason, 'zh-CN'), chinese.changes[index].reason);
      assert.deepEqual({ ...english.changes[index], reason: '' }, { ...chinese.changes[index], reason: '' });
    }
    for (let index = 0; index < chinese.issues.length; index++) {
      assert.equal(localize(chinese.issues[index].message), english.issues[index].message);
      assert.equal(localize(english.issues[index].message, 'zh-CN'), chinese.issues[index].message);
      assert.deepEqual({ ...english.issues[index], message: '' }, { ...chinese.issues[index], message: '' });
    }
    for (let index = 0; index < chineseDraft.recognized.length; index++) {
      assert.equal(localize(chineseDraft.recognized[index].description), englishDraft.recognized[index].description);
      assert.equal(chineseDraft.recognized[index].text, englishDraft.recognized[index].text);
    }
    for (let index = 0; index < chineseDraft.unresolved.length; index++) {
      assert.equal(localize(chineseDraft.unresolved[index].reason), englishDraft.unresolved[index].reason);
    }
    const conflict = english.issues.find(issue => issue.code === 'DUPLICATE_CONFLICT');
    assert.match(conflict.message, /source row 12/);
    assert.match(englishDraft.recognized[1].description, /"Name" to "Student Name"/);
    setLocale('zh-CN');
    assert.equal(localize(english.changes[0].reason), savedChineseReason);
  } finally {
    setLocale(previousLocale);
  }
});
