import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, TYPES, TYPE_MARKS, BASE_RULES, EXAMPLES, EN_EXAMPLES, getExample } from '../dist/presets.js';
import { DEFAULT_OPTIONS, inferColumns, suggestDuplicateKeys, parseRequirements, cleanData } from '../dist/engine.js';
import { getLocale, setLocale, localize } from '../dist/i18n.js';

test('preset metadata, field types, and base rules support both UI languages', () => {
  const previousLocale = getLocale();
  try {
    const messages = [
      ...PRESETS.flatMap(preset => [preset.name, preset.description, preset.hint]),
      ...Object.values(TYPES),
      ...BASE_RULES.flatMap(rule => [rule.title, rule.note]),
    ];
    const chinese = messages.map(message => localize(message, 'zh-CN'));
    const english = messages.map(message => localize(message, 'en'));
    assert.equal(messages.length, 32);
    for (let index = 0; index < messages.length; index++) {
      assert.notEqual(english[index], chinese[index]);
      assert.ok(english[index].length > 0);
      assert.doesNotMatch(english[index], /[\u4E00-\u9FFF]/);
      assert.equal(localize(english[index], 'zh-CN'), chinese[index]);
    }
    setLocale('en');
    assert.deepEqual(messages.map(message => localize(message)), english);
    assert.match(localize(TYPES.phone), /Mainland China/);
    setLocale('zh-CN');
    assert.deepEqual(messages.map(message => localize(message)), chinese);
    assert.equal(TYPE_MARKS.date, 'D');
    assert.deepEqual(PRESETS.map(preset => preset.id), ['generic', 'customer', 'education', 'product']);
    assert.deepEqual(BASE_RULES.map(rule => rule.key), ['trim', 'normalizePhone', 'normalizeEmail', 'normalizeDate', 'normalizeNumber', 'dropEmptyRows', 'normalizeWidth']);
  } finally {
    setLocale(previousLocale);
  }
});

test('English fixtures have the agreed headers, complete rows, and fictional English values', () => {
  const expectedHeaders = {
    education: ['Student ID', 'Name', 'Course', 'Phone', 'Email', 'Enrollment Date', 'Amount'],
    customer: ['Customer ID', 'Customer Name', 'Contact', 'Phone', 'Email', 'Created At', 'Region'],
    product: ['Product Code', 'Product Name', 'Variant', 'Unit', 'Price', 'Listed Date'],
    generic: ['Record ID', 'Name', 'Email', 'Date', 'Quantity'],
  };
  for (const [id, headers] of Object.entries(expectedHeaders)) {
    const example = getExample(id, 'en');
    assert.deepEqual(example.headers, headers, id);
    assert.equal(example.rows.length, EXAMPLES[id].rows.length, id);
    assert.equal(example.rows.length, EN_EXAMPLES[id].rows.length, id);
    assert.ok(example.rows.every(row => row.length === headers.length), id);
    assert.ok(example.rows.every(row => row.every(value => typeof value === 'string')), id);
    assert.doesNotMatch(JSON.stringify(example), /[\u4E00-\u9FFF]/, id);
    assert.match(example.name, /\.csv$/);
  }
});

test('every English example requirement resolves and preserves the Chinese fixture problem coverage', () => {
  const previousLocale = getLocale();
  try {
    setLocale('en');
    for (const id of Object.keys(EXAMPLES)) {
      const results = {};
      for (const locale of ['zh-CN', 'en']) {
        const example = getExample(id, locale);
        const columns = inferColumns(example.headers, example.rows, id);
        const options = { ...DEFAULT_OPTIONS, duplicateKeys: suggestDuplicateKeys(columns, id) };
        const draft = parseRequirements(example.requirements, columns, options);
        assert.deepEqual(draft.unresolved, [], `${id}: ${locale}`);
        assert.equal(draft.recognized.length, example.requirements.split(/[\n;；。]+/).filter(part => part.trim()).length, `${id}: ${locale}`);
        assert.deepEqual(draft.columns.map(column => column.name), example.headers, `${id}: ${locale}`);
        results[locale] = { columns: draft.columns, data: cleanData({ headers: example.headers, rows: example.rows, columns: draft.columns, options: draft.options }) };
      }
      const chinese = results['zh-CN'].data;
      const english = results.en.data;
      assert.deepEqual(english.stats, chinese.stats, id);
      assert.deepEqual(english.duplicates, chinese.duplicates, id);
      assert.deepEqual(english.issues.map(issue => [issue.sourceRow, issue.column, issue.code]), chinese.issues.map(issue => [issue.sourceRow, issue.column, issue.code]), id);
      assert.deepEqual(english.rows.map(row => row.status), chinese.rows.map(row => row.status), id);
      assert.deepEqual(results.en.columns.map(column => column.type), results['zh-CN'].columns.map(column => column.type), id);
      for (let column = 0; column < results.en.columns.length; column++) {
        if (!['id', 'phone', 'date', 'number'].includes(results.en.columns[column].type)) continue;
        assert.deepEqual(english.rows.map(row => row.values[column]), chinese.rows.map(row => row.values[column]), `${id}: column ${column}`);
      }
    }
  } finally {
    setLocale(previousLocale);
  }
});

test('getExample selects a language at load time and returns independent data copies', () => {
  const previousLocale = getLocale();
  const chineseOriginal = structuredClone(EXAMPLES);
  const englishOriginal = structuredClone(EN_EXAMPLES);
  try {
    setLocale('en');
    const loaded = getExample('education');
    const loadedSnapshot = structuredClone(loaded);
    assert.equal(loaded.headers[0], 'Student ID');
    setLocale('zh-CN');
    assert.deepEqual(loaded, loadedSnapshot);
    assert.equal(getExample('education').headers[0], '学号');
    assert.equal(getExample('education', 'en').headers[0], 'Student ID');
    loaded.headers[0] = 'Edited ID';
    loaded.rows[0][1] = 'Edited name';
    loaded.requirements = 'Edited requirement';
    assert.deepEqual(getExample('education', 'en'), englishOriginal.education);
    assert.deepEqual(getExample('education', 'zh-CN'), chineseOriginal.education);
    assert.deepEqual(EXAMPLES, chineseOriginal);
    assert.deepEqual(EN_EXAMPLES, englishOriginal);
    assert.equal(getExample('unknown', 'en'), undefined);
  } finally {
    setLocale(previousLocale);
  }
});
