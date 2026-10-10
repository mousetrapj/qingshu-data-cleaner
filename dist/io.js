/** Local-only spreadsheet I/O. No file content leaves this browser. */
import { tr, localize } from './i18n.js';

export const LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 50000,
  maxColumns: 100,
});

// Audit worksheets can be wider and longer than the uploaded source table.
// They are output artifacts; the smaller browser input limits remain unchanged.
export const OUTPUT_LIMITS = Object.freeze({ maxRows: 250000, maxColumns: 128 });

const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
const MAX_XML_PART_BYTES = 64 * 1024 * 1024;
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function asText(value) {
  return value == null ? '' : String(value);
}

function positiveLimit(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function uniqueHeaders(raw, width, notes) {
  const originals = Array.from({ length: width }, (_, i) => asText(raw[i]).trim());
  const reserved = new Set(originals.filter(Boolean));
  const used = new Set();
  let empty = 0;
  let duplicates = 0;
  let trimmed = 0;
  const headers = originals.map((original, index) => {
    if (raw[index] != null && asText(raw[index]) !== original) trimmed++;
    let name = original;
    if (!name) {
      empty++;
      const base = tr(`未命名列 ${index + 1}`, `Unnamed column ${index + 1}`);
      name = base;
      let n = 2;
      while (used.has(name) || reserved.has(name)) name = `${base}_${n++}`;
    } else if (used.has(name)) {
      duplicates++;
      let n = 2;
      do { name = `${original}_${n++}`; } while (used.has(name) || reserved.has(name));
    }
    used.add(name);
    return name;
  });
  if (empty) notes.push(tr(`${empty} 个空列名已独立命名为“未命名列 …”。`, `Blank column headers given unique “Unnamed column …” names: ${empty}.`));
  if (duplicates) notes.push(tr(`${duplicates} 个重复列名已添加独立编号，原列数据全部保留。`, `Duplicate column headers given unique suffixes: ${duplicates}. All column data was retained.`));
  if (trimmed) notes.push(tr(`${trimmed} 个列名已去除首尾空白；数据内容尚未清洗。`, `Column headers with leading or trailing whitespace trimmed: ${trimmed}. Data values have not been cleaned.`));
  return headers;
}

function finishRecords(records, sourceRows, notes, maxColumns) {
  if (!records.length) return { headers: [], rows: [], sourceRows: [], notes };
  let width = 0;
  for (const record of records) width = Math.max(width, record.length);
  if (width > maxColumns) throw new Error(tr(`文件有 ${width} 列，当前最多支持 ${maxColumns} 列。请先拆分文件。`, `This file has ${width} columns; the current input limit is ${maxColumns}. Split the file before importing.`));
  const rawHeaders = records[0];
  if (width > rawHeaders.length) {
    notes.push(tr(`数据行比表头多 ${width - rawHeaders.length} 列，已补充列名，未截断任何单元格。`, `Data rows have ${width - rawHeaders.length} more columns than the header. Extra headers were added; no cells were truncated.`));
  }
  const headers = uniqueHeaders(rawHeaders, width, notes);
  const rows = records.slice(1).map(row => Array.from({ length: width }, (_, i) => asText(row[i])));
  return { headers, rows, sourceRows: sourceRows.slice(1), notes };
}

function normalizeDelimiter(delimiter) {
  const aliases = { comma: ',', tab: '\t', semicolon: ';', '\\t': '\t' };
  const resolved = aliases[delimiter] ?? delimiter;
  if (![',', '\t', ';'].includes(resolved)) {
    throw new Error(tr('请选择逗号、制表符或分号作为分隔符。', 'Choose a comma, tab, or semicolon as the delimiter.'));
  }
  return resolved;
}

function detectDelimiter(text) {
  const candidates = [',', '\t', ';'];
  const samples = [];
  let counts = [0, 0, 0];
  let quoted = false;
  let meaningful = false;
  for (let i = 0; i < text.length && samples.length < 25; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { meaningful = true; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === '\r' || ch === '\n')) {
      if (meaningful) samples.push(counts);
      counts = [0, 0, 0];
      meaningful = false;
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      if (!quoted) {
        const candidate = candidates.indexOf(ch);
        if (candidate !== -1) counts[candidate]++;
      }
      if (quoted || !candidates.includes(ch)) meaningful = true;
    }
  }
  if (meaningful && samples.length < 25) samples.push(counts);
  if (!samples.length) return ',';
  let best = ',';
  let bestScore = -1;
  candidates.forEach((candidate, index) => {
    const first = samples[0][index];
    if (!first) return;
    const matching = samples.filter(row => row[index] === first).length;
    const nonzero = samples.filter(row => row[index] > 0).length;
    const score = matching / samples.length * 1000 + nonzero * 10 + Math.min(first, 50);
    if (score > bestScore) { best = candidate; bestScore = score; }
  });
  return best;
}

/** Parse RFC-style CSV/TSV. Source row numbers refer to physical input lines. */
export function parseDelimited(text, options = {}) {
  text = asText(text).replace(/^\uFEFF/, '');
  const maxRows = positiveLimit(options.maxRows, LIMITS.maxRows);
  const maxColumns = positiveLimit(options.maxColumns, LIMITS.maxColumns);
  const delimiter = !options.delimiter || options.delimiter === 'auto'
    ? detectDelimiter(text) : normalizeDelimiter(options.delimiter);
  const records = [];
  const origins = [];
  const notes = [];
  let record = [];
  let field = '';
  let state = 'start';
  let line = 1;
  let recordStart = 1;
  let quoteStart = 1;
  let recordTouched = false;
  let skippedBlank = 0;
  let preservedBlank = 0;

  const pushField = () => {
    record.push(field);
    if (record.length > maxColumns) {
      throw new Error(tr(`原文件第 ${recordStart} 行超过 ${maxColumns} 列。请检查分隔符或拆分文件。`, `Source line ${recordStart} exceeds ${maxColumns} columns. Check the delimiter or split the file.`));
    }
    field = '';
    state = 'start';
  };
  const pushRecord = () => {
    pushField();
    const empty = record.every(value => value === '');
    if (empty && !records.length) skippedBlank++;
    else {
      if (empty) preservedBlank++;
      records.push(record);
      origins.push(recordStart);
      if (records.length > maxRows + 1) {
        throw new Error(tr(`数据超过 ${maxRows.toLocaleString('zh-CN')} 行（不含表头），请拆分后导入。`, `Data exceeds ${maxRows.toLocaleString('en-US')} rows, excluding the header. Split the file before importing.`));
      }
    }
    record = [];
    recordTouched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') { field += '\r\n'; i++; }
        else field += ch;
        line++;
      } else field += ch;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      recordTouched = true;
    } else if (ch === '\r' || ch === '\n') {
      pushRecord();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      recordStart = line;
    } else if (state === 'closed') {
      throw new Error(tr(`原文件第 ${line} 行：结束引号后出现了多余字符。引号后只能是分隔符或换行；也请确认分隔符设置。`, `Source line ${line}: extra characters after a closing quote. A closing quote must be followed by a delimiter or line break; also check the delimiter setting.`));
    } else if (ch === '"') {
      if (state !== 'start' || field.length) {
        throw new Error(tr(`原文件第 ${line} 行：未转义的双引号。含引号的字段需要用双引号包围，内部引号写成两个双引号。`, `Source line ${line}: unescaped double quote. Wrap the field in double quotes and escape each quote inside it as two double quotes.`));
      }
      state = 'quoted';
      quoteStart = line;
      recordTouched = true;
    } else {
      state = 'unquoted';
      field += ch;
      recordTouched = true;
    }
  }
  if (state === 'quoted') {
    throw new Error(tr(`原文件第 ${quoteStart} 行开始的双引号没有闭合。请检查该字段的结束引号。`, `The quoted field starting on source line ${quoteStart} is not closed. Check its closing quote.`));
  }
  if (recordTouched || field.length || record.length || state === 'closed') pushRecord();
  if (skippedBlank) notes.push(tr(`已跳过表头前 ${skippedBlank} 条完全空白的记录；原文件行号已保留。`, `Empty records before the header skipped: ${skippedBlank}. Original source line numbers were retained.`));
  if (preservedBlank) notes.push(tr(`已保留表头后 ${preservedBlank} 条完全空白的记录；是否删除由清洗规则决定。`, `Empty records after the header retained: ${preservedBlank}. Cleaning rules determine whether they are removed.`));
  return { ...finishRecords(records, origins, notes, maxColumns), delimiter };
}

function decodeFileBytes(bytes, requestedEncoding) {
  const notes = [];
  let encoding = requestedEncoding === 'utf8' ? 'utf-8' : requestedEncoding;
  if (!encoding || encoding === 'auto') {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
    else {
      try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', notes };
      } catch {
        encoding = 'gb18030';
        notes.push(tr('UTF-8 解码未通过，已按 GB18030 读取；如有乱码，请选择正确编码后重新导入。', 'UTF-8 decoding failed, so the file was read as GB18030. If text appears garbled, select the correct encoding and import again.'));
      }
    }
  }
  if (!['utf-8', 'gb18030', 'gbk', 'utf-16le', 'utf-16be'].includes(encoding)) {
    throw new Error(tr('不支持此编码。请选择自动检测、UTF-8 或 GB18030。', 'This encoding is not supported. Choose automatic detection, UTF-8, or GB18030.'));
  }
  try {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding, notes };
  } catch {
    throw new Error(tr(`无法按 ${encoding.toUpperCase()} 解码此文件。请更换编码，或将原文件另存为 UTF-8 CSV。`, `The file cannot be decoded as ${encoding.toUpperCase()}. Choose another encoding or save the source file as UTF-8 CSV.`));
  }
}

function localName(name) { return name.split(':').pop(); }

function attribute(node, name) {
  if (Object.prototype.hasOwnProperty.call(node.attributes, name)) return node.attributes[name];
  const key = Object.keys(node.attributes).find(key => localName(key) === name);
  return key ? node.attributes[key] : undefined;
}

function parseXML(xml, label, handlers = {}) {
  if (!globalThis.sax?.parser) throw new Error(tr('Excel 解析组件未加载，请刷新页面后重试。', 'The Excel parser has not loaded. Refresh the page and try again.'));
  const parser = globalThis.sax.parser(true, { trim: false, normalize: false, strictEntities: true });
  parser.ondoctype = () => { throw new Error(tr(`${localize(label, 'zh-CN')} 含不支持的 DTD 声明。`, `${localize(label, 'en')} contains an unsupported DTD declaration.`)); };
  parser.onerror = error => { throw new Error(tr(`${localize(label, 'zh-CN')} 的 XML 结构损坏：${error.message.split('\n')[0]}`, `${localize(label, 'en')} has malformed XML: ${error.message.split('\n')[0]}`)); };
  parser.onopentag = node => handlers.open?.(localName(node.name), node);
  parser.onclosetag = name => handlers.close?.(localName(name));
  parser.ontext = value => handlers.text?.(value);
  parser.oncdata = value => handlers.text?.(value);
  for (let start = 0; start < xml.length; start += 32768) parser.write(xml.slice(start, start + 32768));
  parser.close();
}

function resolvePart(basePath, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  let decoded;
  try { decoded = decodeURIComponent(target.split('#')[0]); }
  catch { decoded = target.split('#')[0]; }
  const parts = decoded.startsWith('/') ? [] : basePath.split('/').slice(0, -1);
  for (const item of decoded.replace(/\\/g, '/').split('/')) {
    if (!item || item === '.') continue;
    if (item === '..') {
      if (!parts.length) throw new Error(tr('Excel 文件包含无效的内部部件路径。', 'The Excel file contains an invalid internal part path.'));
      parts.pop();
    } else parts.push(item);
  }
  return parts.join('/');
}

function relationshipsPath(part) {
  const index = part.lastIndexOf('/');
  return `${index < 0 ? '' : part.slice(0, index + 1)}_rels/${part.slice(index + 1)}.rels`;
}

function decodeXMLBytes(bytes) {
  let encoding = 'utf-8';
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
  else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
  else if (bytes[0] === 0x3C && bytes[1] === 0x00) encoding = 'utf-16le';
  else if (bytes[0] === 0x00 && bytes[1] === 0x3C) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error(tr('Excel 内部 XML 文本编码损坏，请用原表格软件重新保存文件。', 'The Excel file contains invalid XML text encoding. Save it again using the original spreadsheet app.')); }
}

function makePartReader(zip) {
  let expanded = 0;
  const cache = new Map();
  return async function readPart(path, required = false) {
    if (cache.has(path)) return cache.get(path);
    const part = zip.file(path);
    if (!part) {
      if (required) throw new Error(tr(`Excel 文件缺少必要部件：${path}。请重新另存为 .xlsx。`, `The Excel file is missing a required part: ${path}. Save it again as .xlsx.`));
      return null;
    }
    const bytes = await new Promise((resolve, reject) => {
      const chunks = [];
      let length = 0;
      let failed = false;
      const stream = part.internalStream('uint8array');
      stream.on('data', chunk => {
        if (failed) return;
        length += chunk.length;
        expanded += chunk.length;
        if (length > MAX_XML_PART_BYTES || expanded > MAX_EXPANDED_BYTES) {
          failed = true;
          stream.pause();
          chunks.length = 0;
          reject(new Error(tr('Excel 解压后内容过大（超过 80 MB 或单个部件超过 64 MB）。请删除多余格式、拆分工作簿后再导入。', 'The Excel content is too large after decompression: over 80 MB total or 64 MB for one part. Remove unnecessary formatting or split the workbook before importing.')));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', error => { if (!failed) reject(new Error(tr(`无法读取 Excel 部件 ${path}：${error.message}`, `Cannot read Excel part ${path}: ${error.message}`))); });
      stream.on('end', () => {
        if (failed) return;
        const result = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        resolve(result);
      });
      stream.resume();
    });
    const xml = decodeXMLBytes(bytes);
    // Only small workbook metadata is useful to retain after parsing.
    if (bytes.length < 256 * 1024) cache.set(path, xml);
    return xml;
  };
}

function readRelationships(xml, part) {
  const result = new Map();
  if (!xml) return result;
  parseXML(xml, tr('工作簿关系', 'Workbook relationships'), {
    open(name, node) {
      if (name !== 'Relationship') return;
      const id = attribute(node, 'Id');
      if (attribute(node, 'TargetMode') === 'External') return;
      const path = resolvePart(part, attribute(node, 'Target'));
      if (id && path) result.set(id, { path, type: attribute(node, 'Type') || '' });
    },
  });
  return result;
}

function decodeExcelText(text) {
  return text.replace(/_x([0-9a-fA-F]{4})_/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function readSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  let inItem = false;
  let inText = false;
  let phoneticDepth = 0;
  let value = '';
  parseXML(xml, tr('共享文本', 'Shared strings'), {
    open(name) {
      if (name === 'si') { inItem = true; value = ''; }
      if (inItem && name === 'rPh') phoneticDepth++;
      if (inItem && name === 't' && !phoneticDepth) inText = true;
    },
    text(text) { if (inText) value += text; },
    close(name) {
      if (name === 't') inText = false;
      if (name === 'rPh') phoneticDepth--;
      if (name === 'si') {
        strings.push(decodeExcelText(value));
        if (strings.length > 500000) throw new Error(tr('Excel 共享文本条目过多，请拆分文件。', 'The Excel file contains too many shared string entries. Split the file.'));
        inItem = false;
      }
    },
  });
  return strings;
}

const BUILTIN_FORMATS = new Map([
  [0, 'General'], [1, '0'], [2, '0.00'], [3, '#,##0'], [4, '#,##0.00'],
  [9, '0%'], [10, '0.00%'], [11, '0.00E+00'],
  [14, 'mm-dd-yy'], [15, 'd-mmm-yy'], [16, 'd-mmm'], [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'], [19, 'h:mm:ss AM/PM'], [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'm/d/yy h:mm'],
  [27, 'yyyy-mm-dd'], [28, 'yyyy-mm-dd'], [29, 'yyyy-mm-dd'], [30, 'm/d/yy'],
  [31, 'yyyy-mm-dd'], [32, 'h:mm'], [33, 'h:mm:ss'], [34, 'yyyy-mm'], [35, 'm-d'], [36, 'yyyy-mm'],
  [45, 'mm:ss'], [46, '[h]:mm:ss'], [47, 'mmss.0'],
  [50, 'yyyy-mm-dd'], [51, 'yyyy-mm-dd'], [52, 'yyyy-mm'], [53, 'm-d'],
  [54, 'yyyy-mm'], [55, 'yyyy-mm-dd'], [56, 'yyyy-mm-dd'], [57, 'yyyy-mm-dd'], [58, 'yyyy-mm-dd'],
]);

function readStyles(xml) {
  const formats = new Map(BUILTIN_FORMATS);
  const cells = [];
  let inCellXfs = false;
  if (xml) parseXML(xml, tr('单元格格式', 'Cell styles'), {
    open(name, node) {
      if (name === 'numFmt') formats.set(Number(attribute(node, 'numFmtId')), attribute(node, 'formatCode') || 'General');
      if (name === 'cellXfs') inCellXfs = true;
      if (name === 'xf' && inCellXfs) cells.push(Number(attribute(node, 'numFmtId') || 0));
    },
    close(name) { if (name === 'cellXfs') inCellXfs = false; },
  });
  return style => formats.get(cells[Number(style || 0)] || 0) || 'General';
}

function numericParts(raw) {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match || (!match[2] && !match[3])) return null;
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 400 || raw.length > 500) return null;
  let digits = `${match[2] || '0'}${match[3] || ''}`;
  let scale = (match[3] || '').length - exponent;
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  return { negative: match[1] === '-', digits, scale };
}

function expandNumeric(raw) {
  const parts = numericParts(raw);
  if (!parts) return raw;
  let digits = parts.digits.replace(/^0+(?=\d)/, '');
  if (parts.scale > 0) {
    digits = digits.padStart(parts.scale + 1, '0');
    digits = `${digits.slice(0, -parts.scale)}.${digits.slice(-parts.scale)}`;
    digits = digits.replace(/0+$/, '').replace(/\.$/, '');
  }
  return `${parts.negative && /[1-9]/.test(digits) ? '-' : ''}${digits}`;
}

function firstFormatSection(format, numericValue) {
  const sections = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < format.length; i++) {
    const ch = format[i];
    if (ch === '\\') { current += ch + (format[++i] || ''); continue; }
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) { sections.push(current); current = ''; }
    else current += ch;
  }
  sections.push(current);
  if (numericValue < 0 && sections.length > 1) return sections[1];
  if (numericValue === 0 && sections.length > 2) return sections[2];
  return sections[0];
}

function classifyFormat(format, numericValue) {
  // Conditional numeric sections require an Excel formatting evaluator. Keep the
  // stored number instead of applying a possibly incorrect display rule.
  if (/\[(?:[<>]=?|=)/.test(format)) return { date: false, time: false, elapsed: false, zeros: 0 };
  const section = firstFormatSection(format, numericValue);
  const stripped = section
    .replace(/"(?:[^"]|"")*"/g, '')
    .replace(/\\.|_.|\*./g, '')
    .replace(/\[([^\]]*)\]/g, (_, inner) => /^[hms]+$/i.test(inner) ? `[${inner}]` : '')
    .toLowerCase();
  const elapsed = /\[[hms]+\]/.test(stripped);
  const date = /[yd]/.test(stripped) || (/m/.test(stripped) && !/[hs]/.test(stripped));
  const time = /[hs]/.test(stripped) || elapsed || /am\/pm|a\/p/.test(stripped);
  const zeros = /^-?0+$/.test(stripped) ? (stripped.match(/0/g) || []).length : 0;
  return { date, time, elapsed, zeros, section };
}

function serialToText(raw, date1904, style, stats) {
  const parts = numericParts(raw);
  if (!parts || parts.negative) { stats.unsupportedDates++; return raw; }
  const denominator = 10n ** BigInt(parts.scale);
  const numerator = BigInt(parts.digits);
  const wholeDays = numerator / denominator;
  const fraction = numerator % denominator;
  // Decimal arithmetic preserves every fractional second actually stored in the
  // source, including precision below a millisecond; no local timezone is used.
  const secondNumerator = fraction * 86400n;
  const daySeconds = secondNumerator / denominator;
  const remainder = secondNumerator % denominator;
  const subsecond = remainder === 0n ? '' : remainder.toString().padStart(parts.scale, '0').replace(/0+$/, '');
  if (wholeDays > (date1904 ? 2957003n : 2958465n)) { stats.unsupportedDates++; return raw; }
  const formatTime = (totalSeconds, totalHours = false) => {
    const hours = totalHours ? totalSeconds / 3600n : (totalSeconds / 3600n) % 24n;
    const minutes = (totalSeconds / 60n) % 60n;
    const seconds = totalSeconds % 60n;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${subsecond ? `.${subsecond}` : ''}`;
  };
  if (style.elapsed) return formatTime(wholeDays * 86400n + daySeconds, true);
  let date;
  const days = Number(wholeDays);
  if (!date1904 && days === 60) {
    date = '1900-02-29';
    stats.excelLeapDay++;
  } else {
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    const offset = !date1904 && days > 60 ? days - 1 : days;
    date = new Date(epoch + offset * 86400000).toISOString().slice(0, 10);
  }
  if (style.time && !style.date && wholeDays === 0n) return formatTime(daySeconds);
  const includeTime = style.time || fraction !== 0n;
  if (fraction !== 0n && !style.time) stats.hiddenTime++;
  return `${date}${includeTime ? ` ${formatTime(daySeconds)}` : ''}`;
}

function columnIndex(reference) {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(reference || '');
  if (!match) return null;
  let column = 0;
  for (const letter of match[1].toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  return { column: column - 1, row: Number(match[2]) };
}

function newSheetStats() {
  return {
    formulasCached: 0, formulasMissing: 0, longNumbers: 0, merged: 0,
    unsupportedDates: 0, excelLeapDay: 0, hiddenTime: 0, booleans: 0,
    numericFormats: 0, preservedEmptyRows: 0, errors: 0,
  };
}

function cellText(cell, sharedStrings, getFormat, date1904, stats) {
  if (cell.formula) {
    const cachePresent = cell.hasValue && (cell.value !== '' || cell.type === 'str');
    if (!cachePresent) {
      stats.formulasMissing++;
      if (cell.expression) return `=${cell.expression}`;
      return cell.formulaType === 'shared'
        ? tr(`[公式无缓存值；共享公式编号 ${cell.sharedIndex ?? '未知'}]`, `[Formula has no cached value; shared formula ID ${cell.sharedIndex ?? 'unknown'}]`)
        : tr('[公式无缓存值；原文件未提供公式表达式]', '[Formula has no cached value; expression missing in source file]');
    }
    stats.formulasCached++;
  }
  if (cell.type === 'inlineStr') return decodeExcelText(cell.inline);
  if (cell.type === 's') {
    const index = Number(cell.value);
    if (!cell.hasValue || cell.value === '' || !Number.isInteger(index) || index < 0 || index >= sharedStrings.length) {
      throw new Error(tr(`单元格 ${localize(cell.reference, 'zh-CN')} 的共享文本引用损坏。请用原表格软件重新保存。`, `Cell ${localize(cell.reference, 'en')} has an invalid shared string reference. Save the file again using the original spreadsheet app.`));
    }
    return sharedStrings[index];
  }
  if (cell.type === 'b') { stats.booleans++; return cell.value === '1' ? 'TRUE' : 'FALSE'; }
  if (cell.type === 'e') { stats.errors++; return cell.value; }
  if (cell.type === 'str' || cell.type === 'd') return decodeExcelText(cell.value);
  if (!cell.value) return '';
  const expanded = expandNumeric(cell.value);
  if (!numericParts(cell.value)) return cell.value;
  const integerPart = expanded.replace(/^[+-]/, '').split('.')[0].replace(/^0+/, '');
  if (integerPart.length > 15) stats.longNumbers++;
  const format = getFormat(cell.style);
  const style = classifyFormat(format, Number(cell.value));
  if (style.date || style.time) return serialToText(cell.value, date1904, style, stats);
  if (style.zeros > 1 && /^-?\d+$/.test(expanded)) {
    const negative = expanded.startsWith('-');
    return `${negative ? '-' : ''}${expanded.replace(/^-/, '').padStart(style.zeros, '0')}`;
  }
  if (!['General', '0', '0.00', '#,##0', '#,##0.00'].includes(format)) stats.numericFormats++;
  return expanded;
}

function readWorksheet(xml, name, sharedStrings, getFormat, date1904) {
  const records = [];
  const origins = [];
  const stats = newSheetStats();
  let row = null;
  let rowNumber = 0;
  let rowNumberExplicit = false;
  let previousRow = 0;
  let nextColumn = 0;
  let lastUsedColumn = -1;
  let rowHasFormula = false;
  let rowHasNonempty = false;
  let rowHasTextCell = false;
  let outsideColumnReference = '';
  let headerRowNumber = null;
  let lastRetainedRow = 0;
  let trailingEmptyLastRow = 0;
  let cell = null;
  let capture = '';
  let phoneticDepth = 0;
  parseXML(xml, tr(`工作表“${name}”`, `Worksheet “${name}”`), {
    open(tag, node) {
      if (tag === 'row') {
        const explicit = Number(attribute(node, 'r'));
        rowNumberExplicit = Number.isInteger(explicit) && explicit > 0;
        rowNumber = rowNumberExplicit ? explicit : previousRow + 1;
        previousRow = rowNumber;
        row = [];
        nextColumn = 0;
        lastUsedColumn = -1;
        rowHasFormula = false;
        rowHasNonempty = false;
        rowHasTextCell = false;
        outsideColumnReference = '';
      } else if (tag === 'c' && row) {
        const reference = attribute(node, 'r') || '';
        const position = columnIndex(reference);
        if (!rowNumberExplicit && position && nextColumn === 0) {
          rowNumber = position.row;
          previousRow = rowNumber;
        }
        const column = position ? position.column : nextColumn;
        nextColumn = column + 1;
        cell = {
          column, reference: reference || tr(`第 ${rowNumber} 行第 ${column + 1} 列`, `row ${rowNumber}, column ${column + 1}`),
          type: attribute(node, 't') || 'n', style: attribute(node, 's') || '0',
          value: '', inline: '', expression: '', formula: false, hasValue: false,
        };
      } else if (tag === 'f' && cell) {
        cell.formula = true;
        cell.formulaType = attribute(node, 't');
        cell.sharedIndex = attribute(node, 'si');
        capture = 'expression';
      } else if (tag === 'v' && cell) { cell.hasValue = true; capture = 'value'; }
      else if (tag === 'rPh' && cell) phoneticDepth++;
      else if (tag === 't' && cell && !phoneticDepth) capture = 'inline';
      else if (tag === 'mergeCell') stats.merged++;
    },
    text(value) { if (cell && capture) cell[capture] += value; },
    close(tag) {
      if (['f', 'v', 't'].includes(tag)) capture = '';
      if (tag === 'rPh') phoneticDepth--;
      if (tag === 'c' && cell) {
        const value = cellText(cell, sharedStrings, getFormat, date1904, stats);
        const explicitText = ['inlineStr', 's', 'str'].includes(cell.type);
        if (value !== '' || cell.formula || explicitText) {
          if (cell.column >= LIMITS.maxColumns) outsideColumnReference ||= cell.reference;
          else row[cell.column] = value;
          lastUsedColumn = Math.max(lastUsedColumn, cell.column);
          rowHasFormula ||= cell.formula;
          rowHasNonempty ||= value !== '';
          rowHasTextCell ||= explicitText;
        }
        cell = null;
      }
      if (tag === 'row' && row) {
        // The first nonempty row is the header. After it, blank records are data:
        // fill internal row-number gaps only when another real or explicit-text
        // row establishes their extent. Pure formatting at the tail stays out.
        const establishesExtent = rowHasNonempty || rowHasFormula || rowHasTextCell;
        const retain = headerRowNumber === null ? rowHasNonempty : establishesExtent;
        if (retain) {
          if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1048576) {
            throw new Error(tr(`工作表“${name}”包含无效的 Excel 行号。请用原表格软件重新保存。`, `Worksheet “${name}” contains an invalid Excel row number. Save the file again using the original spreadsheet app.`));
          }
          if (outsideColumnReference) {
            throw new Error(tr(`工作表“${name}”的 ${localize(outsideColumnReference, 'zh-CN')} 超过 ${LIMITS.maxColumns} 列限制。请拆分工作表。`, `Cell ${localize(outsideColumnReference, 'en')} in worksheet “${name}” exceeds the ${LIMITS.maxColumns}-column input limit. Split the worksheet.`));
          }
          if (headerRowNumber === null) headerRowNumber = rowNumber;
          else {
            if (rowNumber <= lastRetainedRow) {
              throw new Error(tr(`工作表“${name}”的原第 ${rowNumber} 行行号重复或未按顺序排列。请用原表格软件重新保存。`, `Source row ${rowNumber} in worksheet “${name}” has a duplicate or out-of-order row number. Save the file again using the original spreadsheet app.`));
            }
            if (rowNumber - headerRowNumber > LIMITS.maxRows) {
              throw new Error(tr(`工作表“${name}”的数据区域包含空行后超过 ${LIMITS.maxRows.toLocaleString('zh-CN')} 行（不含表头）。请拆分文件或先在原表中删除不需要的空白区域。`, `The data area in worksheet “${name}”, including empty rows, exceeds ${LIMITS.maxRows.toLocaleString('en-US')} rows excluding the header. Split the file or remove unwanted blank areas in the source workbook.`));
            }
            for (let missing = lastRetainedRow + 1; missing < rowNumber; missing++) {
              records.push([]);
              origins.push(missing);
              stats.preservedEmptyRows++;
            }
            if (!rowHasNonempty) stats.preservedEmptyRows++;
          }
          records.push(Array.from({ length: lastUsedColumn + 1 }, (_, i) => row[i] || ''));
          origins.push(rowNumber);
          lastRetainedRow = rowNumber;
          trailingEmptyLastRow = 0;
        } else if (headerRowNumber !== null) trailingEmptyLastRow = Math.max(trailingEmptyLastRow, rowNumber);
        row = null;
      }
    },
  });
  const notes = [];
  if (stats.formulasCached) notes.push(tr(`${stats.formulasCached} 个公式单元格已读取原文件缓存结果，未执行公式；结果可能不是最新，请按需先在原表格软件中重算并保存。`, `Formula cells read from cached results: ${stats.formulasCached}. No formulas were executed. Results may be outdated; recalculate and save in the original spreadsheet app if needed.`));
  if (stats.formulasMissing) notes.push(tr(`${stats.formulasMissing} 个公式没有缓存结果，已保留“=原公式”文本；共享公式缺少表达式时保留引用说明，请核对。`, `Formula cells without cached results: ${stats.formulasMissing}. The original “=formula” text was retained; shared formulas without expressions keep a reference note. Please review.`));
  if (stats.longNumbers) notes.push(tr(`${stats.longNumbers} 个数值单元格超过 15 位，可能已在 Excel 中失去精度；此处只能保留文件实际存储的值，无法恢复原始编号。`, `Numeric cells longer than 15 digits: ${stats.longNumbers}. Excel may already have lost precision. Only values actually stored in the file can be retained; original identifiers cannot be recovered.`));
  if (stats.merged) notes.push(tr(`发现 ${stats.merged} 个合并区域：只读取实际存值的单元格，没有自动向空白格填充。`, `Merged ranges found: ${stats.merged}. Only cells with stored values were read; blank cells were not automatically filled.`));
  if (stats.hiddenTime) notes.push(tr(`${stats.hiddenTime} 个日期单元格含隐藏的时间小数，已保留完整时间。`, `Date cells containing hidden time fractions: ${stats.hiddenTime}. The complete time values were retained.`));
  if (stats.unsupportedDates) notes.push(tr(`${stats.unsupportedDates} 个日期序号为负数或超出支持范围，已保留原始数值，请核对。`, `Date serials that are negative or outside the supported range: ${stats.unsupportedDates}. Original numeric values were retained; please review.`));
  if (stats.excelLeapDay) notes.push(tr(`${stats.excelLeapDay} 个单元格使用 Excel 的虚构日期 1900-02-29（序号 60），已按原工作簿语义保留，请核对。`, `Cells using Excel’s fictitious date 1900-02-29, serial 60: ${stats.excelLeapDay}. The workbook’s original meaning was retained; please review.`));
  if (stats.numericFormats) notes.push(tr(`${stats.numericFormats} 个带百分比、金额或其他格式的数值已保留底层数值；仅日期、时间和纯 0 补零格式转换为文本展示值。`, `Numeric cells with percentage, currency, or other formats: ${stats.numericFormats}. Stored numeric values were retained. Only dates, times, and zero-padding formats were converted to display text.`));
  if (headerRowNumber > 1) notes.push(tr(`表头位于原第 ${headerRowNumber} 行；表头前的空白区域不计入数据。`, `The header is on source row ${headerRowNumber}. Empty areas before it are not counted as data.`));
  if (stats.preservedEmptyRows) notes.push(tr(`已保留 ${stats.preservedEmptyRows} 条数据区空行（含原工作表中的行号间隙）；是否删除由清洗规则决定。`, `Empty rows in the data area retained, including gaps in worksheet row numbers: ${stats.preservedEmptyRows}. Cleaning rules determine whether they are removed.`));
  if (trailingEmptyLastRow > lastRetainedRow) notes.push(tr(`已忽略原第 ${lastRetainedRow + 1}–${trailingEmptyLastRow} 行的尾部空白或格式区域；其中没有文本单元格或公式。`, `Trailing blank or formatting-only area on source rows ${lastRetainedRow + 1}–${trailingEmptyLastRow} was ignored. It contains no text cells or formulas.`));
  if (stats.errors) notes.push(tr(`${stats.errors} 个 Excel 错误单元格（如 #N/A）已保留为文本，请核对。`, `Excel error cells, such as #N/A, retained as text: ${stats.errors}. Please review.`));
  return { name, ...finishRecords(records, origins, notes, LIMITS.maxColumns) };
}

async function readWorkbook(bytes) {
  if (!globalThis.JSZip) throw new Error(tr('Excel 组件未加载，请刷新页面后重试。', 'The Excel component has not loaded. Refresh the page and try again.'));
  let zip;
  try { zip = await globalThis.JSZip.loadAsync(bytes); }
  catch { throw new Error(tr('无法打开此 Excel 文件。文件可能损坏、加密，或不是标准 .xlsx；请用原表格软件另存为未加密的 .xlsx。', 'This Excel file cannot be opened. It may be damaged, encrypted, or not a standard .xlsx file. Save an unencrypted .xlsx copy using the original spreadsheet app.')); }
  if (Object.keys(zip.files).length > 5000) throw new Error(tr('Excel 文件内部部件过多，请精简或拆分工作簿。', 'The Excel file contains too many internal parts. Simplify or split the workbook.'));
  const readPart = makePartReader(zip);
  const rootRels = readRelationships(await readPart('_rels/.rels'), '');
  const root = [...rootRels.values()].find(relation => relation.type.endsWith('/officeDocument'));
  const workbookPath = root?.path || 'xl/workbook.xml';
  const workbookXML = await readPart(workbookPath, true);
  const relations = readRelationships(await readPart(relationshipsPath(workbookPath), true), workbookPath);
  const descriptors = [];
  let date1904 = false;
  parseXML(workbookXML, tr('工作簿', 'Workbook'), {
    open(tag, node) {
      if (tag === 'workbookPr') date1904 = ['1', 'true'].includes(attribute(node, 'date1904'));
      if (tag === 'sheet') descriptors.push({
        name: decodeExcelText(attribute(node, 'name') || tr(`工作表 ${descriptors.length + 1}`, `Sheet ${descriptors.length + 1}`)),
        id: attribute(node, 'id'), state: attribute(node, 'state'),
      });
    },
  });
  if (descriptors.length > 100) throw new Error(tr('工作簿超过 100 个工作表，请拆分后导入。', 'The workbook has more than 100 worksheets. Split it before importing.'));
  const sharedPart = [...relations.values()].find(relation => relation.type.endsWith('/sharedStrings'));
  const stylesPart = [...relations.values()].find(relation => relation.type.endsWith('/styles'));
  const sharedStrings = readSharedStrings(await readPart(sharedPart?.path || resolvePart(workbookPath, 'sharedStrings.xml')));
  const getFormat = readStyles(await readPart(stylesPart?.path || resolvePart(workbookPath, 'styles.xml')));
  const sheets = [];
  const notes = [];
  let emptyCount = 0;
  for (const descriptor of descriptors) {
    const relation = relations.get(descriptor.id);
    if (!relation) throw new Error(tr(`找不到工作表“${descriptor.name}”的内部数据引用。请重新另存为 .xlsx。`, `The internal data reference for worksheet “${descriptor.name}” is missing. Save the file again as .xlsx.`));
    if (!relation.type.endsWith('/worksheet')) {
      notes.push(tr(`“${descriptor.name}”不是数据工作表，已跳过。`, `“${descriptor.name}” is not a data worksheet and was skipped.`));
      continue;
    }
    const sheet = readWorksheet(await readPart(relation.path, true), descriptor.name, sharedStrings, getFormat, date1904);
    if (!sheet.headers.length) { emptyCount++; continue; }
    if (descriptor.state && descriptor.state !== 'visible') sheet.notes.push(tr('此工作表在原文件中处于隐藏状态，已读取其中的数据。', 'This worksheet is hidden in the source file. Its data was included.'));
    sheets.push(sheet);
  }
  if (emptyCount) notes.push(tr(`${emptyCount} 个空工作表已跳过。`, `Empty worksheets skipped: ${emptyCount}.`));
  if (!sheets.length) throw new Error(tr('工作簿中没有可读取的数据。请确保工作表包含表头和数据。', 'The workbook contains no readable data. Make sure a worksheet contains a header and data.'));
  return { sheets, notes, encoding: 'xlsx' };
}

/** Read a browser File (or a compatible object) without making network requests. */
export async function readFile(file, { encoding = 'auto', delimiter = 'auto' } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error(tr('请选择一个 CSV、TSV 或 XLSX 文件。', 'Choose a CSV, TSV, or XLSX file.'));
  const filename = asText(file.name || tr('数据.csv', 'data.csv'));
  const extension = filename.split('.').pop().toLowerCase();
  if (extension === 'xls') throw new Error(tr('暂不支持旧版 .xls 文件。请在 Excel 或 WPS 中另存为 .xlsx 或 UTF-8 CSV 后导入。', 'Legacy .xls files are not supported. Save the file as .xlsx or UTF-8 CSV in Excel or WPS, then import it.'));
  if (!['csv', 'tsv', 'txt', 'xlsx'].includes(extension)) throw new Error(tr('支持 CSV、TSV、TXT 表格或 XLSX 文件。其他格式请先另存为这些格式。', 'CSV, TSV, tabular TXT, and XLSX files are supported. Convert other formats before importing.'));
  if (file.size > LIMITS.maxFileBytes) throw new Error(tr('文件超过 10 MB，请拆分后再导入。', 'The file exceeds the 10 MB input limit. Split it before importing.'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new Error(tr('文件超过 10 MB，请拆分后再导入。', 'The file exceeds the 10 MB input limit. Split it before importing.'));
  if (!bytes.length) throw new Error(tr('文件为空，请选择包含表头和数据的文件。', 'The file is empty. Choose a file containing a header and data.'));
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
    throw new Error(tr('这是旧版 Excel 二进制文件或加密工作簿。请另存为未加密的 .xlsx 或 UTF-8 CSV 后导入。', 'This is a legacy Excel binary file or an encrypted workbook. Save an unencrypted .xlsx or UTF-8 CSV copy before importing.'));
  }
  if (extension === 'xlsx') return readWorkbook(bytes);
  const decoded = decodeFileBytes(bytes, encoding);
  if (decoded.text.includes('\0')) throw new Error(tr('文本中含有 NUL 字符，可能选择了错误编码或文件格式。请检查编码，或另存为 UTF-8 CSV。', 'The text contains NUL characters, possibly because the encoding or file format is incorrect. Check the encoding or save the file as UTF-8 CSV.'));
  const sheet = parseDelimited(decoded.text, { delimiter });
  if (!sheet.headers.length) throw new Error(tr('文件中没有非空表头或数据。', 'The file contains no nonempty header or data.'));
  return {
    sheets: [{ name: filename.replace(/\.[^.]+$/, '') || tr('数据', 'Data'), ...sheet }],
    notes: decoded.notes,
    encoding: decoded.encoding,
  };
}

function csvSafeText(value) {
  const text = asText(value);
  const plainNegative = /^-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  const control = /[\u0000-\u001F\u007F]/.test(text);
  const dangerous = /^[\s\uFEFF\u200B\u200C\u200D]*[=+\-@]/.test(text);
  return control || (dangerous && !plainNegative) ? `'${text}` : text;
}

/** UTF-8 BOM CSV. Safe mode adds a literal apostrophe to formula-risk text. */
export function makeCSV(headers, rows, { safe = true } = {}) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) throw new Error(tr('导出数据格式不正确。', 'The export data has an invalid structure.'));
  const escape = value => {
    const text = safe ? csvSafeText(value) : asText(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers, ...rows].map(row => {
    if (!Array.isArray(row)) throw new Error(tr('导出数据必须是按列排列的二维数组。', 'Export data must be a two-dimensional array of rows and columns.'));
    return row.map(escape).join(',');
  });
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function escapeXML(value, preserveExcelEscapes = false) {
  let text = asText(value);
  if (preserveExcelEscapes) text = text.replace(/_x(?=[0-9a-fA-F]{4}_)/g, '_x005F_x');
  let valid = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { valid += text[i] + text[++i]; continue; }
    }
    const invalid = (code < 32 && ![9, 10, 13].includes(code))
      || code === 0xFFFE || code === 0xFFFF || (code >= 0xD800 && code <= 0xDFFF);
    valid += invalid ? (preserveExcelEscapes ? `_x${code.toString(16).toUpperCase().padStart(4, '0')}_` : '\uFFFD') : text[i];
  }
  return valid.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;');
}

function columnName(index) {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

function safeSheetNames(tables) {
  const used = new Set();
  const truncate = (value, limit) => value.slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
  return tables.map((table, index) => {
    let base = asText(table.name).replace(/[\\/*?:\[\]\u0000-\u001F\u007F]/g, '_').trim().replace(/^'+|'+$/g, '');
    base = truncate(base || tr(`工作表 ${index + 1}`, `Sheet ${index + 1}`), 31).replace(/^'+|'+$/g, '');
    if (!base) base = tr(`工作表 ${index + 1}`, `Sheet ${index + 1}`);
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLocaleLowerCase())) {
      const suffix = ` (${n++})`;
      candidate = truncate(base, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  });
}

/** Build a standard XLSX workbook, using text cells for every supplied value. */
export async function makeWorkbook(tables) {
  if (!globalThis.JSZip) throw new Error(tr('Excel 组件未加载，请刷新页面后重试。', 'The Excel component has not loaded. Refresh the page and try again.'));
  if (!Array.isArray(tables) || !tables.length) throw new Error(tr('没有可导出的工作表。', 'There are no worksheets to export.'));
  if (tables.length > 100) throw new Error(tr('一次最多导出 100 个工作表。', 'A single export can contain up to 100 worksheets.'));
  const names = safeSheetNames(tables);
  const zip = new globalThis.JSZip();
  const worksheetTypes = [];
  const sheets = [];
  const relations = [];
  for (let index = 0; index < tables.length; index++) {
    const { headers, rows } = tables[index];
    if (!Array.isArray(headers) || !Array.isArray(rows)) throw new Error(tr(`工作表“${names[index]}”的数据格式不正确。`, `Worksheet “${names[index]}” has an invalid data structure.`));
    if (rows.length > OUTPUT_LIMITS.maxRows) throw new Error(tr(`工作表“${names[index]}”超过每个导出工作表 ${OUTPUT_LIMITS.maxRows.toLocaleString('zh-CN')} 条数据的限制。请拆分工作表后导出。`, `Worksheet “${names[index]}” exceeds the per-sheet export limit of ${OUTPUT_LIMITS.maxRows.toLocaleString('en-US')} data rows. Split the worksheet before exporting.`));
    let width = headers.length;
    for (const row of rows) {
      if (!Array.isArray(row)) throw new Error(tr('导出数据必须是按列排列的二维数组。', 'Export data must be a two-dimensional array of rows and columns.'));
      width = Math.max(width, row.length);
    }
    if (width > OUTPUT_LIMITS.maxColumns) throw new Error(tr(`工作表“${names[index]}”超过导出 ${OUTPUT_LIMITS.maxColumns} 列的限制。`, `Worksheet “${names[index]}” exceeds the ${OUTPUT_LIMITS.maxColumns}-column export limit.`));
    if (!width) throw new Error(tr(`工作表“${names[index]}”没有列。`, `Worksheet “${names[index]}” has no columns.`));
    const parts = [`${XML_DECL}<worksheet xmlns="${MAIN_NS}"><dimension ref="A1:${columnName(width - 1)}${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`];
    const allRows = [headers, ...rows];
    for (let r = 0; r < allRows.length; r++) {
      const cells = [];
      for (let c = 0; c < width; c++) {
        const value = asText(allRows[r][c]);
        if (value.length > 32767) {
          throw new Error(tr(`工作表“${names[index]}”的 ${columnName(c)}${r + 1} 超过 Excel 单元格 32,767 字符限制。请改用 CSV 导出。`, `Cell ${columnName(c)}${r + 1} in worksheet “${names[index]}” exceeds Excel’s limit of 32,767 characters per cell. Export as CSV instead.`));
        }
        cells.push(`<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXML(value, true)}</t></is></c>`);
      }
      parts.push(`<row r="${r + 1}">${cells.join('')}</row>`);
    }
    parts.push(`</sheetData><autoFilter ref="A1:${columnName(width - 1)}${rows.length + 1}"/></worksheet>`);
    const number = index + 1;
    zip.file(`xl/worksheets/sheet${number}.xml`, parts.join(''));
    worksheetTypes.push(`<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    sheets.push(`<sheet name="${escapeXML(names[index], true)}" sheetId="${number}" r:id="rId${number}"/>`);
    relations.push(`<Relationship Id="rId${number}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${number}.xml"/>`);
  }
  zip.file('[Content_Types].xml', `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${worksheetTypes.join('')}</Types>`);
  zip.file('_rels/.rels', `${XML_DECL}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${XML_DECL}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>${sheets.join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${XML_DECL}<Relationships xmlns="${PACKAGE_REL_NS}">${relations.join('')}</Relationships>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(data, filename, mime = 'application/octet-stream') {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') throw new Error(tr('下载功能需要在浏览器中使用。', 'Downloads are available only in a browser.'));
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
