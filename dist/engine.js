/**
 * 澄数 · 无依赖数据清洗引擎。
 * 所有处理均从传入的原始字符串开始；不会推断缺失值或进行浮点数转换。
 */

import { tr, localize } from './i18n.js';

export const DEFAULT_OPTIONS = Object.freeze({
  trim: true,
  normalizeWidth: false,
  normalizePhone: true,
  normalizeEmail: true,
  normalizeDate: true,
  normalizeNumber: true,
  dropEmptyRows: true,
  duplicateKeys: Object.freeze([]),
  duplicateMode: 'mark',
});

const TYPES = new Set(['text', 'id', 'phone', 'email', 'date', 'number']);
const asString = value => value == null ? '' : String(value);
const isBlank = value => asString(value).trim() === '';
const normalizeName = value => asString(value).trim().toLowerCase().replace(/[\s_\-()（）*＊]/g, '');
const clone = value => Array.isArray(value)
  ? value.map(clone)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
    : value;

const ID_NAME = /(?:编号|编码|证件号码|身份证号|订单号|学号|邮编)$|^(?:id|sku|code|(?:record|customer|student|product|order|course|enrollment|enrolment|registration|contact|employee)(?:id|code|number|no)|accountnumber|课程id|客户id|学生id|产品id|商品id)$/i;
const PHONE_NAME = /(?:手机|电话)|^(?:phone|mobile|telephone|cellphone|phonenumber|mobilenumber|parentphone|parentmobile|guardianphone|contactphone)$/i;
const EMAIL_NAME = /(?:邮箱|电子邮件|电邮)|^(?:email|emailaddress|contactemail|parentemail)$/i;
const DATE_NAME = /(?:日期|时间|生日|出生年月)|^(?:date|birthday|birthdate|dob|createdat|updatedat|createddate|updateddate|startdate|enddate|enrollmentdate|enrolmentdate|registrationdate|listeddate|listingdate|recorddate)$/i;
const NUMBER_NAME = /(?:金额|价格|单价|总价|数量|库存|学费|课时|分数|成绩|年龄|余额|费用|收入|支出|折扣率|税率)$|^(?:amount|totalamount|price|unitprice|listprice|total|quantity|qty|stock|fee|tuition|tuitionfee|score|age|balance|cost|discount|taxrate)$/i;

function typeFromName(name) {
  const key = normalizeName(name);
  if (ID_NAME.test(key)) return 'id';
  if (PHONE_NAME.test(key)) return 'phone';
  if (EMAIL_NAME.test(key)) return 'email';
  if (DATE_NAME.test(key)) return 'date';
  if (NUMBER_NAME.test(key)) return 'number';
  return 'text';
}

/** 保守地按表头识别类型，不通过样本猜测编号或日期。 */
export function inferColumns(headers, rows = [], preset = 'generic') {
  return headers.map(header => {
    const name = asString(header);
    const key = normalizeName(name);
    let required = false;
    if (preset === 'education') {
      required = /^(?:学号|学生编号|学生编码|学员编号|学员编码|学生id|studentid|studentno|studentnumber|姓名|学生姓名|学员姓名|studentname|name)$/.test(key);
    } else if (preset === 'customer') {
      required = /^(?:客户名称|客户姓名|姓名|公司名称|企业名称|customername|companyname|contactname|name)$/.test(key);
    } else if (preset === 'product') {
      required = /^(?:商品编码|产品编码|商品编号|产品编号|商品id|产品id|sku|productid|productcode|商品名称|产品名称|productname)$/.test(key);
    }
    return { name, outputName: name, type: typeFromName(name), required };
  });
}

function findColumn(columns, candidates) {
  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    const index = columns.findIndex(column => [column.name, column.outputName].some(name => normalizeName(name) === key));
    if (index !== -1) return index;
  }
  return -1;
}

/** 只建议业务上较明确的依据；找不到时不退化到姓名。 */
export function suggestDuplicateKeys(columns, preset = 'generic') {
  if (preset === 'education') {
    const student = findColumn(columns, ['学号', '学生编号', '学员编号', '学生编码', '学员编码', 'studentId', 'studentNo', '学生ID']);
    if (student === -1) return [];
    const course = findColumn(columns, ['课程', '课程名称', '课程编号', '课程编码', 'course', 'courseName', 'courseId']);
    return course === -1 ? [student] : [student, course];
  }
  if (preset === 'customer') {
    const customer = findColumn(columns, ['客户编号', '客户编码', '客户ID', 'customerId', 'customerCode']);
    if (customer !== -1) return [customer];
    const phone = findColumn(columns, ['手机号', '手机号码', '联系电话', '手机', 'phone', 'mobile', 'phoneNumber']);
    return phone === -1 ? [] : [phone];
  }
  if (preset === 'product') {
    const product = findColumn(columns, ['商品编码', '产品编码', 'SKU', '商品编号', '产品编号', 'productCode', 'productId']);
    return product === -1 ? [] : [product];
  }
  return [];
}

function toHalfWidth(value) {
  return value.replace(/[\uFF01-\uFF5E\u3000]/g, char => char === '\u3000'
    ? ' '
    : String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

function normalizePhone(value) {
  const candidate = value.trim().replace(/[\s-]/g, '').replace(/^(?:\+86|0086)/, '');
  if (!/^1[3-9]\d{9}$/.test(candidate)) {
    return { valid: false, code: 'PHONE_INVALID', message: tr('不符合中国大陆手机号的基础格式；未猜测或修正号码。', 'Does not match the basic format of a Mainland China mobile number; the number was not guessed or corrected.') };
  }
  return { valid: true, value: candidate, reason: tr('规范手机号（去除空格、短横线及 +86 / 0086 前缀）', 'Normalize Mainland China mobile number (remove spaces, hyphens, and +86 / 0086 prefixes)') };
}

function normalizeEmail(value) {
  const candidate = value.trim();
  const parts = candidate.split('@');
  const [local, domain] = parts;
  const validDomain = domain && domain.split('.').length > 1 && domain.split('.').every(label =>
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
  if (parts.length !== 2 || !local || /[\s<>(),;:\[\]"\\]/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !validDomain) {
    return { valid: false, code: 'EMAIL_INVALID', message: tr('邮箱基础结构异常；请核对 @、域名和空格。', 'Invalid email structure; check the @ sign, domain, and spaces.') };
  }
  return { valid: true, value: `${local}@${domain.toLowerCase()}`, reason: tr('仅将邮箱域名转为小写，保留 @ 前的大小写', 'Lowercase only the email domain; preserve the case before @') };
}

function validCalendarDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function validTimeSuffix(suffix) {
  if (suffix === '') return true;
  const time = suffix.match(/^[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:([Zz])|([+-])(\d{2}):?(\d{2}))?$/);
  if (!time) return false;
  if (+time[1] > 23 || +time[2] > 59 || (time[3] != null && +time[3] > 59)) return false;
  if (time[6] != null && (+time[6] > 14 || +time[7] > 59 || (+time[6] === 14 && +time[7] !== 0))) return false;
  return true;
}

function normalizeDate(value) {
  const candidate = value.trim();
  let match = candidate.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(.*)$/);
  let year, month, day, suffix;
  if (match) {
    [, year, , month, day, suffix] = match;
  } else {
    match = candidate.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?(.*)$/);
    if (match) [, year, month, day, suffix] = match;
  }
  if (!match) {
    const ambiguous = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:$|[ T])/.test(candidate);
    return {
      valid: false,
      code: ambiguous ? 'DATE_AMBIGUOUS' : 'DATE_UNRECOGNIZED',
      message: ambiguous
        ? tr('月日在前的日期存在格式歧义；请确认年、月、日顺序，原值保留。', 'A date with the month or day first can be ambiguous; confirm the year, month, and day order. The original value was kept.')
        : tr('只自动处理年份在前的明确日期；此值未识别，原值保留。', 'Only unambiguous dates with the year first are handled automatically; this value was not recognized and was kept.'),
    };
  }
  if (!validCalendarDate(+year, +month, +day)) {
    return { valid: false, code: 'DATE_INVALID', message: tr('日期不存在（请核对月份、天数和闰年），原值保留。', 'This date does not exist; check the month, day, and leap year. The original value was kept.') };
  }
  if (!validTimeSuffix(suffix)) {
    return { valid: false, code: 'DATE_TIME_INVALID', message: tr('日期含未识别或无效的时间信息；为避免丢失时间，原值保留。', 'The date contains unrecognized or invalid time information; the original value was kept to avoid losing time data.') };
  }
  return {
    valid: true,
    value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}${suffix}`,
    reason: suffix
      ? tr('统一日期为 YYYY-MM-DD，保留完整时间及其时区', 'Normalize date to YYYY-MM-DD; retain the complete time and timezone')
      : tr('统一日期为 YYYY-MM-DD', 'Normalize date to YYYY-MM-DD'),
  };
}

function normalizeNumber(value) {
  const candidate = value.trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(candidate)) {
    return { valid: false, code: 'NUMBER_SCIENTIFIC_NOTATION', message: tr('科学记数法未自动展开；请提供明确的十进制原值。', 'Scientific notation was not expanded automatically; provide the explicit decimal source value.') };
  }
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(candidate)) {
    return { valid: false, code: 'NUMBER_INVALID', message: tr('不是明确的十进制数字或千分位格式有误；货币符号等不会被猜测删除。', 'Not an explicit decimal number, or thousands separators are malformed; currency symbols and other content were not removed by guesswork.') };
  }
  const normalized = candidate.replace(/,/g, '').replace(/^([+-]?)\./, (_, sign) => `${sign}0.`);
  return { valid: true, value: normalized, reason: tr('规范十进制数字、移除正确的千分位逗号，保留符号及全部精度', 'Normalize decimal notation and remove valid thousands separators; retain signs and full precision') };
}

function identifierIssue(value) {
  const candidate = value.trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(candidate)) {
    return { code: 'ID_SCIENTIFIC_NOTATION', message: tr('编号呈科学记数法，可能已丢失位数或前导零；已按原文本保留，请核对源数据。', 'This identifier uses scientific notation and may have lost digits or leading zeros; its original text was kept. Check the source data.') };
  }
  if (/^\d{16,}$/.test(candidate)) {
    return { code: 'ID_PRECISION_RISK', message: tr('长数字编号已按文本完整保留；请核对源文件是否曾以数值存储而丢失精度。', 'The long numeric identifier was kept as text; check whether numeric storage in the source file may have lost precision.') };
  }
  return null;
}

function mergedOptions(options = {}) {
  return { ...DEFAULT_OPTIONS, ...clone(options), duplicateKeys: [...(options.duplicateKeys || [])] };
}

/**
 * 清洗并生成可追溯的逐行结果。
 * - 显式业务键有空值时不参与重复检测。
 * - removeExact 且未指定业务键时按整行精确匹配，允许可选单元格为空。
 * - 显式业务键冲突时整组保留，包括组内恰好完全相同的记录。
 */
export function cleanData({ headers = [], rows = [], columns, options = {}, sourceRows } = {}) {
  const settings = mergedOptions(options);
  const inputHeaders = headers.map(asString);
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), Math.max(inputHeaders.length, columns?.length || 0));
  const inputColumns = columns || inferColumns(inputHeaders, rows);
  const schema = Array.from({ length: width }, (_, index) => {
    const fallbackName = inputHeaders[index] || `列${index + 1}`;
    const column = inputColumns[index] || {};
    return {
      name: column.name == null ? fallbackName : asString(column.name),
      outputName: column.outputName == null ? fallbackName : asString(column.outputName),
      type: TYPES.has(column.type) ? column.type : 'text',
      required: Boolean(column.required),
    };
  });
  const outputHeaders = schema.map(column => column.outputName);
  const duplicateKeys = [...new Set(settings.duplicateKeys.filter(index => Number.isInteger(index) && index >= 0 && index < width))];
  const normalizers = {
    phone: [normalizePhone, 'normalizePhone'],
    email: [normalizeEmail, 'normalizeEmail'],
    date: [normalizeDate, 'normalizeDate'],
    number: [normalizeNumber, 'normalizeNumber'],
  };
  let emptyRows = 0;

  const results = rows.map((inputRow, rowIndex) => {
    const original = Array.from({ length: width }, (_, index) => asString(inputRow[index]));
    const sourceRow = sourceRows?.[rowIndex] ?? rowIndex + 2;
    const empty = original.every(isBlank);
    if (empty) emptyRows++;
    const result = { sourceRow, original, values: [], changes: [], issues: [], duplicateOf: null, removed: Boolean(empty && settings.dropEmptyRows), status: 'clean' };
    if (inputRow.length > inputHeaders.length && inputHeaders.length > 0) {
      result.issues.push({ column: null, code: 'EXTRA_COLUMNS', message: tr('此行单元格数多于原表头；额外数据已保留为补充列，请核对。', 'This row has more cells than the original header; extra values were kept in additional columns. Check the source data.') });
    }

    for (let index = 0; index < width; index++) {
      const before = original[index];
      let value = before;
      const reasons = [];
      if (settings.normalizeWidth) {
        const changed = toHalfWidth(value);
        if (changed !== value) reasons.push(tr('全角 ASCII 字符和全角空格转半角', 'Convert fullwidth ASCII characters and spaces to halfwidth'));
        value = changed;
      }
      if (settings.trim) {
        const changed = value.trim();
        if (changed !== value) reasons.push(tr('去除首尾空白', 'Trim leading and trailing whitespace'));
        value = changed;
      }
      const column = schema[index];
      if (!result.removed) {
        if (isBlank(value)) {
          if (column.required) result.issues.push({ column: index, code: 'REQUIRED', message: tr('必填字段为空；没有猜测或补造内容。', 'This required field is blank; no value was guessed or invented.') });
        } else if (column.type === 'id') {
          const issue = identifierIssue(value);
          if (issue) result.issues.push({ column: index, ...issue });
        } else if (normalizers[column.type]) {
          const [normalizer, enabledOption] = normalizers[column.type];
          const normalized = normalizer(value);
          if (!normalized.valid) {
            result.issues.push({ column: index, code: normalized.code, message: normalized.message });
          } else if (settings[enabledOption] && normalized.value !== value) {
            value = normalized.value;
            reasons.push(normalized.reason);
          }
        }
      }
      result.values.push(value);
      if (value !== before) result.changes.push({
        column: index,
        before,
        after: value,
        // Register the complete combined reason for later language switches.
        reason: tr(reasons.map(reason => localize(reason, 'zh-CN')).join('；'), reasons.map(reason => localize(reason, 'en')).join('; ')),
      });
    }
    return result;
  });

  const duplicates = [];
  let duplicateGroups = 0;
  const exactWholeRow = settings.duplicateKeys.length === 0 && settings.duplicateMode === 'removeExact';
  if (duplicateKeys.length || exactWholeRow) {
    const groups = new Map();
    for (const row of results) {
      if (row.removed) continue;
      if (!exactWholeRow && duplicateKeys.some(index => isBlank(row.values[index]))) {
        row.issues.push({ column: null, code: 'DUPLICATE_KEY_INCOMPLETE', message: tr('重复检查依据不完整；此行未参与重复判断，也不会因重复而删除。', 'The duplicate key is incomplete; this row was excluded from duplicate detection and will not be removed as a duplicate.') });
        continue;
      }
      const key = JSON.stringify(exactWholeRow ? row.values : duplicateKeys.map(index => row.values[index]));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      duplicateGroups++;
      const first = group[0];
      const firstValues = JSON.stringify(first.values);
      const conflict = group.some(row => JSON.stringify(row.values) !== firstValues);
      if (conflict) {
        for (const row of group) {
          row.issues.push({ column: null, code: 'DUPLICATE_CONFLICT', message: tr(`与同一依据的记录存在字段冲突（首条为原始第 ${first.sourceRow} 行）；整组保留，请人工核对。`, `Records with the same key contain conflicting values (first record: source row ${first.sourceRow}); the entire group was kept for review.`) });
        }
      }
      for (const row of group.slice(1)) {
        row.duplicateOf = first.sourceRow;
        row.removed = !conflict && settings.duplicateMode === 'removeExact';
        duplicates.push({ sourceRow: row.sourceRow, duplicateOf: first.sourceRow, conflict, removed: row.removed });
      }
    }
  }

  const changes = [];
  const issues = [];
  for (const row of results) {
    row.status = row.removed ? 'removed' : row.issues.length ? 'review' : row.duplicateOf !== null ? 'duplicate' : row.changes.length ? 'changed' : 'clean';
    for (const change of row.changes) changes.push({
      sourceRow: row.sourceRow,
      column: change.column,
      columnName: outputHeaders[change.column],
      original: change.before,
      value: change.after,
      reason: change.reason,
    });
    for (const issue of row.issues) issues.push({
      sourceRow: row.sourceRow,
      column: issue.column,
      columnName: issue.column == null ? '' : outputHeaders[issue.column],
      original: issue.column == null ? '' : row.original[issue.column],
      value: issue.column == null ? '' : row.values[issue.column],
      code: issue.code,
      message: issue.message,
    });
  }
  const keptRows = results.filter(row => !row.removed);
  return {
    headers: outputHeaders,
    rows: results,
    keptRows,
    changes,
    issues,
    duplicates,
    stats: {
      inputRows: results.length,
      outputRows: keptRows.length,
      changedRows: results.filter(row => row.changes.length > 0).length,
      changedCells: changes.length,
      reviewRows: keptRows.filter(row => row.issues.length > 0).length,
      issueCount: issues.length,
      duplicateGroups,
      duplicateRows: duplicates.length,
      removedRows: results.length - keptRows.length,
      emptyRows,
    },
  };
}

function stripQuotes(value) {
  const text = value.trim();
  const pairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['「', '」'], ['【', '】'], ['[', ']'], ['`', '`']];
  const pair = pairs.find(([start, end]) => text.startsWith(start) && text.endsWith(end));
  return pair ? text.slice(pair[0].length, -pair[1].length).trim() : text;
}

function resolveOneColumn(expression, columns) {
  const raw = stripQuotes(expression);
  const variants = [
    raw,
    stripQuotes(raw.replace(/^(?:列|字段)\s*/, '').replace(/\s*(?:列|字段)$/, '')),
    stripQuotes(raw.replace(/^(?:column|field)\s+/i, '').replace(/\s+(?:column|field)$/i, '')),
  ];
  for (const variant of variants) {
    const key = normalizeName(variant);
    const matches = columns.map((column, index) => ({ column, index })).filter(({ column }) =>
      [column.name, column.outputName].some(name => normalizeName(name) === key));
    if (matches.length === 1) return { index: matches[0].index };
    if (matches.length > 1) return { error: tr(`列名“${raw}”对应多个字段，请先明确列名。`, `Column name "${raw}" matches multiple fields; specify an unambiguous column name.`) };
  }
  return { error: tr(`没有找到列“${raw}”；请使用当前表格中的列名。`, `Column "${raw}" was not found; use a name from the current table.`) };
}

/** Split outside quoted names, preserving spaces and conjunctions inside names. */
function splitColumnTargets(expression) {
  const quoteEnds = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['「', '」'], ['【', '】'], ['[', ']'], ['`', '`']]);
  const parts = [];
  let current = '';
  let quoteEnd = null;
  for (let index = 0; index < expression.length; index++) {
    const character = expression[index];
    if (quoteEnd) {
      current += character;
      if (character === quoteEnd) quoteEnd = null;
      continue;
    }
    if (!current.trim() && quoteEnds.has(character)) {
      quoteEnd = quoteEnds.get(character);
      current += character;
      continue;
    }
    const conjunction = expression.slice(index).match(/^\s+and\s+/i);
    if (conjunction || /[+,，、&/和与及]/.test(character)) {
      parts.push(current.trim());
      current = '';
      if (conjunction) index += conjunction[0].length - 1;
      continue;
    }
    current += character;
  }
  if (quoteEnd) return { error: tr('列名的引号没有闭合，请检查完整列名。', 'A quoted column name is not closed; check the complete column name.') };
  parts.push(current.trim());
  if (parts.some(part => !part)) return { error: tr('列名列表不完整，请明确每个字段。', 'The column list is incomplete; specify every field.') };
  return { parts };
}

function resolveColumns(expression, columns, genericType) {
  const target = expression.trim().replace(/^(?:将|把)\s*/, '');
  const direct = resolveOneColumn(target, columns);
  if (!direct.error) return { indices: [direct.index] };
  const genericNames = {
    phone: /^(?:(?:所有|全部)?(?:手机号|手机号码|手机|电话)(?:列|字段)?|(?:(?:all|the)\s+)?(?:phone|mobile)(?:\s+(?:numbers?|columns?|fields?))?)$/i,
    email: /^(?:(?:所有|全部)?(?:邮箱|电子邮箱|电子邮件|email)(?:列|字段)?|(?:(?:all|the)\s+)?emails?(?:\s+(?:addresses|columns?|fields?))?)$/i,
    date: /^(?:(?:所有|全部)?(?:日期|日期时间)(?:列|字段)?|(?:(?:all|the)\s+)?dates?(?:\s+(?:columns?|fields?))?)$/i,
    number: /^(?:(?:所有|全部)?(?:金额|数字|数值)(?:列|字段)?|(?:(?:all|the)\s+)?(?:amounts?|numbers?|numeric)(?:\s+(?:columns?|fields?))?)$/i,
  };
  if (genericType && genericNames[genericType].test(target)) {
    const indices = columns.map((column, index) => ({ column, index })).filter(({ column }) => column.type === genericType).map(({ index }) => index);
    return indices.length ? { indices } : { error: tr('当前表格没有对应类型的字段；请明确指定一个现有列名。', 'No matching field type was found in the current table; specify an existing column name.') };
  }
  const split = splitColumnTargets(target);
  if (split.error) return { error: split.error };
  const { parts } = split;
  if (parts.length <= 1) return { error: direct.error };
  const indices = [];
  for (const part of parts) {
    const resolved = resolveOneColumn(part, columns);
    if (resolved.error) return { error: resolved.error };
    indices.push(resolved.index);
  }
  return { indices: [...new Set(indices)] };
}

const labelColumns = (columns, indices, locale = 'zh-CN') => indices.map(index => {
  const name = columns[index].outputName || columns[index].name;
  return locale === 'en' ? `"${name}"` : `“${name}”`;
}).join(locale === 'en' ? ', ' : '、');

/**
 * Complete English statements map to the same deterministic actions as Chinese.
 * Captured column names are preserved and still must resolve against the schema.
 */
function canonicalEnglishRequirement(statement) {
  const text = statement.trim().replace(/\.$/, '');
  let match;
  if (/^trim\s+all\s+(?:fields|columns)$/i.test(text)) return '全表去首尾空格';
  if (/^(?:trim|remove)\s+leading(?:\s*\/\s*|\s+and\s+)trailing\s+(?:whitespace|spaces)(?:\s+(?:from|in)\s+(?:all\s+)?(?:fields|columns))?$/i.test(text)) return '全表去首尾空格';
  if (/^(?:convert|normalize|normalise)\s+fullwidth(?:\s+ASCII)?(?:\s+characters)?\s+to\s+halfwidth$/i.test(text)) return '全角转半角';
  if (/^(?:remove|delete|drop)\s+(?:all\s+)?(?:blank|empty)\s+rows$/i.test(text)) return '删除空行';
  if (/^keep\s+(?:all\s+)?(?:blank|empty)\s+rows$/i.test(text)) return '保留空行';
  if (/^(?:remove|delete)\s+(?:only\s+)?exact\s+duplicate\s+(?:rows|records)(?:\s+and\s+keep\s+(?:all\s+)?conflicting\s+(?:rows|records))?$/i.test(text)) return '仅删除完全相同重复行';
  if (/^keep\s+(?:all\s+)?conflicting\s+(?:rows|records)$/i.test(text)) return '同键冲突保留';
  if ((match = text.match(/^(?:preserve|keep)\s+leading\s+zeros\s+(?:in|for|of)\s+(.+)$/i))) return `${match[1]}保留前导零`;
  if ((match = text.match(/^(.+?)\s+(?:(?:is|are|must\s+be)\s+)?required$/i))) return `${match[1]}必填`;
  if ((match = text.match(/^(?:check(?:\s+for)?|mark|find|detect)\s+duplicates\s+(?:by|using|on)\s+(.+)$/i))
    || (match = text.match(/^deduplicate\s+(?:by|using|on)\s+(.+)$/i))) return `按${match[1]}检查重复`;
  if ((match = text.match(/^(?:convert|set|treat)\s+(.+?)\s+(?:to|as)\s+(?:text|a\s+text\s+identifier)(?:\s+and\s+preserve\s+leading\s+zeros)?$/i))) {
    return `${match[1]}转为${/identifier|leading\s+zeros/i.test(text) ? '文本编号' : '文本'}`;
  }
  if ((match = text.match(/^rename\s+(.+?)\s+to\s+(.+)$/i))) return `${match[1]}重命名为${match[2]}`;
  if ((match = text.match(/^normali[sz]e\s+(.+?)\s+to\s+YYYY-MM-DD$/i))) return `${match[1]}统一为YYYY-MM-DD`;
  if ((match = text.match(/^(?:remove|strip)\s+(?:valid\s+)?thousands\s+separators\s+from\s+(.+)$/i))) return `${match[1]}去除千分位`;
  if ((match = text.match(/^(?:lowercase|lower\s+case)\s+(?:the\s+)?(?:email\s+)?domains?\s+(?:of|in|for)\s+(.+)$/i))
    || (match = text.match(/^(?:lowercase|lower\s+case)\s+(.+?)\s+domains?$/i))) return `${match[1]}域名小写`;
  if ((match = text.match(/^normali[sz]e\s+(.+?)\s+as\s+(?:a\s+)?Mainland\s+China\s+mobile(?:\s+numbers?)?$/i))) return `${match[1]}规范化为手机号`;
  if ((match = text.match(/^(?:remove|strip)\s+(?:spaces|whitespace)(?:\s+and\s+(?:\+86|0086))?\s+from\s+(.+)$/i))
    || (match = text.match(/^(?:remove|strip)\s+(?:\+86|0086)\s+and\s+(?:spaces|whitespace)\s+from\s+(.+)$/i))) return `${match[1]}去掉空格`;
  if ((match = text.match(/^normali[sz]e\s+(.+)$/i))) return `${match[1]}规范化`;
  return null;
}

function applyRequirement(statement, columns, options) {
  statement = canonicalEnglishRequirement(statement) ?? statement;
  const compact = statement.replace(/\s+/g, '');
  let match;
  if (/^(?:(?:全表|所有(?:字段|列)|全部(?:字段|列)|各(?:字段|列))(?:都)?)?(?:去|去除|去掉|删除|清除)(?:首尾|两端|前后)(?:空格|空白)$/.test(compact)
    || /^(?:去|去除|去掉|删除|清除)(?:全表|所有(?:字段|列)|全部(?:字段|列)|各(?:字段|列))(?:的)?(?:首尾|两端|前后)(?:空格|空白)$/.test(compact)) {
    options.trim = true;
    return { description: tr('全表去除首尾空白，保留内容内部的空格。', 'Trim leading and trailing whitespace from all fields; keep spaces inside the values.') };
  }
  if (/^(?:全表|所有字段|所有列)?全角(?:字符)?转(?:为)?半角$/.test(compact)) {
    options.normalizeWidth = true;
    return { description: tr('全角 ASCII 字符及全角空格转半角；不改其他 Unicode 字符。', 'Convert fullwidth ASCII characters and spaces to halfwidth; leave other Unicode characters unchanged.') };
  }
  if (/^(?:(?:删除|移除|去掉|清除)(?:全空|空白|空)(?:行|记录)|(?:全空|空白|空)行(?:删除|移除))$/.test(compact)) {
    options.dropEmptyRows = true;
    return { description: tr('删除所有单元格均为空白的行，保留原始行号和删除记录。', 'Remove rows whose cells are all blank; keep source row numbers and a deletion audit.') };
  }
  if (/^(?:保留|不删除)(?:空白|空)行$/.test(compact)) {
    options.dropEmptyRows = false;
    return { description: tr('保留空白行；必填检查仍会指出缺失内容。', 'Keep blank rows; required-field checks will still report missing values.') };
  }
  if (/^仅(?:删除|移除)(?:完全相同|完全一致)(?:的)?重复(?:行|记录|数据)(?:[,，](?:同键冲突|同键但内容不同)(?:全部)?保留)?$/.test(compact)) {
    options.duplicateMode = 'removeExact';
    return { description: options.duplicateKeys.length
      ? tr('按当前依据检查重复，仅删除整行清洗值完全一致的后续记录；同键冲突整组保留。', 'Check duplicates using the selected keys. Remove later rows only when their complete cleaned values match; keep entire groups with conflicting values.')
      : tr('未选择业务依据，按整行精确匹配并删除完全一致的后续记录；不会按相似程度合并。', 'No business key is selected. Remove later rows only when all cleaned values match exactly; do not merge similar records.') };
  }
  if (/^(?:同键冲突|同键但内容不同|同一依据存在冲突)(?:的)?(?:行|记录|数据)?(?:全部|一律)?保留$/.test(compact)) {
    return { description: tr('同一重复依据下存在字段冲突时，整个分组保留并提示；这是始终启用的保护规则。', 'Keep and flag the entire group when records share a duplicate key but have conflicting field values. This protection is always enabled.') };
  }

  // 重命名只接收完整的一条指令，拒绝将后续动作误当作新列名。
  if ((match = statement.match(/^(?:将|把)?\s*(.+?)\s*重命名为\s*(.+)$/))) {
    const resolved = resolveColumns(match[1], columns);
    if (resolved.error) return { error: resolved.error };
    if (resolved.indices.length !== 1) return { error: tr('一次重命名需要明确指定一个原列名和一个新列名。', 'Rename one existing column to one new output name at a time.') };
    const rawOutputName = match[2].trim();
    const outputName = stripQuotes(rawOutputName);
    const quoted = rawOutputName !== outputName;
    if (!outputName || (!quoted && /[,，;；。\n]|并且|然后|同时|且|并(?:删除|去除|保留|检查|转|将|把)|\b(?:and|then|also)\b/i.test(outputName))) {
      return { error: tr('新列名中可能包含另一条动作，请用分号或换行拆开需求；名称本身包含连接词时请加引号。', 'The new name may contain another action. Separate requirements with semicolons or newlines; quote a literal name that contains a conjunction.') };
    }
    const index = resolved.indices[0];
    if (columns.some((column, other) => other !== index && normalizeName(column.outputName) === normalizeName(outputName))) {
      return { error: tr(`输出列名“${outputName}”已存在，请换一个名称。`, `Output column "${outputName}" already exists; choose a different name.`) };
    }
    const oldName = columns[index].outputName;
    columns[index].outputName = outputName;
    return { description: tr(`将输出列“${oldName}”重命名为“${outputName}”，保留原列和数据的对应关系。`, `Rename output column "${oldName}" to "${outputName}" while preserving its link to the original column and data.`) };
  }

  if ((match = statement.match(/^(?:按|以|根据)\s*(.+?)\s*(?:(?:检查|检测|标记|识别|查找)重复(?:数据|记录|行)?|去重)$/))) {
    const resolved = resolveColumns(match[1], columns);
    if (resolved.error) return { error: resolved.error };
    options.duplicateKeys = resolved.indices;
    options.duplicateMode = 'mark';
    return { description: tr(`按 ${labelColumns(columns, resolved.indices)} 的联合值标记重复，保留所有记录；此规则不删除重复行，依据缺失不参与判断。`, `Mark duplicates by the combined values of ${labelColumns(columns, resolved.indices, 'en')}; keep all records. This rule does not delete duplicate rows; records with missing keys are excluded.`) };
  }

  if ((match = statement.match(/^(?:将|把)?\s*(.+?)\s*(?:设为|设置为|标为|标记为|为)?(?:必填(?:项|字段)?|必须(?:填写|有值)|不能为空|不为空)$/))
    || (match = statement.match(/^必填(?:字段|列)?\s*[:：]\s*(.+)$/))) {
    const resolved = resolveColumns(match[1], columns);
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].required = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 设为必填；缺失只报告，不补造值。`, `Mark ${labelColumns(columns, resolved.indices, 'en')} as required; report missing values without inventing data.`) };
  }

  if ((match = statement.match(/^(?:将|把)?\s*(.+?)\s*(?:设为|设置为|作为|按|转为|转换为|为)\s*(文本编号|编号文本|文本型编号|文本|字符串)(?:处理|保存|保留)?(?:[,，]?\s*保留前导零)?$/))) {
    const resolved = resolveColumns(match[1], columns);
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) {
      columns[index].type = /编号|前导零/.test(statement) || columns[index].type === 'id' ? 'id' : 'text';
    }
    return { description: tr(`${labelColumns(columns, resolved.indices)} 按文本保留；源数据中已有的前导零不会转成数值。`, `Keep ${labelColumns(columns, resolved.indices, 'en')} as text; preserve leading zeros already present in the source.`) };
  }
  if ((match = statement.match(/^(.+?)\s*(?:保留|保持)前导零$/))
    || (match = statement.match(/^(?:保留|保持)\s*(.+?)(?:的)?前导零$/))) {
    const target = match[1].replace(/的$/, '');
    const resolved = resolveColumns(target, columns);
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].type = 'id';
    return { description: tr(`${labelColumns(columns, resolved.indices)} 作为文本编号保留前导零；不会猜测恢复已经丢失的位数。`, `Treat ${labelColumns(columns, resolved.indices, 'en')} as text identifiers and preserve leading zeros; do not guess digits already lost from the source.`) };
  }

  if ((match = statement.match(/^(.+?)\s*(?:规范化为手机号|按手机号(?:规范化|清洗)|统一为手机号格式)$/))) {
    const resolved = resolveColumns(match[1], columns);
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].type = 'phone';
    options.normalizePhone = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 按中国大陆手机号规范化；异常保留并提示。`, `Normalize ${labelColumns(columns, resolved.indices, 'en')} as Mainland China mobile numbers; retain and flag invalid values.`) };
  }
  if ((match = statement.match(/^(.+?)\s*(?:规范化|标准化)$/))
    || (match = statement.match(/^(.+?)\s*(?:去|去除|去掉)\s*(?:\+86|0086)\s*(?:和|与|及|、|,|，|\+)?\s*(?:空格|空白)$/))
    || (match = statement.match(/^(.+?)\s*(?:去|去除|去掉)\s*(?:空格|空白)(?:\s*(?:和|与|及|、|,|，|\+)?\s*(?:\+86|0086))?$/))) {
    const resolved = resolveColumns(match[1], columns, 'phone');
    if (resolved.error) return { error: resolved.error };
    if (resolved.indices.some(index => columns[index].type !== 'phone' && typeFromName(columns[index].name) !== 'phone')) {
      return { error: tr('请明确需要规范化的数据类型，例如“联系电话规范化为手机号”。', 'Specify the data type to normalize, for example "Normalize Contact Phone as Mainland China mobile".') };
    }
    for (const index of resolved.indices) columns[index].type = 'phone';
    options.normalizePhone = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 去除手机号空格、短横线和 +86 / 0086 前缀；只处理基础格式有效的中国大陆手机号。`, `For ${labelColumns(columns, resolved.indices, 'en')}, remove spaces, hyphens, and +86 / 0086 prefixes from valid Mainland China mobile numbers; keep invalid values unchanged.`) };
  }

  if ((match = statement.match(/^(.+?)(?:的)?\s*(?:仅|只)?域名(?:部分)?\s*(?:转为|转|统一为|转换为|改为)?小写$/))) {
    const resolved = resolveColumns(match[1], columns, 'email');
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].type = 'email';
    options.normalizeEmail = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 仅将 @ 后的域名转为小写，保留 @ 前的大小写。`, `For ${labelColumns(columns, resolved.indices, 'en')}, lowercase only the domain after @; preserve the case before @.`) };
  }

  if ((match = statement.match(/^(.+?)\s*(?:统一(?:为|成)?|规范(?:为|成)?)\s*(?:日期(?:格式)?|YYYY-MM-DD)(?:格式)?$/i))) {
    const resolved = resolveColumns(match[1], columns, 'date');
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].type = 'date';
    options.normalizeDate = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 按真实的年在前日期统一为 YYYY-MM-DD；保留时间，歧义日期不改。`, `Normalize valid year-first dates in ${labelColumns(columns, resolved.indices, 'en')} to YYYY-MM-DD; retain time information and leave ambiguous dates unchanged.`) };
  }

  if ((match = statement.match(/^(.+?)\s*(?:去除|去掉|删除)\s*(?:数字)?千分位(?:逗号|分隔符)?$/))
    || (match = statement.match(/^(金额)\s*千分位(?:规范化|处理)?$/))) {
    const resolved = resolveColumns(match[1], columns, 'number');
    if (resolved.error) return { error: resolved.error };
    for (const index of resolved.indices) columns[index].type = 'number';
    options.normalizeNumber = true;
    return { description: tr(`${labelColumns(columns, resolved.indices)} 仅移除格式正确的千分位逗号，保留负号、小数尾零及长数字精度。`, `Remove only valid thousands separators from ${labelColumns(columns, resolved.indices, 'en')}; retain negative signs, trailing decimal zeros, and full numeric precision.`) };
  }

  if ((/(?:邮箱|email).*(?:全(?:部)?|所有|统一|转为|转).*小写/i.test(statement) && !statement.includes('域名'))
    || (/^(?:lowercase|lower\s+case)\b.*\bemails?\b/i.test(statement) && !/\bdomains?\b/i.test(statement))) {
    return { error: tr('当前只支持“邮箱域名转小写”；整段邮箱转小写可能改动 @ 前的标识，因此这条需求未执行。', 'Only email-domain lowercasing is supported. Lowercasing the whole address could alter the identifier before @, so this requirement was not applied.') };
  }
  return { error: tr('未匹配到完整的已支持规则；请拆成明确的单条指令，或在规则面板手动设置。', 'No complete supported rule matched. Split the request into explicit instructions, or configure the rule panel manually.') };
}

/** 确定性规则解析器。不会调用 AI，也不会把未知语句当作已执行。 */
export function parseRequirements(text, columns = [], options = {}) {
  let nextColumns = clone(columns);
  let nextOptions = mergedOptions(options);
  const recognized = [];
  const unresolved = [];
  const statements = asString(text).split(/[\n;；。]+/).map(part => part.trim()).filter(Boolean);
  for (const original of statements) {
    const statement = original.replace(/^(?:[-•*]\s+|\d+[、.)]\s*)/, '').trim();
    // 每条指令在副本上执行，解析失败不会留下半条规则的副作用。
    const draftColumns = clone(nextColumns);
    const draftOptions = mergedOptions(nextOptions);
    const applied = applyRequirement(statement, draftColumns, draftOptions);
    if (applied.error) {
      unresolved.push({ text: original, reason: applied.error });
    } else {
      nextColumns = draftColumns;
      nextOptions = draftOptions;
      recognized.push({ text: original, description: applied.description });
    }
  }
  return { columns: nextColumns, options: nextOptions, recognized, unresolved };
}
