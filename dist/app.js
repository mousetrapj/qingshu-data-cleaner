import { configurationFingerprint, assessRequirements, requirementNote, resultCounts, buildReportTables, splitReportTables, buildJSONReport } from './report.js';
import { PRESETS, TYPES, TYPE_MARKS, BASE_RULES, getExample } from './presets.js';
import { DEFAULT_OPTIONS, inferColumns, suggestDuplicateKeys, cleanData, parseRequirements } from './engine.js';
import { readFile, parseDelimited, makeCSV, makeWorkbook, downloadBlob, LIMITS } from './io.js';
import { tr, localize, getLocale, setLocale, formatNumber, formatDateTime } from './i18n.js';
import { translateStatic } from './ui-labels.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = formatNumber;
const label = value => esc(localize(value));
const ICONS = {
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 report:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
 book:'<path d="M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 2-3-3-6-3-9-2z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>','chevron-left':'<path d="m15 5-7 7 7 7"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 2v4M18 4h4"/>',
 sheet:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/><path d="M8 12h8v6H8zm4 0v6m-4-3h8"/>',
 clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
 sliders:'<path d="M4 6h8m4 0h4M4 12h3m4 0h9M4 18h10m4 0h2"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
 rows:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
 wand:'<path d="m4 20 13-13 3 3L7 23zM5 3v4M3 5h4M18 2v3M21 18v3M19.5 19.5h3"/>',
 alert:'<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
 copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M15 5V3H3v12h2"/>',
 bookmark:'<path d="M5 3h14v18l-7-4-7 4z"/>',pencil:'<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>','arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
 columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
 play:'<path d="m7 4 13 8-13 8z"/>',table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',
 education:'<path d="m2 8 10-5 10 5-10 5zM6 11v6c4 3 8 3 12 0v-6M22 8v8"/>',
 box:'<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5.7l9 5"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sheet}</svg>`;
function paintIcons(root=document){root.querySelectorAll('i[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});}


let storedPresets=[];
try { const raw=JSON.parse(localStorage.getItem('qingshu.presets.v1') || '[]'); if(Array.isArray(raw)) storedPresets=raw.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&Array.isArray(x.columns)&&x.options&&Array.isArray(x.keyNames)).slice(0,30); } catch {}
const state={preset:'education',filename:'',workbook:null,sheetIndex:0,headers:[],rows:[],sourceRows:[],columns:[],options:{...DEFAULT_OPTIONS,duplicateKeys:[]},result:null,dirty:false,view:'all',search:'',page:1,pageSize:10,original:false,demo:true,busy:false,notes:[],saved:storedPresets,requirements:null,lastRun:null,runContext:null,lastFile:null,importOptions:{encoding:'auto',delimiter:'auto'}};
let toastTimer,searchTimer;
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=localize(message);$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},error?6500:3500);}
function openDialog(title,body,buttons=[],wide=false){$('dialog-title').textContent=title;$('dialog-body').innerHTML=body;$('dialog-footer').replaceChildren();$('dialog').style.maxWidth=wide?'1040px':'760px';for(const b of buttons){const el=document.createElement('button');el.className=`button ${b.primary?'button-primary':'button-light'}`;el.textContent=b.label;el.disabled=!!b.disabled;el.addEventListener('click',b.action);$('dialog-footer').append(el);}paintIcons($('dialog'));if(!$('dialog').open)$('dialog').showModal();$('dialog-body').scrollTop=0;}
function closeDialog(){$('dialog').close();}
function setBusy(busy,message=tr('处理中…','Processing…')){state.busy=busy;$('run-button').disabled=busy;$('run-button').querySelector('span').textContent=busy?message:tr('运行清洗','Run cleaning');for(const id of ['import-button','demo-button','parse-button','locale-select'])$(id).disabled=busy;$('export-button').disabled=busy||!state.result||state.dirty;}
function markDirty(){if(state.result)state.dirty=true;renderRules();renderSummary();}
function currentPreset(){const preset=PRESETS.find(p=>p.id===state.preset);return preset?{...preset,name:localize(preset.name),description:localize(preset.description),hint:localize(preset.hint)}:{name:state.saved.find(p=>p.id===state.preset)?.name||tr('自定义配置','Custom configuration'),description:tr('当前使用你的自定义字段与清洗规则','Using your custom fields and cleaning rules'),hint:''};}
function currentRequirements(){return assessRequirements(state.requirements,$('requirements').value,state.columns,state.options);}
function renderRequirementStatus(){const note=requirementNote(currentRequirements());$('requirement-status').hidden=!note;$('requirement-status').textContent=note;}
function applyPreset(id){const preset=PRESETS.find(p=>p.id===id);if(!preset)return applySavedPreset(id);state.preset=id;state.columns=inferColumns(state.headers,state.rows,id);state.options={...DEFAULT_OPTIONS,duplicateKeys:suggestDuplicateKeys(state.columns,id)};state.requirements=null;markDirty();renderPresets();toast(tr(`已应用“${localize(preset.name,'zh-CN')}”规则，可继续调整`,`Applied “${localize(preset.name,'en')}”. You can adjust the rules.`));}
function renderPresets(){
 $('preset-list').innerHTML=PRESETS.map(p=>`<button class="preset-item ${p.id===state.preset?'active':''}" data-preset="${p.id}" title="${label(p.name)}">${icon(p.icon)}${label(p.name)}</button>`).join('');
 $('preset-select').innerHTML=PRESETS.map(p=>`<option value="${p.id}">${label(p.name)}</option>`).join('')+(state.saved.length?`<optgroup label="${tr('我的预设','My presets')}">${state.saved.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`:'');
 $('preset-select').value=state.preset;
 if(!$('preset-select').value){const option=document.createElement('option');option.value=state.preset;option.textContent=tr('自定义配置','Custom configuration');$('preset-select').append(option);$('preset-select').value=state.preset;}
 $('saved-list').innerHTML=state.saved.length?state.saved.map(p=>`<div class="saved-item"><button data-load-saved="${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)}</button><button class="icon-button" data-delete-saved="${esc(p.id)}" aria-label="${esc(tr(`删除预设 ${p.name}`,`Delete preset ${p.name}`))}">${icon('close')}</button></div>`).join(''):`<p class="saved-empty">${tr('把常用规则存下来，<br>下次直接使用。','Save your usual rules<br>for next time.')}</p>`;
 $('preset-description').textContent=currentPreset().description;
}
function renderRules(){
 const focusedRule=document.activeElement?.dataset?.rule;
 $('base-rules').innerHTML=BASE_RULES.map(r=>`<label class="rule-line"><span>${label(r.title)}<small>${label(r.note)}</small></span><input class="switch" type="checkbox" data-rule="${r.key}" ${state.options[r.key]?'checked':''} aria-label="${label(r.title)}"></label>`).join('');
 const keys=state.options.duplicateKeys||[];
 $('duplicate-keys').innerHTML=keys.length?keys.map(i=>`<span class="key-chip">${icon('key')}${esc(state.columns[i]?.name||tr('未知字段','Unknown field'))}</span>`).join(''):`<span class="no-keys">${state.options.duplicateMode==='removeExact'?tr('按整行精确匹配（含空值）','Exact full-row match, including blanks'):tr('尚未设置去重字段','No duplicate keys selected')}</span>`;
 $('duplicate-mode').value=state.options.duplicateMode;
 const enabled=BASE_RULES.filter(r=>state.options[r.key]).length,required=state.columns.filter(c=>c.required).length;
 const dedup=keys.length?tr(`${keys.length} 个去重字段`,`${keys.length} duplicate key fields`):state.options.duplicateMode==='removeExact'?tr('整行精确去重','Exact full-row deduplication'):tr('未启用重复检查','Duplicate check off');
 $('rule-summary').textContent=tr(`${enabled} 项基础规则 · ${required} 个必填字段 · ${localize(dedup,'zh-CN')}`,`${enabled} base rules · ${required} required fields · ${localize(dedup,'en')}`);
 $('field-count').textContent=tr(`${state.columns.length} 列`,`${state.columns.length} cols`);
 renderRequirementStatus();
 if(focusedRule){const control=[...$('base-rules').querySelectorAll('[data-rule]')].find(element=>element.dataset.rule===focusedRule);control?.focus({preventScroll:true});}
}
function renderSource(){
 $('source-name').textContent=state.filename;
 $('source-tag').textContent=state.demo?tr('虚构示例','Fictional sample'):tr('已导入','Imported');
 const encoding=localize(state.workbook?.encoding||tr('本机数据','Local data'));
 $('source-meta').textContent=tr(`${format(state.rows.length)} 行 · ${state.headers.length} 列 · ${encoding}${state.demo?' · 可直接运行体验':' · 文件在本机处理'}`,`${format(state.rows.length)} rows · ${state.headers.length} columns · ${encoding}${state.demo?' · Ready to try':' · Processed locally'}`);
 const sheets=state.workbook?.sheets||[];
 $('sheet-control').hidden=sheets.length<2;
 $('sheet-select').innerHTML=sheets.map((s,i)=>`<option value="${i}">${esc(s.name)} (${format(s.rows.length)} ${tr('行','rows')})</option>`).join('');$('sheet-select').value=state.sheetIndex;
 const notes=[...new Set([...(state.workbook?.notes||[]),...state.notes])];
 $('source-notes').hidden=!notes.length;
 $('source-notes').innerHTML=notes.length?`<details><summary>${tr(`导入说明 · ${notes.length} 项需要留意`,`Import notes · ${notes.length} items to review`)}</summary><ul>${notes.map(n=>`<li>${label(n)}</li>`).join('')}</ul></details>`:'';
}
function renderSummary(){
 const result=state.result,stats=result?.stats;
 $('stat-input').textContent=format(state.rows.length);
 $('stat-input-note').textContent=tr(`${state.columns.length} 个字段 · 不含表头`,`${state.columns.length} fields · Excluding header`);
 $('stat-changed').textContent=stats?format(stats.changedRows):'—';
 $('stat-changed-note').textContent=stats?tr(`${format(stats.changedCells)} 处单元格修改`,`${format(stats.changedCells)} cell changes`):tr('运行后查看修改数量','Run cleaning to see changes');
 $('stat-review').textContent=stats?format(stats.reviewRows):'—';
 $('stat-review-note').textContent=stats?tr(`${format(resultCounts(result).reviewIssueCount)} 个问题 · 原值可追溯`,`${format(resultCounts(result).reviewIssueCount)} issues · Originals retained`):tr('无法确定的内容保留原值','Uncertain values stay as entered');
 $('stat-duplicates').textContent=stats?format(stats.duplicateRows):'—';
 $('stat-duplicates-note').textContent=stats?tr(`${format(stats.duplicateGroups)} 组 · 首条之外的重复记录`,`${format(stats.duplicateGroups)} groups · Excluding first rows`):tr('按指定字段检查重复','Checked against your selected keys');
 $('tab-changed-count').textContent=stats?format(stats.changedRows):0;$('tab-review-count').textContent=stats?format(stats.reviewRows):0;$('tab-duplicates-count').textContent=stats?format(stats.duplicateRows):0;
 $('preview-count').textContent=format(state.rows.length);
 $('stale-banner').hidden=!state.dirty;
 $('preview-state').classList.toggle('ready',!!result&&!state.dirty);
 $('preview-state').innerHTML=`<span></span>${state.dirty?tr('规则已变更','Rules changed'):result?tr('预览已就绪','Preview ready'):tr('待运行','Ready to run')}`;
 const runTime=state.lastRun?.toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'})||'';
 $('preview-subtitle').textContent=state.dirty?tr('当前显示上次结果，请按新规则重新运行','Showing the previous run. Run again to apply your changes.'):result?tr(`处理完成 · ${runTime}`,`Completed · ${runTime}`):tr('逐项检查，让每次修改都有依据','Inspect each change and its reason');
 $('export-button').disabled=state.busy||!result||state.dirty;
 $('step-config').className=`step ${result&&!state.dirty?'done':'active'}`;$('step-export').className=`step ${result&&!state.dirty?'active':''}`;
 if(stats){
  $('result-title').textContent=stats.reviewRows?tr(`已完成规则处理，${format(stats.reviewRows)} 条记录待确认`,`Cleaning complete. ${format(stats.reviewRows)} records need review.`):tr('已完成规则处理，请检查后导出','Cleaning complete. Review your results before exporting.');
  const unresolved=state.runContext?.requirements?.unresolved.length||0;
  $('result-description').textContent=tr(`原始 ${format(stats.inputRows)} 条，输出 ${format(stats.outputRows)} 条。${stats.removedRows?`移除 ${format(stats.removedRows)} 条（含 ${format(resultCounts(result).removedEmptyRows)} 条空行），均可在报告中追溯。`:'所有记录均已保留。'}${unresolved?`还有 ${unresolved} 项需求未自动执行。`:''}`,`${format(stats.inputRows)} input records, ${format(stats.outputRows)} output records. ${stats.removedRows?`${format(stats.removedRows)} removed, including ${format(resultCounts(result).removedEmptyRows)} blank rows; all retained in the audit report.`:'All records were retained.'}${unresolved?` ${unresolved} requirements were not executed.`:''}`);
 }else{$('result-title').textContent=tr('先查看，再做决定','Review before you decide');$('result-description').textContent=tr('运行清洗后，可以查看每一处变化和待确认问题。预览不会修改源文件。','Run cleaning to inspect every change and issue. Your source file stays untouched.');}
}
function visibleRows(){
 let list=state.result?.rows||state.rows.map((values,i)=>({sourceRow:state.sourceRows[i]||i+2,original:values,values,changes:[],issues:[],removed:false,duplicateOf:null,status:'clean'}));
 if(state.view==='changed')list=list.filter(r=>r.changes.length);
 if(state.view==='review')list=list.filter(r=>!r.removed&&r.issues.length);
 if(state.view==='duplicates'){
  const ids=new Set();for(const d of state.result?.duplicates||[]){ids.add(d.sourceRow);if(d.duplicateOf!=null)ids.add(d.duplicateOf);}list=list.filter(r=>ids.has(r.sourceRow)||r.duplicateOf!=null);
 }
 const query=state.search.trim().toLowerCase();if(query)list=list.filter(r=>[r.sourceRow,...(state.original?r.original:r.values)].some(v=>String(v).toLowerCase().includes(query)));
 return list;
}
function renderTable(){
 const list=visibleRows(),pages=Math.max(1,Math.ceil(list.length/state.pageSize));state.page=Math.max(1,Math.min(state.page,pages));
 const offset=(state.page-1)*state.pageSize,display=list.slice(offset,offset+state.pageSize);
 const headers=state.original?state.headers:state.result?.headers||state.headers;
 $('data-table').querySelector('thead').innerHTML=`<tr><th scope="col">${tr("原行","Source row")}</th><th scope="col">${tr("状态","Status")}</th>${headers.map((h,i)=>`<th scope="col" title="${esc(h)}"><span class="col-type">${TYPE_MARKS[state.columns[i]?.type]||'T'}</span>${esc(h)}</th>`).join('')}</tr>`;
 const statuses={review:tr("待确认", "Needs review"),duplicate:tr("重复", "Duplicate"),changed:tr("已规范化", "Normalized"),clean:state.result?tr("无变化", "Unchanged"):tr("待检查", "Unchecked"),removed:tr("已移除", "Removed")};
 $('data-table').querySelector('tbody').innerHTML=display.map(row=>{
  const changed=new Set(row.changes.map(c=>c.column)),issues=new Set(row.issues.map(i=>i.column));
  return `<tr tabindex="0" data-row="${row.sourceRow}" class="${row.removed?'removed':''}" aria-label="${tr(`查看原文件第 ${row.sourceRow} 行详情`,`View source row ${row.sourceRow}`)}"><td>${row.sourceRow}</td><td><span class="status-label ${row.status}">${statuses[row.status]||tr("待检查", "Unchecked")}</span></td>${(state.original?row.original:row.values).map((v,i)=>`<td class="${!state.original&&changed.has(i)?'modified ':''}${issues.has(i)?'problem':''}" title="${esc(v)}">${String(v)===''?'<span style="color:#bdc5b8">—</span>':esc(v)}</td>`).join('')}</tr>`;
 }).join('');
 $('table-empty').hidden=display.length>0;$('data-table').hidden=display.length===0;
 $('page-info').textContent=list.length?tr(`${offset+1}–${Math.min(offset+state.pageSize,list.length)} / 共 ${format(list.length)} 条`,`${offset+1}–${Math.min(offset+state.pageSize,list.length)} of ${format(list.length)} records`):tr('共 0 条','0 records');
 $('page-number').textContent=`${state.page} / ${pages}`;$('prev-page').disabled=state.page===1;$('next-page').disabled=state.page===pages;
 document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===state.view;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
}
function render(){renderPresets();renderSource();renderRules();renderSummary();renderTable();}

function selectSheet(index){
 const sheet=state.workbook?.sheets[index];if(!sheet)throw new Error(tr("未找到可处理的工作表", "No processable worksheet found"));
 state.sheetIndex=index;state.headers=sheet.headers;state.rows=sheet.rows;state.sourceRows=sheet.sourceRows||sheet.rows.map((_,i)=>i+2);state.notes=[...(sheet.notes||[])];
 state.columns=inferColumns(state.headers,state.rows,PRESETS.some(p=>p.id===state.preset)?state.preset:'generic');state.options={...DEFAULT_OPTIONS,duplicateKeys:suggestDuplicateKeys(state.columns,state.preset)};
 state.result=null;state.dirty=false;state.view='all';state.page=1;state.search='';state.original=false;state.requirements=null;state.lastRun=null;state.runContext=null;
 $('search-input').value='';$('original-toggle').checked=false;
 if(state.saved.some(p=>p.id===state.preset))applySavedPreset(state.preset,false);
 render();
}
function loadExample(id='education',initial=false){
 const sample=getExample(id);state.preset=id;state.filename=sample.name;state.demo=true;state.lastFile=null;state.workbook={sheets:[{name:tr("示例数据", "Sample data"),headers:[...sample.headers],rows:sample.rows.map(r=>[...r]),sourceRows:sample.rows.map((_,i)=>i+2),notes:[]}],notes:[],encoding:tr("内置示例", "Built-in sample")};
 $('requirements').value=sample.requirements;selectSheet(0);
 if(!initial)toast(tr(`已加载${localize(PRESETS.find(p=>p.id===id).name,"zh-CN")}示例`,`Loaded ${localize(PRESETS.find(p=>p.id===id).name,"en")} sample`));
}
async function importFile(file){
 if(!file||state.busy)return;setBusy(true,tr("读取文件…", "Reading file…"));
 try{const workbook=await readFile(file,state.importOptions);if(!workbook.sheets?.length)throw new Error(tr("文件中没有可处理的数据", "No processable data in this file"));state.workbook=workbook;state.filename=file.name;state.demo=false;state.lastFile=file;$('requirements').value='';selectSheet(0);toast(tr(`已导入 ${format(state.rows.length)} 行，请核对字段与规则`,`Imported ${format(state.rows.length)} rows. Review the fields and rules.`));}
 catch(error){toast(error.message||tr("文件读取失败，请检查文件格式", "Could not read the file. Check its format."),true);}
 finally{setBusy(false);$('file-input').value='';}
}
async function run(){
 if(state.busy)return;if(!state.headers.length)return toast(tr("请先导入包含表头的数据", "Import data with a header row first."),true);
 const names=state.columns.map(c=>c.outputName.trim());if(names.some(n=>!n)||new Set(names).size!==names.length)return toast(tr("请将导出列名设为非空且唯一", "Export column names must be non-empty and unique."),true);
 setBusy(true,tr("正在清洗…", "Cleaning…"));
 try{await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));state.result=cleanData({headers:state.headers,rows:state.rows,sourceRows:state.sourceRows,columns:state.columns,options:state.options});state.dirty=false;state.lastRun=new Date();state.runContext={result:state.result,headers:[...state.headers],columns:state.columns.map(c=>({...c})),options:{...state.options,duplicateKeys:[...state.options.duplicateKeys]},filename:state.filename,sheetName:state.workbook?.sheets[state.sheetIndex]?.name||'',presetName:currentPreset().name,presetId:state.preset,processedAt:state.lastRun.toISOString(),importNotes:[...new Set([...(state.workbook?.notes||[]),...state.notes])],requirements:currentRequirements()};state.page=1;renderSummary();renderTable();toast(tr(`处理完成：${format(state.result.stats.outputRows)} 条输出，${format(state.result.stats.reviewRows)} 条待确认`,`Complete: ${format(state.result.stats.outputRows)} output records; ${format(state.result.stats.reviewRows)} need review.`));}
 catch(error){toast(error.message||tr("处理失败，请检查规则配置", "Cleaning failed. Check your rules."),true);}
 finally{setBusy(false);}
}

function showFields(){
 const keys=new Set(state.options.duplicateKeys||[]);
 openDialog(tr('字段与业务规则','Fields and business rules'),`<p class="dialog-note">${esc(currentPreset().hint||tr('按表格实际内容设置字段类型与重复依据。','Set field types and duplicate keys to match your data.'))} ${tr('编号始终按文本处理，无法恢复源文件已经丢失的数字。','IDs are always treated as text. Digits already lost in the source file cannot be restored.')}</p><div class="table-dialog-wrap"><table id="fields-table"><thead><tr><th>${tr('原字段','Source field')}</th><th>${tr('导出列名','Export name')}</th><th>${tr('字段类型','Field type')}</th><th>${tr('必填','Required')}</th><th>${tr('去重依据','Duplicate key')}</th></tr></thead><tbody>${state.columns.map((c,i)=>`<tr data-index="${i}"><td>${esc(c.name)}</td><td><input type="text" data-field="outputName" aria-label="${esc(tr(`${c.name}的导出名称`,`Export name for ${c.name}`))}" value="${esc(c.outputName)}" maxlength="120"></td><td><select data-field="type" aria-label="${esc(tr(`${c.name}的类型`,`Type for ${c.name}`))}">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${c.type===k?'selected':''}>${label(v)}</option>`).join('')}</select></td><td><input type="checkbox" data-field="required" aria-label="${esc(tr(`${c.name}必填`,`${c.name} is required`))}" ${c.required?'checked':''}></td><td><input type="checkbox" data-field="key" aria-label="${esc(tr(`按${c.name}去重`,`Use ${c.name} as a duplicate key`))}" ${keys.has(i)?'checked':''}></td></tr>`).join('')}</tbody></table></div><p class="dialog-note" style="margin-top:14px">${tr('选择多个去重字段时，按字段组合检查。未选择字段时，“移除完全相同的重复行”会按整行匹配。','Multiple keys are checked as a combination. With no keys selected, “Remove exact duplicates” compares the whole row.')}</p>`,[
 {label:tr('取消','Cancel'),action:closeDialog},{label:tr('应用字段设置','Apply field settings'),primary:true,action:()=>{
  const columns=state.columns.map(c=>({...c})),newKeys=[];$('fields-table').querySelectorAll('tbody tr').forEach(element=>{const i=Number(element.dataset.index);columns[i].outputName=element.querySelector('[data-field="outputName"]').value.trim();columns[i].type=element.querySelector('[data-field="type"]').value;columns[i].required=element.querySelector('[data-field="required"]').checked;if(element.querySelector('[data-field="key"]').checked)newKeys.push(i);});
  const names=columns.map(c=>c.outputName);if(names.some(n=>!n)||new Set(names).size!==names.length)return toast(tr('导出列名不能为空或重复','Export column names cannot be blank or duplicated.'),true);
  state.columns=columns;state.options.duplicateKeys=newKeys;markDirty();closeDialog();toast(tr('字段设置已更新，请重新运行清洗','Field settings updated. Run cleaning again.'));
 }}],true);
}
function showRequirementDraft(){
 const text=$('requirements').value.trim();if(!text)return toast(tr('先写下你的清洗需求，再生成草案','Enter your requirements to generate a rule draft.'));
 if(text.length>6000)return toast(tr('请将需求控制在 6000 字以内，按条目描述','Keep requirements under 6,000 characters, one item per line.'),true);
 let draft;try{draft=parseRequirements(text,state.columns,state.options);}catch(error){return toast(error.message||tr('无法生成规则草案','Could not generate the rule draft'),true);}
 const known=draft.recognized||[],unknown=draft.unresolved||[];
 openDialog(tr('核对你的规则草案','Review your rule draft'),`<p class="dialog-note">${tr('这是常用规则识别器。请核对字段与处理含义；未识别要求会保留为“待确认”，不自动执行。','This is a deterministic rule parser. Check each field and action. Unsupported requirements stay under review and are not executed.')}</p><h3 class="draft-section-title">${tr(`可应用 · ${known.length} 项`,`Ready to apply · ${known.length}`)}</h3>${known.length?known.map(r=>`<div class="draft-item">${icon('check')}<div><strong>${label(r.description)}</strong><p>${tr('你的要求：','Your requirement: ')}${esc(r.text)}</p></div></div>`).join(''):`<p class="dialog-note">${tr('暂未识别到可执行规则。可以使用下面的写法，或直接在“字段设置”中配置。','No supported rules found. Try the examples below or configure rules in field settings.')}</p>`}${unknown.length?`<h3 class="draft-section-title">${tr(`待确认 · ${unknown.length} 项`,`Needs clarification · ${unknown.length}`)}</h3>${unknown.map(r=>`<div class="draft-item warn">${icon('alert')}<div><strong>${esc(r.text)}</strong><p>${label(r.reason||tr('超出当前规则识别范围，请手动配置或明确处理方式。','This requirement is unsupported. Configure it manually or clarify the action.'))}</p></div></div>`).join('')}`:''}<p class="dialog-note" style="margin-top:17px">${tr('建议一条需求写一行。例如：“姓名和学号必填”“按学号+课程检查重复”“将姓名重命名为学员姓名”。带金额的值请先确认币种；“自动补齐”“按业务判断合并”等需求需要进一步定义。','Use one requirement per line, with the exact field names. Examples: “Name and Student ID are required”, “Check duplicates by Student ID + Course”, or “Rename Name to Student Name”. Confirm currencies separately. Filling missing information or merging by business judgment needs further definition.')}</p>`,[
 {label:tr('返回修改','Back to edit'),action:closeDialog},{label:known.length?tr(`应用 ${known.length} 项已识别规则`,`Apply ${known.length} recognized rules`):tr('保留为待确认需求','Keep for review'),primary:true,action:()=>{
  state.columns=draft.columns;state.options=draft.options;state.requirements={text,recognized:known,unresolved:unknown,fingerprint:configurationFingerprint(state.columns,state.options)};markDirty();renderPresets();closeDialog();toast(unknown.length?tr(`已记录草案，${unknown.length} 项需求待确认`,`Draft saved; ${unknown.length} requirements need clarification.`):tr('规则草案已应用，请运行清洗','Rule draft applied. Run cleaning to see the result.'));
 }}]);
}
function showRow(sourceRow){
 const row=(state.result?.rows||visibleRows()).find(r=>r.sourceRow===sourceRow);if(!row)return;
 const status=row.removed?tr('已移除，原记录保留在处理报告','Removed; original retained in the audit report'):row.issues.length?tr(`${row.issues.length} 个问题待确认`,`${row.issues.length} issues to review`):row.changes.length?tr(`${row.changes.length} 处已规范化`,`${row.changes.length} cell changes`):tr('未修改','Unchanged');
 openDialog(tr(`原文件第 ${sourceRow} 行`,`Source row ${sourceRow}`),`<div class="row-detail-summary"><span class="chip">${esc(status)}</span>${row.duplicateOf?`<span>${tr(`关联原行：${row.duplicateOf}`,`Related source row: ${row.duplicateOf}`)}</span>`:''}</div>${row.issues.filter(i=>i.column==null).map(i=>`<p class="issue-pill">${label(i.message)}</p>`).join('')}<div class="table-dialog-wrap"><table><thead><tr><th>${tr('字段','Field')}</th><th>${tr('原始值','Original value')}</th><th>${tr('处理后','Processed value')}</th><th>${tr('说明','Details')}</th></tr></thead><tbody>${state.headers.map((h,i)=>{
  const changes=row.changes.filter(c=>c.column===i),issues=row.issues.filter(item=>item.column===i);
  return `<tr><td>${esc(h)}</td><td><div class="detail-cell-value">${row.original[i]===''?tr('（空值）','(blank)'):esc(row.original[i])}</div></td><td><div class="detail-cell-value ${changes.length?'changed-value':''}">${row.values[i]===''?tr('（空值）','(blank)'):esc(row.values[i])}</div></td><td>${changes.map(c=>`<div>${label(c.reason)}</div>`).join('')}${issues.map(item=>`<span class="issue-pill">${label(item.message)}</span>`).join('<br>')}</td></tr>`;
 }).join('')}</tbody></table></div>`,[{label:tr('关闭','Close'),action:closeDialog}],true);
}
function savePreset(){
 openDialog(tr('保存为我的预设','Save to my presets'),`<p class="dialog-note">${tr('保存字段规则、去重依据和基础选项，供下次使用。仅保存在当前浏览器；不会保存表格内容。','Save field rules, duplicate keys and base options for next time. Presets are stored in this browser; table contents are not saved.')}</p><div class="field-row vertical"><label for="preset-name-input">${tr('预设名称','Preset name')}</label><input id="preset-name-input" type="text" maxlength="40" placeholder="${tr('例如：培训机构报名表 / 供应商产品目录','e.g. Training registrations / Supplier catalog')}"></div><div class="saved-preview-note">${tr('加载预设时按原字段名匹配。未匹配的字段和去重依据会明确提示，请重新确认。','Presets match original field names. Missing fields and duplicate keys are flagged for review.')}</div>`,[
 {label:tr('取消','Cancel'),action:closeDialog},{label:tr('保存预设','Save preset'),primary:true,action:()=>{
  const name=$('preset-name-input').value.trim();if(!name)return toast(tr('请填写预设名称','Enter a preset name.'));if(state.saved.length>=30)return toast(tr('最多保存 30 个预设，请先删除不再使用的预设','You can save up to 30 presets. Delete an unused preset first.'),true);
  const preset={id:`custom-${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)}`,name,columns:state.columns.map(c=>({...c})),options:{...state.options,duplicateKeys:[]},keyNames:state.options.duplicateKeys.map(i=>state.columns[i].name)};
  const next=[...state.saved,preset];try{localStorage.setItem('qingshu.presets.v1',JSON.stringify(next));}catch{return toast(tr('当前浏览器无法保存配置，请检查浏览器存储设置','Could not save settings. Check your browser storage settings.'),true);}
  state.saved=next;state.preset=preset.id;renderPresets();closeDialog();toast(tr(`已保存“${name}”`,`Saved “${name}”`));
 }}]);
 $('preset-name-input').focus();
}
function applySavedPreset(id,notify=true){
 const preset=state.saved.find(p=>p.id===id);if(!preset)return;
 state.preset=id;const missing=preset.columns.filter(c=>!state.headers.includes(c.name)).map(c=>c.name);
 state.columns=inferColumns(state.headers,state.rows,'generic').map(c=>{const known=preset.columns.find(p=>p.name===c.name);return known?{...c,outputName:String(known.outputName||c.name),type:TYPES[known.type]?known.type:c.type,required:!!known.required}:c;});
 state.options={...DEFAULT_OPTIONS};for(const rule of BASE_RULES){if(typeof preset.options[rule.key]==='boolean')state.options[rule.key]=preset.options[rule.key];}
 const keyNames=preset.keyNames||[],missingKeys=keyNames.filter(n=>!state.headers.includes(n));state.options.duplicateMode=['mark','removeExact'].includes(preset.options.duplicateMode)?preset.options.duplicateMode:'mark';
 state.options.duplicateKeys=missingKeys.length?[]:keyNames.map(name=>state.headers.indexOf(name));
 if(missingKeys.length)state.options.duplicateMode='mark';
 if(missing.length||missingKeys.length){state.notes.push(tr(`预设“${preset.name}”未匹配字段：${missing.join('、')||'无'}。${missingKeys.length?'缺少去重依据，重复检查已暂停，请重新设置。':'请确认当前字段规则。'}`,`Preset “${preset.name}” has unmatched fields: ${missing.join(', ')||'none'}. ${missingKeys.length?'Duplicate keys are missing. Duplicate checking is paused until you configure them.':'Review the current field rules.'}`));}
 state.requirements=null;markDirty();renderPresets();renderSource();
 if(notify){
  if(missing.length||missingKeys.length){openDialog(tr('预设已加载，请确认字段','Preset loaded. Review field matches.'),`<p class="dialog-note">${tr('已应用能匹配到的字段规则。','Rules for matching fields have been applied.')}</p>${missing.length?`<p>${esc(tr(`当前表格没有以下预设字段：${missing.join('、')}。`,`These preset fields are missing from the current table: ${missing.join(', ')}.`))}</p>`:''}${missingKeys.length?`<div class="draft-item warn">${icon('alert')}<div>${esc(tr(`缺少去重依据：${missingKeys.join('、')}。`,`Missing duplicate keys: ${missingKeys.join(', ')}.`))}<p>${tr('重复检查已暂停，请选择完整的去重字段后再运行。','Duplicate checking is paused. Select a complete set of keys before running.')}</p></div></div>`:''}`,[{label:tr('检查字段','Review fields'),primary:true,action:showFields}]);}
  else toast(tr(`已加载“${preset.name}”`,`Loaded “${preset.name}”`));
 }
}
function deletePreset(id){const item=state.saved.find(p=>p.id===id);if(!item)return;openDialog(tr('删除已保存的预设','Delete saved preset'),`<p>${esc(tr(`删除“${item.name}”？当前工作台上的规则仍可继续使用。`,`Delete “${item.name}”? The current workspace rules will remain available.`))}</p>`,[{label:tr('取消','Cancel'),action:closeDialog},{label:tr('删除预设','Delete preset'),primary:true,action:()=>{const next=state.saved.filter(p=>p.id!==id);try{localStorage.setItem('qingshu.presets.v1',JSON.stringify(next));}catch{return toast(tr('无法更新浏览器存储','Could not update browser storage.'),true);}state.saved=next;if(state.preset===id)state.preset='custom-unsaved';renderPresets();closeDialog();toast(tr('预设已删除','Preset deleted.'));}}]);}

function showExamples(){openDialog(tr('选择一份示例数据','Choose a sample dataset'),`<p class="dialog-note">${tr('用虚构数据体验清洗流程。加载示例将替换当前工作台的数据，不会修改你的源文件。','Try the cleaning workflow with fictional data. Loading a sample replaces the current workspace data and leaves your source file untouched.')}</p><div class="demo-grid">${PRESETS.map(p=>`<button class="demo-card" data-demo="${p.id}">${icon(p.icon)}<strong>${label(p.name)}</strong><p>${label(p.description)}<br>${tr(`${getExample(p.id).rows.length} 行 · 含格式问题和重复示例`,`${getExample(p.id).rows.length} rows · Format issues and duplicates`)}</p></button>`).join('')}</div>`,[{label:tr('取消','Cancel'),action:closeDialog}]);$('dialog-body').querySelectorAll('[data-demo]').forEach(b=>b.addEventListener('click',()=>{loadExample(b.dataset.demo);closeDialog();}));}
function showPaste(){
 openDialog(tr('粘贴表格数据','Paste table data'),`<p class="dialog-note">${tr('从 Excel 复制含表头的区域，或粘贴 CSV / TSV 文本。首个非空行用作表头。','Copy a range from Excel including headers, or paste CSV / TSV text. The first non-empty row becomes the header.')}</p><textarea id="paste-input" spellcheck="false" aria-label="${tr('粘贴表格数据','Paste table data')}" placeholder="${tr('学号\t姓名\t课程\n0001\t林予安\tPython 基础','Student ID\tName\tCourse\n0001\tAlex Lin\tPython Basics')}"></textarea>`,[{label:tr('取消','Cancel'),action:closeDialog},{label:tr('导入文本','Import text'),primary:true,action:()=>{
  const text=$('paste-input').value;if(!text.trim())return toast(tr('请先粘贴数据','Paste data first.'));if(new Blob([text]).size>LIMITS.maxFileBytes)return toast(tr('文本超过 10 MB，请分批处理','Text exceeds 10 MB. Split it into smaller batches.'),true);
  try{const parsed=parseDelimited(text,{delimiter:'auto',maxRows:LIMITS.maxRows,maxColumns:LIMITS.maxColumns});state.workbook={sheets:[{name:tr('粘贴数据','Pasted data'),...parsed}],notes:[],encoding:tr('文本粘贴','Pasted text')};state.filename=tr('粘贴表格','Pasted table');state.demo=false;state.lastFile=null;$('requirements').value='';selectSheet(0);closeDialog();toast(tr('数据已导入，请确认字段规则','Data imported. Review the field rules.'));}catch(error){toast(error.message||tr('无法解析粘贴内容','Could not parse the pasted data.'),true);}
 }}]);
 $('paste-input').focus();
}
function showImportSettings(){
 openDialog(tr('CSV 导入选项','CSV import options'),`<p class="dialog-note">${tr('一般保留自动识别即可。CSV 出现乱码或分列不正确时，可以指定编码和分隔符，再重新读取当前文件。Excel 不使用这些选项。','Automatic detection usually works. If CSV text is garbled or columns are incorrect, choose an encoding and delimiter, then reload the file. These options do not affect Excel files.')}</p><div class="field-row"><label for="encoding-setting">${tr('文件编码','File encoding')}</label><select id="encoding-setting"><option value="auto">${tr('自动（UTF-8 / GB18030）','Automatic (UTF-8 / GB18030)')}</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option></select></div><div class="field-row"><label for="delimiter-setting">${tr('字段分隔符','Field delimiter')}</label><select id="delimiter-setting"><option value="auto">${tr('自动识别','Automatic')}</option><option value=",">${tr('逗号 ,','Comma ,')}</option><option value="tab">${tr('制表符 Tab','Tab')}</option><option value=";">${tr('分号 ;','Semicolon ;')}</option></select></div>`,[{label:tr('取消','Cancel'),action:closeDialog},{label:state.lastFile?tr('保存并重新读取','Save and reload'):tr('保存选项','Save options'),primary:true,action:()=>{
  const delimiter=$('delimiter-setting').value;state.importOptions={encoding:$('encoding-setting').value,delimiter:delimiter==='tab'?'\t':delimiter};closeDialog();if(state.lastFile)importFile(state.lastFile);else toast(tr('导入选项已保存，将用于下一次导入','Options saved for the next import.'));
 }}]);$('encoding-setting').value=state.importOptions.encoding;$('delimiter-setting').value=state.importOptions.delimiter==='\t'?'tab':state.importOptions.delimiter;
}

function reportTables(){return buildReportTables(state.runContext);}

const safeName=name=>String(name).replace(/\.(csv|tsv|xlsx|xls)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||tr('表格','table');
async function exportResult(kind){
 if(!state.result||state.dirty||state.busy)return toast(tr('请先按当前规则运行清洗','Run cleaning with the current rules first.'),true);
 const filename=safeName(state.filename),tables=reportTables();
 const suffix={xlsx:tr('清洗结果','cleaning-results'),csv:tr('清洗数据_安全版','cleaned-data_safe'),issues:tr('异常与移除清单','issues-and-removed'),json:tr('处理报告','processing-report')}[kind];
 if(!suffix)return;
 try{
  setBusy(true,tr('正在导出…','Exporting…'));$('dialog-body').querySelectorAll('button').forEach(b=>b.disabled=true);
  if(kind==='xlsx'){const bytes=await makeWorkbook(splitReportTables(tables));downloadBlob(bytes,`${filename}_${suffix}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
  else if(kind==='csv'){downloadBlob(makeCSV(tables[0].headers,tables[0].rows,{safe:true}),`${filename}_${suffix}.csv`,'text/csv;charset=utf-8');}
  else if(kind==='issues'){const bytes=await makeWorkbook(splitReportTables([tables[1],tables[3],tables[4]]));downloadBlob(bytes,`${filename}_${suffix}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
  else if(kind==='json'){const report=buildJSONReport(state.runContext);downloadBlob(JSON.stringify(report,null,2),`${filename}_${suffix}.json`,'application/json;charset=utf-8');}
  toast(tr('下载已准备好，请查看浏览器下载列表','Download ready. Check your browser downloads.'));
 }catch(error){toast(error.message||tr('导出失败，请重试','Export failed. Try again.'),true);}
 finally{$('dialog-body').querySelectorAll('button').forEach(b=>b.disabled=false);setBusy(false);}
}
function showExport(){
 if(!state.result||state.dirty)return toast(tr('请先按当前规则运行清洗','Run cleaning with the current rules first.'));
 const s=state.result.stats,unresolved=state.runContext.requirements.unresolved.length;
 const choices=[
  ['xlsx','sheet',tr('完整清洗结果 · Excel','Complete results · Excel'),tr('7 类工作表：数据、问题、修改、重复、移除、规则、报告。较长明细会分表。','Seven sheet categories: data, issues, changes, duplicates, removals, rules and report. Long audit logs are split across sheets.')],
  ['issues','alert',tr('异常与移除清单 · Excel','Issues and removals · Excel'),tr('单独交付待确认问题、重复记录和已移除数据。','Export issues to review, duplicate checks and removed records separately.')],
  ['csv','table',tr('清洗数据 · 安全 CSV','Cleaned data · Safe CSV'),tr('对可能被当作公式的文本加保护前缀。Excel 仍可能推断编号类型。','Prefixes text that could be interpreted as a formula. Excel may still infer numeric types for IDs.')],
  ['json','report',tr('处理报告 · JSON','Processing report · JSON'),tr('保存统计、规则配置与未执行需求，不含整表记录。','Save statistics, rule settings and unexecuted requirements, without full table records.')],
 ];
 openDialog(tr('导出处理结果','Export results'),`<p class="dialog-note">${esc(requirementNote(state.runContext.requirements))}</p><p class="dialog-note">${tr(`输出 ${format(s.outputRows)} 条记录，其中 ${format(s.reviewRows)} 条仍需确认。`,`Exporting ${format(s.outputRows)} records; ${format(s.reviewRows)} still need review.`)} ${unresolved?tr(`${unresolved} 项需求尚未自动执行，已写入报告。`,`${unresolved} requirements were not executed and are included in the report.`):''}</p><div class="export-options">${choices.map(([kind,mark,title,note])=>`<button class="export-option ${kind==='xlsx'?'primary':''}" data-export="${kind}">${icon(mark)}<strong>${title}</strong><p>${note}</p></button>`).join('')}</div><p class="dialog-note" style="margin-top:18px">${tr('需要保留学号、商品编码的前导零时请选择 Excel。工作簿以文本格输出；导入目标系统后如需计算，请按系统要求转换金额字段。','Choose Excel to preserve leading zeros in student IDs and product codes. All cells are exported as text. Convert amount fields in your destination system if calculations are needed.')}</p>`,[{label:tr('关闭','Close'),action:closeDialog}]);
 $('dialog-body').querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>exportResult(b.dataset.export)));
}
function showReport(){
 if(!state.result){toast(tr('运行清洗后即可查看处理报告','Run cleaning to view the processing report.'));$('run-button').scrollIntoView({behavior:'smooth',block:'center'});return;}
 const context=state.runContext,s=context.result.stats,unresolved=context.requirements.unresolved;
 const stats=[[tr('输入记录','Input records'),s.inputRows],[tr('输出记录','Output records'),s.outputRows],[tr('规范化记录','Normalized records'),s.changedRows],[tr('待确认记录','Records to review'),s.reviewRows],[tr('重复组','Duplicate groups'),s.duplicateGroups],[tr('已移除记录','Removed records'),s.removedRows]];
 openDialog(tr('本次处理报告','Processing report'),`${state.dirty?`<div class="draft-item warn">${tr('规则已变更，以下为上次运行的结果，请重新运行后再导出。','Rules have changed. This is the previous run. Run again before exporting.')}</div>`:''}<p class="dialog-note">${esc(context.filename)} · ${esc(context.sheetName)} · ${formatDateTime(context.processedAt)}</p><p class="dialog-note">${esc(requirementNote(context.requirements))}</p><div class="report-grid">${stats.map(([title,value])=>`<div><span>${title}</span><strong>${format(value)}</strong></div>`).join('')}</div><div class="help-section"><h3>${tr('统计口径','How records are counted')}</h3><p>${tr(`一条记录可能有多项问题：本次有 ${format(s.reviewRows)} 条记录待确认，保留记录中共 ${format(resultCounts(context.result).reviewIssueCount)} 个问题（审计总计 ${format(s.issueCount)} 个）。重复记录数 ${format(s.duplicateRows)} 不包含各组首条。`,`A record can have several issues. ${format(s.reviewRows)} retained records need review, with ${format(resultCounts(context.result).reviewIssueCount)} issues (${format(s.issueCount)} in the full audit). The ${format(s.duplicateRows)} duplicate records exclude the first row of each group.`)}</p><p>${tr('输出记录 = 输入记录 − 移除记录。清洗数据保留未解决的问题，异常清单便于逐条核对。','Output records = input records − removed records. Unresolved values remain in the cleaned data, with a separate issue list for review.')}</p></div>${unresolved.length?`<div class="help-section"><h3>${tr('未自动执行的需求','Requirements not executed')}</h3><ul>${unresolved.map(r=>`<li>${esc(r.text)}: ${label(r.reason)}</li>`).join('')}</ul></div>`:''}`,[{label:tr('关闭','Close'),action:closeDialog},{label:tr('导出结果','Export results'),primary:true,disabled:state.dirty,action:showExport}]);
}
function showHelp(){
 const sections=[
  [tr('三步完成一次清洗','Clean a dataset in three steps'),`<ol><li>${tr('导入 CSV、TSV 或 XLSX；多工作表文件可选择要处理的工作表。','Import CSV, TSV or XLSX. Choose a worksheet for files with multiple sheets.')}</li><li>${tr('选择预设，核对字段类型、必填项、去重依据。也可以逐条写下需求，生成规则草案。','Choose a preset and review field types, required fields and duplicate keys. You can also describe requirements and generate a rule draft.')}</li><li>${tr('运行清洗，点击记录检查原值、处理值与问题，再下载完整结果。','Run cleaning, open a row to compare original and processed values, then download the results.')}</li></ol>`],
  [tr('预设与自定义需求','Presets and custom requirements'),`<p>${tr('通用表格、客户资料、教育学员名册、商品资料都可调整。预设匹配表头给出初始字段规则；它不能推断所有业务含义。','Generic tables, customer data, education rosters and product catalogs are all configurable. Presets suggest field rules from headers; they cannot infer every business meaning.')}</p><p>${tr('需求识别支持常见确定性规则，例如“学号保留前导零”“姓名必填”“按学号+课程检查重复”。未识别或含业务判断的需求会单独保留为待确认，不会自动执行。','The parser supports common deterministic requirements, such as “Preserve leading zeros in Student ID”, “Name is required” and “Check duplicates by Student ID + Course”. Unsupported requirements or business judgments are retained for clarification and never automatically executed.')}</p>`],
  [tr('如何处理重复与冲突','Duplicates and conflicts'),`<p>${tr('“标记重复”保留全部记录；“移除完全相同的重复行”仅移除内容一致的后续记录。同键但内容不同，整组保留并提示冲突。','“Mark duplicates” keeps all records. “Remove exact duplicates” removes only later identical rows. If rows share a key but differ in content, the entire group is retained and flagged.')}</p><p>${tr('选了业务键时，任一键为空的行不参与去重。未选键并启用“移除完全相同的重复行”时，按整行精确匹配。原始行号会保留在检查清单中。','With duplicate keys selected, a blank key excludes a row from deduplication. Without keys, exact deduplication compares the whole row. Audit lists preserve original row numbers.')}</p>`],
  [tr('首版支持的范围','Current scope'),`<p>${tr('输入单文件最多 10 MB，每张输入工作表最多 50,000 行、100 列。第一条非空行作为表头。旧版 XLS 请先另存为 XLSX 或 CSV。','Input limits: 10 MB per file, 50,000 data rows and 100 columns per worksheet. The first non-empty row is the header. Convert legacy XLS files to XLSX or CSV first.')}</p><p>${tr('手机号检查针对中国大陆格式；邮箱检查结构并规范域名；日期只转换含义明确的年在前格式；金额只规范确定的数值与千分位，不猜币种。','Phone rules support Mainland China mobile numbers. Email rules check structure and lowercase domains. Date rules convert only unambiguous year-first dates. Number rules preserve precision and do not infer currencies.')}</p><p>${tr('工具不能恢复源文件已丢失的前导零或长数字，也不会联网补全、验证联系人真实性、猜测日期或自动合并冲突。','The tool cannot recover digits already lost in the source file. It does not enrich data online, verify real-world contact details, guess ambiguous dates or merge conflicts automatically.')}</p>`],
  [tr('文件与隐私','Files and privacy'),`<p>${tr('导入的文件在当前浏览器中处理，不上传，也不自动存储。刷新或关闭页面后需重新导入。我的预设仅把规则保存到当前浏览器。','Imported files are processed in your browser and are not uploaded or automatically saved. Reimport them after refreshing or closing the page. My presets stores only rules in this browser.')}</p><p>${tr('推荐导出 Excel：编号、手机号和长数字以文本格保存。CSV 安全导出会给可能被当作公式的文本加保护前缀。','Use Excel export to preserve IDs, phone numbers and long numbers as text cells. Safe CSV adds a prefix to text that could be interpreted as a formula.')}</p>`],
  [tr('语言与开源','Languages and open source'),`<p>${tr('右上角可切换中文和 English，选择会在当前浏览器保存。切换语言只更新界面、规则说明和导出报告标签；你的表头、记录和需求原文保持不变。加载示例时会使用当前语言的示例数据。','Switch between 中文 and English in the top bar. Your choice is saved in this browser. Language changes update the interface, rule descriptions and report labels; your headers, records and original requirements stay intact. Newly loaded samples use the selected language.')}</p><p>${tr('项目源代码采用 MIT 许可，可自行部署和扩展行业预设。第三方组件保留各自的许可声明。','Project source is provided under the MIT license for self-hosting and extending presets. Third-party components retain their own license notices.')}</p><p><a href="./LICENSE" target="_blank" rel="noopener">${tr('MIT 许可','MIT license')}</a> · <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">${tr('第三方许可声明','Third-party notices')}</a></p>`],
 ];
 openDialog(tr('让第一份表格清楚起来','Make your first dataset clear'),sections.map(([title,body])=>`<div class="help-section"><h3>${title}</h3>${body}</div>`).join(''),[{label:tr('开始使用','Get started'),primary:true,action:closeDialog}]);
}

function changeLanguage(locale){
 if(state.busy)return;
 const notesOpen=$('source-notes').querySelector('details')?.open;
 setLocale(locale);translateStatic();render();
 if(notesOpen){const details=$('source-notes').querySelector('details');if(details)details.open=true;}
 if(!$('toast').hidden)$('toast').textContent=localize($('toast').textContent);
}
$('locale-select').addEventListener('change',event=>changeLanguage(event.target.value));
$('import-button').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',e=>importFile(e.target.files[0]));
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.add('dragover');});
for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragover');});
$('drop-zone').addEventListener('drop',e=>{if(e.dataTransfer.files.length>1)toast(tr("每次处理一个文件，已选择第一个文件", "One file at a time. The first file was selected."));importFile(e.dataTransfer.files[0]);});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('preset-select').addEventListener('change',e=>applyPreset(e.target.value));
$('preset-list').addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b)applyPreset(b.dataset.preset);});
$('saved-list').addEventListener('click',e=>{const load=e.target.closest('[data-load-saved]'),del=e.target.closest('[data-delete-saved]');if(load)applySavedPreset(load.dataset.loadSaved);if(del)deletePreset(del.dataset.deleteSaved);});
$('base-rules').addEventListener('change',e=>{if(e.target.dataset.rule){state.options[e.target.dataset.rule]=e.target.checked;markDirty();}});
$('duplicate-mode').addEventListener('change',e=>{state.options.duplicateMode=e.target.value;markDirty();});
$('sheet-select').addEventListener('change',e=>{$('requirements').value='';selectSheet(Number(e.target.value));toast(tr("已切换工作表，请重新确认规则", "Worksheet changed. Review the rules again."));});
for(const id of ['field-button','field-config-button'])$(id).addEventListener('click',showFields);
for(const id of ['save-preset-button','save-preset-side'])$(id).addEventListener('click',savePreset);
$('parse-button').addEventListener('click',showRequirementDraft);
$('requirements').addEventListener('input',()=>{if(state.result)state.dirty=true;renderRequirementStatus();renderSummary();});
$('run-button').addEventListener('click',run);$('export-button').addEventListener('click',showExport);
$('demo-button').addEventListener('click',showExamples);$('paste-button').addEventListener('click',showPaste);$('import-settings-button').addEventListener('click',showImportSettings);
$('help-button').addEventListener('click',showHelp);$('about-button').addEventListener('click',showHelp);$('nav-report').addEventListener('click',showReport);$('nav-workspace').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('dialog-close').addEventListener('click',closeDialog);$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;state.page=1;renderTable();}));
$('search-input').addEventListener('input',e=>{clearTimeout(searchTimer);const query=e.target.value;searchTimer=setTimeout(()=>{state.search=query;state.page=1;renderTable();},150);});
$('original-toggle').addEventListener('change',e=>{state.original=e.target.checked;renderTable();});
$('prev-page').addEventListener('click',()=>{state.page--;renderTable();$('table-scroll').scrollTop=0;});$('next-page').addEventListener('click',()=>{state.page++;renderTable();$('table-scroll').scrollTop=0;});
$('data-table').addEventListener('click',e=>{const row=e.target.closest('[data-row]');if(row)showRow(Number(row.dataset.row));});
$('data-table').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const row=e.target.closest('[data-row]');if(row){e.preventDefault();showRow(Number(row.dataset.row));}}});
translateStatic();$('locale-select').value=getLocale();paintIcons();loadExample('education',true);
// The initial preview only processes the clearly labeled, fictional example.
const initialText=$('requirements').value.trim();
const initialDraft=parseRequirements(initialText,state.columns,state.options);
state.columns=initialDraft.columns;state.options=initialDraft.options;
state.requirements={text:initialText,recognized:initialDraft.recognized,unresolved:initialDraft.unresolved,fingerprint:configurationFingerprint(state.columns,state.options)};
renderRules();void run();
