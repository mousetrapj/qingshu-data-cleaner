import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, parseDelimited, makeCSV, makeWorkbook, downloadBlob, LIMITS, OUTPUT_LIMITS } from '../dist/io.js';
import { cleanData } from '../dist/engine.js';
import { getLocale, setLocale, localize } from '../dist/i18n.js';
import { setupVendor } from './helpers/vendor.mjs';

setupVendor();
beforeEach(() => setLocale('zh-CN'));
afterEach(() => setLocale('zh-CN'));

function file(name, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const headerCell = (letter, value, row = 1) => `<c r="${letter}${row}" t="inlineStr"><is><t>${value}</t></is></c>`;

async function fixture({ sheets, styles, sharedStrings, date1904 = false, prefixed = false } = {}) {
  sheets ||= [{ name: '数据', xml: `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('A', '值')}</row><row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>` }];
  const zip = new globalThis.JSZip();
  const sheetTags = sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"${sheet.state ? ` state="${sheet.state}"` : ''}/>`).join('');
  let workbook = `<workbook xmlns="${ns}" xmlns:r="${relNS}"><workbookPr date1904="${date1904 ? 1 : 0}"/><sheets>${sheetTags}</sheets></workbook>`;
  if (prefixed) workbook = workbook.replace(/<(\/?)(workbook|workbookPr|sheets|sheet)(?=[\s/>])/g, '<$1x:$2').replace(`xmlns="${ns}"`, `xmlns:x="${ns}"`);
  zip.file('xl/workbook.xml', workbook);
  const relations = sheets.map((sheet, i) => `<Relationship Id="rId${i + 1}" Type="${relNS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
  if (styles) {
    zip.file('xl/styles.xml', styles);
    relations.push(`<Relationship Id="styles" Type="${relNS}/styles" Target="styles.xml"/>`);
  }
  if (sharedStrings) {
    zip.file('xl/sharedStrings.xml', sharedStrings);
    relations.push(`<Relationship Id="strings" Type="${relNS}/sharedStrings" Target="sharedStrings.xml"/>`);
  }
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}</Relationships>`);
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="${relNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheet.xml));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

test('CSV preserves leading zeros, RFC quotes, CRLF inside fields and physical source lines', () => {
  const parsed = parseDelimited('\uFEFF编号,备注\r\n\r\n001,"第一行\r\n第二行 ""引用"",逗号"\r\n002,完成\r\n');
  assert.deepEqual(parsed.headers, ['编号', '备注']);
  assert.deepEqual(parsed.rows, [['', ''], ['001', '第一行\r\n第二行 "引用",逗号'], ['002', '完成']]);
  assert.deepEqual(parsed.sourceRows, [2, 3, 5]);
  assert.ok(parsed.notes.some(note => note.includes('保留表头后 1 条完全空白')));
});

test('CSV reports unclosed, unescaped and trailing quote errors clearly', () => {
  assert.throws(() => parseDelimited('a,b\n1,"missing'), /第 2 行开始.*没有闭合/);
  assert.throws(() => parseDelimited('a,b\n1,abc"def'), /第 2 行.*未转义/);
  assert.throws(() => parseDelimited('a,b\n1,"abc"x'), /第 2 行.*结束引号/);
});

test('CSV detects semicolon and TSV, with explicit delimiter available', () => {
  const semi = parseDelimited('id;label;value\n001;中文,说明;12,50\n002;另一条;4,00');
  assert.equal(semi.delimiter, ';');
  assert.deepEqual(semi.rows[0], ['001', '中文,说明', '12,50']);
  assert.equal(parseDelimited('学号\t姓名\n0001\t李明').delimiter, '\t');
  assert.deepEqual(parseDelimited('""\n学号\t姓名\n0001\t李明').rows, [['0001', '李明']]);
  assert.deepEqual(parseDelimited('a,b;c\n1,2;3', { delimiter: ';' }).headers, ['a,b', 'c']);
  assert.throws(() => parseDelimited('a|b', { delimiter: '|' }), /分隔符/);
});

test('CSV empty and duplicate headers remain separate, extra row columns are retained', () => {
  const result = parseDelimited(' id ,,id,id_2\n001,x,002,y,extra');
  assert.deepEqual(result.headers, ['id', '未命名列 2', 'id_3', 'id_2', '未命名列 5']);
  assert.deepEqual(result.rows, [['001', 'x', '002', 'y', 'extra']]);
  assert.ok(result.notes.some(note => note.includes('未截断')));
  assert.ok(result.notes.some(note => note.includes('重复列名')));
  assert.ok(result.notes.some(note => note.includes('首尾空白')));
});

test('CSV supports empty input and enforces row and column limits without truncating', () => {
  assert.deepEqual(parseDelimited('').headers, []);
  assert.deepEqual(parseDelimited('a\n1\n', { maxRows: 1 }).rows, [['1']]);
  assert.throws(() => parseDelimited('a\n1\n2', { maxRows: 1 }), /超过 1 行/);
  assert.throws(() => parseDelimited('a,b\n1,2', { maxColumns: 1 }), /超过 1 列/);
});

test('CSV retains real empty records after the header and leaves their removal to the cleaning engine', () => {
  const parsed = parseDelimited('\n\nid,name\n001,甲\n\n"",""\n,\n');
  assert.deepEqual(parsed.sourceRows, [4, 5, 6, 7]);
  assert.deepEqual(parsed.rows, [['001', '甲'], ['', ''], ['', ''], ['', '']]);
  assert.ok(parsed.notes.some(note => note.includes('表头前 2 条')));
  assert.ok(parsed.notes.some(note => note.includes('保留表头后 3 条')));
  assert.equal(parseDelimited('id\n001\n').rows.length, 1, 'a record terminator must not create an extra record');
  assert.deepEqual(parseDelimited('id\n001\n\n').rows, [['001'], ['']]);
  assert.throws(() => parseDelimited('id\n001\n\n', { maxRows: 1 }), /超过 1 行/);
  const kept = cleanData({ ...parsed, options: { dropEmptyRows: false } });
  const removed = cleanData({ ...parsed, options: { dropEmptyRows: true } });
  assert.equal(kept.stats.inputRows, 4);
  assert.equal(kept.stats.outputRows, 4);
  assert.equal(removed.stats.inputRows, 4);
  assert.equal(removed.stats.outputRows, 1);
  assert.equal(removed.stats.removedRows, 3);
  assert.deepEqual(removed.rows.filter(row => row.removed).map(row => row.sourceRow), [5, 6, 7]);
  assert.equal(parsed.rows.length, 4, 'cleaning choices do not mutate the imported source');
});

test('CSV safe export protects headers, formula prefixes and controls, retaining pure negative numbers', () => {
  const values = ['=SUM(A1)', '+cmd', '-cmd', '@SUM(A1)', '  =1', '\t=1', 'line\nbreak', '-12', '-0.5', '-2.5e+3', '00123'];
  const csv = makeCSV(['=header'], values.map(value => [value]));
  assert.ok(csv.startsWith('\uFEFF'));
  const parsed = parseDelimited(csv);
  assert.deepEqual(parsed.headers, ["'=header"]);
  assert.deepEqual(parsed.rows.slice(0, 7).map(row => row[0]), values.slice(0, 7).map(value => `'${value}`));
  assert.deepEqual(parsed.rows.slice(7).map(row => row[0]), values.slice(7));
  assert.deepEqual(parseDelimited(makeCSV(['正常'], [['one,"two"\r\nthree']], { safe: false })).rows, [['one,"two"\r\nthree']]);
});

test('readFile detects UTF-8, UTF-16 BOMs and GB18030 while retaining text IDs', async () => {
  const source = '姓名,编号\r\n李明,00123';
  const utf8 = await readFile(file('测试.csv', source));
  assert.equal(utf8.encoding, 'utf-8');
  assert.equal(utf8.sheets[0].rows[0][1], '00123');
  const le = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(source, 'utf16le')]);
  const readLE = await readFile(file('测试.csv', le));
  assert.equal(readLE.encoding, 'utf-16le');
  assert.deepEqual(readLE.sheets[0].rows, [['李明', '00123']]);
  const be = Buffer.from(le);
  be.swap16();
  const readBE = await readFile(file('测试.csv', be));
  assert.equal(readBE.encoding, 'utf-16be');
  assert.deepEqual(readBE.sheets[0].rows, [['李明', '00123']]);
  const gb = Buffer.concat([Buffer.from('name,id\n'), Buffer.from([0xD6, 0xD0, 0xCE, 0xC4]), Buffer.from(',001')]);
  const readGB = await readFile(file('测试.csv', gb));
  assert.equal(readGB.encoding, 'gb18030');
  assert.deepEqual(readGB.sheets[0].rows, [['中文', '001']]);
  assert.ok(readGB.notes.length);
  assert.deepEqual((await readFile(file('测试.csv', gb), { encoding: 'gb18030' })).sheets[0].rows, [['中文', '001']]);
  await assert.rejects(() => readFile(file('测试.csv', gb), { encoding: 'utf-8' }), /无法按 UTF-8/);
});

test('readFile rejects unsupported, oversized, empty and corrupt workbook inputs with actionable messages', async () => {
  await assert.rejects(() => readFile(file('旧表.xls', 'content')), /另存为 .xlsx/);
  await assert.rejects(() => readFile(file('data.json', '{}')), /支持 CSV/);
  await assert.rejects(() => readFile({ ...file('大表.csv', 'a'), size: LIMITS.maxFileBytes + 1 }), /超过 10 MB/);
  await assert.rejects(() => readFile(file('空.csv', '')), /文件为空/);
  await assert.rejects(() => readFile(file('假.xlsx', 'not zip')), /另存为未加密/);
});

test('XLSX output round-trips multiple text sheets, formulas as text, leading zeros and XML/OOXML escapes', async () => {
  const tables = [
    { name: '学生资料', headers: ['学号', '姓名', '备注'], rows: [['000001', '李明 & <测试>', '=HYPERLINK("bad")'], ['001234567890123456789', '😊', 'literal _x0041_\r\nline\u0001end']] },
    { name: '商品数据', headers: ['SKU', '说明'], rows: [['00042', '保留  首尾空格 '], ['001', "引号 ' \" 与 >"]] },
  ];
  const data = await makeWorkbook(tables);
  assert.ok(data instanceof Uint8Array);
  const workbook = await readFile(file('往返.xlsx', data));
  assert.equal(workbook.sheets.length, 2);
  for (let i = 0; i < tables.length; i++) {
    assert.equal(workbook.sheets[i].name, tables[i].name);
    assert.deepEqual(workbook.sheets[i].headers, tables[i].headers);
    assert.deepEqual(workbook.sheets[i].rows, tables[i].rows);
    assert.deepEqual(workbook.sheets[i].sourceRows, [2, 3]);
  }
  const zip = await globalThis.JSZip.loadAsync(data);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(!/<f[\s>]/.test(xml));
  assert.ok(xml.includes('t="inlineStr"'));
  assert.ok(xml.includes('_x005F_x0041_'));
  assert.ok(xml.includes('_x0001_'));
});

test('XLSX sheet names are valid, truncated and unique without overwriting sheets', async () => {
  const tables = ['a/b', 'a?b', 'A_B', '很长'.repeat(20), "'测试'"].map(name => ({ name, headers: ['值'], rows: [['001']] }));
  const workbook = await readFile(file('names.xlsx', await makeWorkbook(tables)));
  const names = workbook.sheets.map(sheet => sheet.name);
  assert.deepEqual(names.slice(0, 3), ['a_b', 'a_b (2)', 'A_B (3)']);
  assert.ok(names.every(name => name.length <= 31));
  assert.equal(names[4], '测试');
});

test('XLSX audit output supports 101–103 columns while retaining separate import limits', async () => {
  assert.deepEqual(OUTPUT_LIMITS, { maxRows: 250000, maxColumns: 128 });
  assert.equal(LIMITS.maxColumns, 100);
  assert.equal(LIMITS.maxRows, 50000);
  const tables = [101, 102, 103].map(width => ({
    name: `审计${width}列`, headers: Array.from({ length: width }, (_, i) => `列${i + 1}`),
    rows: [Array.from({ length: width }, (_, i) => `原值${i + 1}`)],
  }));
  const zip = await globalThis.JSZip.loadAsync(await makeWorkbook(tables));
  for (let i = 0; i < tables.length; i++) {
    const xml = await zip.file(`xl/worksheets/sheet${i + 1}.xml`).async('string');
    assert.equal((xml.match(/<c /g) || []).length, tables[i].headers.length * 2);
    assert.ok(xml.includes(`原值${tables[i].headers.length}`));
  }
  await assert.rejects(() => makeWorkbook([{ name: '超宽', headers: Array(129).fill('列'), rows: [] }]), /导出 128 列/);
});

test('XLSX audit output can exceed 50,000 input rows without losing the final record', async () => {
  const rows = Array.from({ length: 50001 }, (_, i) => [`审计-${i + 1}`]);
  const data = await makeWorkbook([{ name: '修改明细', headers: ['记录'], rows }]);
  const zip = await globalThis.JSZip.loadAsync(data);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal((xml.match(/<row /g) || []).length, 50002);
  assert.ok(xml.includes('<row r="50002">'));
  assert.ok(xml.includes('审计-50001'));
  await assert.rejects(() => makeWorkbook([{ name: '需拆表', headers: ['记录'], rows: new Array(250001) }]), /250,000/);
});

test('XLSX reads shared text, padding, dates with hidden time, caches, missing formulas, numeric risk and merges', async () => {
  const labels = ['文本编号', '补零', '隐藏时间', '日期时间', '缓存', '无缓存', '长编号', '布尔', '错误', '时间', '时长', '虚构日期', 'ISO日期', '转义文本'];
  const headers = labels.map((value, i) => headerCell(String.fromCharCode(65 + i), value, 3)).join('');
  const xml = `<worksheet xmlns="${ns}"><sheetData><row r="3">${headers}</row><row r="5"><c r="XFD5" s="1"/></row><row r="7">
    <c r="A7" t="s"><v>0</v></c><c r="B7" s="1"><v>12</v></c>
    <c r="C7" s="2"><v>45292.500001</v></c><c r="D7" s="3"><v>45292.5</v></c>
    <c r="E7"><f>1+2</f><v>3</v></c><c r="F7"><f>SUM(A1:A2)</f></c>
    <c r="G7"><v>123456789012345678</v></c><c r="H7" t="b"><v>1</v></c><c r="I7" t="e"><v>#N/A</v></c>
    <c r="J7" s="4"><v>0.5</v></c><c r="K7" s="5"><v>1.5</v></c><c r="L7" s="2"><v>60</v></c>
    <c r="M7" t="d"><v>2026-10-10T12:34:56.789</v></c><c r="N7" t="inlineStr"><is><t>_x005F_x0041_</t></is></c>
    </row></sheetData><mergeCells count="1"><mergeCell ref="A7:A8"/></mergeCells></worksheet>`;
  const styles = `<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="22"/><xf numFmtId="20"/><xf numFmtId="46"/></cellXfs></styleSheet>`;
  const sharedStrings = `<sst xmlns="${ns}"><si><r><t>00</t></r><r><t>123</t></r><rPh sb="0" eb="1"><t>音标不应重复</t></rPh></si></sst>`;
  const input = await fixture({ sheets: [{ name: '格式测试', xml }], styles, sharedStrings, prefixed: true });
  const { sheets } = await readFile(file('样例.xlsx', input));
  assert.deepEqual(sheets[0].sourceRows, [4, 5, 6, 7]);
  assert.ok(sheets[0].rows.slice(0, 3).every(row => row.every(value => value === '')));
  assert.deepEqual(sheets[0].rows[3], ['00123', '00012', '2024-01-01 12:00:00.0864', '2024-01-01 12:00:00', '3', '=SUM(A1:A2)', '123456789012345678', 'TRUE', '#N/A', '12:00:00', '36:00:00', '1900-02-29', '2026-10-10T12:34:56.789', '_x0041_']);
  for (const word of ['缓存结果', '没有缓存', '失去精度', '合并区域', '隐藏的时间', '虚构日期']) {
    assert.ok(sheets[0].notes.some(note => note.includes(word)), `missing note: ${word}`);
  }
});

test('XLSX honors 1904 date system, subsecond precision and early 1900 serials', async () => {
  const styles = `<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
  for (const [date1904, serials, expected] of [
    [true, ['0', '1', '0.500000001'], ['1904-01-01', '1904-01-02', '1904-01-01 12:00:00.0000864']],
    [false, ['59', '60', '61'], ['1900-02-28', '1900-02-29', '1900-03-01']],
  ]) {
    const xml = `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('A', '日期')}</row>${serials.map((serial, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${serial}</v></c></row>`).join('')}</sheetData></worksheet>`;
    const data = await fixture({ sheets: [{ name: '日期', xml }], styles, date1904 });
    assert.deepEqual((await readFile(file('date.xlsx', data))).sheets[0].rows.map(row => row[0]), expected);
  }
});

test('XLSX retains subnanosecond serial fractions and row provenance without explicit row attributes', async () => {
  const styles = `<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="21"/></cellXfs></styleSheet>`;
  const xml = `<worksheet xmlns="${ns}"><sheetData><row>${headerCell('A', '时间', 3)}</row><row><c r="A19" s="1"><v>0.0000000000000001</v></c></row></sheetData></worksheet>`;
  const data = await fixture({ sheets: [{ name: '精度', xml }], styles });
  const sheet = (await readFile(file('precision.xlsx', data))).sheets[0];
  assert.deepEqual(sheet.sourceRows, Array.from({ length: 16 }, (_, i) => i + 4));
  assert.deepEqual(sheet.rows.at(-1), ['00:00:00.00000000000864']);
});

test('XLSX includes hidden data sheets and skips empty worksheets', async () => {
  const nonempty = `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('A', '编号')}</row><row r="9">${headerCell('A', '001', 9)}</row></sheetData></worksheet>`;
  const data = await fixture({ sheets: [{ name: '隐藏', state: 'hidden', xml: nonempty }, { name: '空表', xml: `<worksheet xmlns="${ns}"><sheetData/></worksheet>` }] });
  const result = await readFile(file('hidden.xlsx', data));
  assert.equal(result.sheets.length, 1);
  assert.deepEqual(result.sheets[0].sourceRows, [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(result.sheets[0].notes.some(note => note.includes('隐藏')));
  assert.ok(result.notes.some(note => note.includes('空工作表')));
});

test('XLSX preserves internal row gaps and explicit text-empty tail rows, skipping trailing formatting only', async () => {
  const xml = `<worksheet xmlns="${ns}"><sheetData>
    <row r="1"><c r="A1" s="1"/></row><row r="3"><c r="A3" t="inlineStr"><is><t/></is></c></row>
    <row r="4">${headerCell('A', '编号', 4)}${headerCell('B', '备注', 4)}</row>
    <row r="5">${headerCell('A', '001', 5)}</row><row r="7"/>
    <row r="9">${headerCell('A', '002', 9)}</row>
    <row r="10"><c r="A10" t="inlineStr"><is><t/></is></c></row>
    <row r="11"><c r="A11" t="s"><v>0</v></c></row>
    <row r="12"><c r="A12" t="str"><v/></c></row>
    <row r="15"><c r="XFD15" s="1"/></row><row r="1048576" s="1" customFormat="1"/>
    </sheetData></worksheet>`;
  const sharedStrings = `<sst xmlns="${ns}"><si><t/></si></sst>`;
  const data = await fixture({ sheets: [{ name: '空行', xml }], sharedStrings });
  const sheet = (await readFile(file('空行.xlsx', data))).sheets[0];
  assert.deepEqual(sheet.sourceRows, [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(sheet.rows, [['001', ''], ['', ''], ['', ''], ['', ''], ['002', ''], ['', ''], ['', ''], ['', '']]);
  assert.ok(sheet.notes.some(note => note.includes('表头位于原第 4 行')));
  assert.ok(sheet.notes.some(note => note.includes('保留 6 条数据区空行')));
  assert.ok(sheet.notes.some(note => note.includes('13–1048576') && note.includes('尾部')));
  const kept = cleanData({ ...sheet, options: { dropEmptyRows: false } });
  const removed = cleanData({ ...sheet, options: { dropEmptyRows: true } });
  assert.equal(kept.stats.inputRows, 8);
  assert.equal(kept.stats.outputRows, 8);
  assert.equal(removed.stats.outputRows, 2);
  assert.equal(removed.stats.removedRows, 6);
  assert.deepEqual(removed.rows.filter(row => row.removed).map(row => row.sourceRow), [6, 7, 8, 10, 11, 12]);
});

test('XLSX sparse data and explicit empty text are checked against row limits before filling gaps', async () => {
  for (const value of ['最后数据', '']) {
    const xml = `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('A', '编号')}</row><row r="50002">${headerCell('A', value, 50002)}</row></sheetData></worksheet>`;
    const data = await fixture({ sheets: [{ name: '稀疏表', xml }] });
    await assert.rejects(() => readFile(file('稀疏.xlsx', data)), /包含空行后超过 50,000 行/);
  }
});

test('XLSX exported blank data rows round-trip without being cleaned away at import', async () => {
  const table = { name: '保留空行', headers: ['编号', '姓名'], rows: [['001', '甲'], ['', ''], ['', '']] };
  const sheet = (await readFile(file('往返空行.xlsx', await makeWorkbook([table])))).sheets[0];
  assert.deepEqual(sheet.rows, table.rows);
  assert.deepEqual(sheet.sourceRows, [2, 3, 4]);
});

test('XLSX rejects invalid shared strings and meaningful data beyond column limit', async () => {
  const sharedXML = `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" t="s"><v>999</v></c></row></sheetData></worksheet>`;
  await assert.rejects(() => fixture({ sheets: [{ name: '错误', xml: sharedXML }] }).then(data => readFile(file('bad.xlsx', data))), /共享文本引用损坏/);
  const wideXML = `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('CW', '过宽')}</row></sheetData></worksheet>`;
  await assert.rejects(() => fixture({ sheets: [{ name: '宽表', xml: wideXML }] }).then(data => readFile(file('wide.xlsx', data))), /超过 100 列/);
});

test('XLSX rejects DTD declarations and overly long export cells without truncation', async () => {
  const xml = `<!DOCTYPE worksheet [<!ENTITY x "value">]><worksheet xmlns="${ns}"><sheetData/></worksheet>`;
  await assert.rejects(() => fixture({ sheets: [{ name: 'DTD', xml }] }).then(data => readFile(file('dtd.xlsx', data))), /DTD/);
  await assert.rejects(() => makeWorkbook([{ name: '超长', headers: ['文本'], rows: [['x'.repeat(32768)]] }]), /32,767/);
});

test('English CSV import localizes generated headers and notes while preserving user headers, values and filenames', async () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  const source = '\n 原字段 ,,Unnamed column 2,原字段,\n0001,原值,工作簿关系,0002,数据.csv,额外值\n\n';
  const result = await readFile(file('中文原文件.csv', source));
  const sheet = result.sheets[0];
  assert.equal(sheet.name, '中文原文件');
  assert.deepEqual(sheet.headers, ['原字段', 'Unnamed column 2_2', 'Unnamed column 2', '原字段_2', 'Unnamed column 5', 'Unnamed column 6']);
  assert.deepEqual(sheet.rows[0], ['0001', '原值', '工作簿关系', '0002', '数据.csv', '额外值']);
  assert.deepEqual(sheet.sourceRows, [3, 4]);
  assert.ok(sheet.notes.length >= 6);
  assert.ok(sheet.notes.every(note => !/\p{Script=Han}/u.test(note)));
  assert.ok(sheet.notes.some(note => note.includes('no cells were truncated')));
  assert.ok(sheet.notes.some(note => note.includes('Cleaning rules determine')));
  const snapshot = JSON.stringify(sheet);
  setLocale('zh-CN');
  const translatedNotes = sheet.notes.map(note => localize(note));
  assert.ok(translatedNotes.every(note => /\p{Script=Han}/u.test(note)));
  assert.equal(JSON.stringify(sheet), snapshot, 'rendering notes in another language must not alter imported data');
  assert.equal(sheet.headers[1], 'Unnamed column 2_2', 'generated import headers keep their import-time language');
  setLocale('en');
  assert.equal((await readFile(file('', 'id\n001'))).sheets[0].name, 'data');
  assert.equal((await readFile(file('数据.csv', 'id\n001'))).sheets[0].name, '数据');
});

test('English import and export errors are actionable and prior errors can be rendered in another language', async () => {
  let chineseError;
  try { parseDelimited('id\n"missing'); } catch (error) { chineseError = error.message; }
  assert.match(chineseError, /第 2 行开始/);
  setLocale('en');
  assert.match(localize(chineseError), /starting on source line 2 is not closed/);
  assert.throws(() => parseDelimited('a,b\n1,abc"def'), /Source line 2: unescaped double quote/);
  assert.throws(() => parseDelimited('a,b\n1,"x"extra'), /Source line 2: extra characters after a closing quote/);
  assert.throws(() => parseDelimited('a|b', { delimiter: '|' }), /Choose a comma, tab, or semicolon/);
  await assert.rejects(() => readFile(file('old.xls', 'data')), /Legacy .xls files are not supported/);
  await assert.rejects(() => readFile(file('empty.csv', '')), /The file is empty/);
  await assert.rejects(() => readFile(file('broken.xlsx', 'not zip')), /Save an unencrypted .xlsx copy/);
  await assert.rejects(() => readFile(file('input.csv', 'id\n001'), { encoding: 'unknown' }), /This encoding is not supported/);
  assert.throws(() => makeCSV(null, []), /The export data has an invalid structure/);
  await assert.rejects(() => makeWorkbook([]), /There are no worksheets to export/);
  assert.throws(() => downloadBlob('data', 'test.csv'), /Downloads are available only in a browser/);
});

test('English XLSX notes and formula placeholders retain data when the display language changes', async () => {
  setLocale('en');
  const labels = ['编号', 'Cache', 'Shared formula', 'Long number', 'Merged', 'Time', 'Negative date', 'Leap day', 'Percentage', 'Error', 'Missing expression'];
  const headers = labels.map((value, i) => headerCell(String.fromCharCode(65 + i), value, 3)).join('');
  const xml = `<worksheet xmlns="${ns}"><sheetData><row r="3">${headers}</row><row r="5">
    ${headerCell('A', '0001-中文原值', 5)}<c r="B5"><f>1+2</f><v>3</v></c>
    <c r="C5"><f t="shared" si="7"/></c><c r="D5"><v>123456789012345678</v></c>
    <c r="E5" t="inlineStr"><is><t/></is></c><c r="F5" s="1"><v>45292.5</v></c>
    <c r="G5" s="1"><v>-1</v></c><c r="H5" s="1"><v>60</v></c>
    <c r="I5" s="2"><v>0.25</v></c><c r="J5" t="e"><v>#N/A</v></c><c r="K5"><f/></c>
    </row><row r="10" s="1"/></sheetData><mergeCells><mergeCell ref="E5:E6"/></mergeCells></worksheet>`;
  const styles = `<styleSheet xmlns="${ns}"><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/></cellXfs></styleSheet>`;
  const bytes = await fixture({ sheets: [{ name: '教育-原表', state: 'hidden', xml }, { name: 'Empty', xml: `<worksheet xmlns="${ns}"><sheetData/></worksheet>` }], styles });
  const workbook = await readFile(file('用户原文件.xlsx', bytes));
  const sheet = workbook.sheets[0];
  assert.equal(sheet.name, '教育-原表');
  assert.equal(sheet.headers[0], '编号');
  assert.equal(sheet.rows[1][0], '0001-中文原值');
  assert.equal(sheet.rows[1][2], '[Formula has no cached value; shared formula ID 7]');
  assert.equal(sheet.rows[1][10], '[Formula has no cached value; expression missing in source file]');
  assert.ok([...workbook.notes, ...sheet.notes].every(note => !/\p{Script=Han}/u.test(note)));
  for (const text of ['cached results', 'without cached results', 'lost precision', 'Merged ranges', 'hidden time', 'negative', 'fictitious date', 'percentage', 'header is on source row 3', 'Empty rows', 'Trailing blank', 'error cells', 'hidden in the source file']) {
    assert.ok(sheet.notes.some(note => note.includes(text)), `missing English note: ${text}`);
  }
  const original = JSON.stringify({ name: sheet.name, headers: sheet.headers, rows: sheet.rows, sourceRows: sheet.sourceRows });
  setLocale('zh-CN');
  assert.ok(sheet.notes.map(note => localize(note)).every(note => /\p{Script=Han}/u.test(note)));
  assert.equal(JSON.stringify({ name: sheet.name, headers: sheet.headers, rows: sheet.rows, sourceRows: sheet.sourceRows }), original);
  assert.match(sheet.rows[1][2], /^\[Formula has no cached value/);
  const exported = await makeWorkbook([{ name: sheet.name, headers: sheet.headers, rows: sheet.rows }]);
  const reread = (await readFile(file('输出.xlsx', exported))).sheets[0];
  assert.deepEqual(reread.rows, sheet.rows, 'switching language before export does not rewrite formula placeholders or original values');
});

test('Dynamic XML labels and implicit cell references register complete translations in both directions', async () => {
  setLocale('en');
  const xml = `<!DOCTYPE worksheet [<!ENTITY x "value">]><worksheet xmlns="${ns}"><sheetData/></worksheet>`;
  const bytes = await fixture({ sheets: [{ name: 'Sample', xml }] });
  let errorMessage;
  try { await readFile(file('dtd.xlsx', bytes)); } catch (error) { errorMessage = error.message; }
  assert.equal(errorMessage, 'Worksheet “Sample” contains an unsupported DTD declaration.');
  assert.equal(localize(errorMessage, 'zh-CN'), '工作表“Sample” 含不支持的 DTD 声明。');
  const badCell = `<worksheet xmlns="${ns}"><sheetData><row r="4"><c t="s"><v>99</v></c></row></sheetData></worksheet>`;
  const badBytes = await fixture({ sheets: [{ name: 'Sample', xml: badCell }] });
  try { await readFile(file('bad.xlsx', badBytes)); } catch (error) { errorMessage = error.message; }
  assert.match(errorMessage, /^Cell row 4, column 1 has an invalid shared string reference/);
  assert.match(localize(errorMessage, 'zh-CN'), /^单元格 第 4 行第 1 列 的共享文本引用损坏/);
  assert.equal(getLocale(), 'en', 'translating one message must not change the active language');
});

test('English worksheet fallback names do not translate real worksheet names or previously exported names', async () => {
  setLocale('en');
  const tables = [{ name: '', headers: ['编号'], rows: [['0001']] }, { name: '原始教育', headers: ['姓名'], rows: [['张三']] }];
  const exported = await makeWorkbook(tables);
  const inEnglish = await readFile(file('表格.xlsx', exported));
  assert.deepEqual(inEnglish.sheets.map(sheet => sheet.name), ['Sheet 1', '原始教育']);
  assert.deepEqual(inEnglish.sheets.map(sheet => sheet.rows), [[['0001']], [['张三']]]);
  const noNameSource = await fixture({ sheets: [{ name: '', xml: `<worksheet xmlns="${ns}"><sheetData><row r="1">${headerCell('A', '编号')}</row><row r="2">${headerCell('A', '001', 2)}</row></sheetData></worksheet>` }] });
  assert.equal((await readFile(file('source.xlsx', noNameSource))).sheets[0].name, 'Sheet 1');
  setLocale('zh-CN');
  assert.deepEqual((await readFile(file('表格.xlsx', exported))).sheets.map(sheet => sheet.name), ['Sheet 1', '原始教育']);
  assert.equal((await readFile(file('新表.xlsx', await makeWorkbook([tables[0]])))).sheets[0].name, '工作表 1');
});
