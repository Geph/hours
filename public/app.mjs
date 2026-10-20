import {CATEGORIES,hours,addDays,today,dateLabel,rangeLabel,periodsThrough,analytics,csv,dailyWork,currentPeriodRange,reportingPeriods,pieSegments,analyticsDetailMode,dailyCategoryHours,expectedBarLayout,expectedBarScale,entryTimestamp,recentEntries} from './core.mjs';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=$('#app');
let state,session,view='track',kind='work',lastCategory='whimc',historyLimit=20;
let automaticEntryDate=true,lastWorkDate=today();
let analyticsPreset='period';
let filter={from:'',to:'',category:'all'},historyFilter={from:'',to:today(),search:''};
const cat=id=>CATEGORIES.find(c=>c.id===id)||{name:({vacation:'Vacation',sick:'Sick leave',holiday:'Holiday',other:'Other leave'})[id]||id,color:'#6c7287',tint:'#eef0f5'};
const style=c=>`--cat:${c.color};--tint:${c.tint};--ink:${c.ink||'#fff'}`;
const balanceLabel=b=>`${hours(Math.abs(b))}h ${b>=0?'owed':'banked'}`;
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
async function api(action,body){
  const response=await fetch('api.php?action='+encodeURIComponent(action),body?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session?.csrf||''},body:JSON.stringify(body)}:{cache:'no-store'});
  let result;try{result=await response.json();}catch{throw Error('The server did not return your hours. Please retry.');}
  if(!response.ok){if(response.status===503&&result.configured===false){renderSetup();throw Error('A PIN must be configured before opening this log.');}
    if(response.status===401 && action!=='login'){session=null;showAuth();}
    throw Error(result.error||'Unable to connect. Please retry.');}
  return result;
}
async function load(){state=await api('state');historyFilter.from||=state.periods[0]?.start||state.settings.weeklyStart;$('#sync').textContent=session.preview?'Local preview':'Saved to server';$('#sync').classList.remove('sync-error');}
function showAuth(){
  $('#nav').hidden=true;$('#export-open').hidden=true;$('#logout').hidden=true;$('#sync').textContent='Private log';$('#header-date').hidden=true;
  app.innerHTML=`<section class="card login-card"><div class="eyebrow">Your time, in one place</div><h1>Welcome back.</h1><p>Sign in to log hours and pick up where you left off, from any device.</p><form id="login-form"><label for="pin">4-digit PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="current-password" aria-describedby="pin-hint" required autofocus><span id="pin-hint" class="small muted">Enter your four-digit PIN.</span><p class="form-error auth-error" role="alert"></p><button class="primary save-button" type="submit">Sign in</button></form></section>`;
  $('#login-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{session=await api('login',{pin:e.target.pin.value});await load();enter();}
    catch(error){$('.auth-error').textContent=error.message;button.disabled=false;}};
}
function renderSetup(){
  $('#nav').hidden=true;$('#sync').textContent='Not configured';
  app.innerHTML=`<section class="card login-card setup-note"><div class="eyebrow">One-time setup</div><h1>Give your hours a PIN.</h1><p>The log stays closed until a four-digit PIN is configured. Follow the included DreamHost setup guide and run <code>php tools/set_pin.php</code> from the app folder on your server.</p><p>After setup, refresh this page to sign in.</p><button class="primary" onclick="location.reload()">Check again</button></section>`;
}
function enter(){
  $('#nav').hidden=false;$('#export-open').hidden=false;$('#logout').hidden=!!session.preview;$('#header-date').hidden=false;
  route();
}
function route(){
  if(!state||!session)return;
  view=['track','analytics','history'].includes(location.hash.slice(1))?location.hash.slice(1):'track';
  document.querySelectorAll('[data-view]').forEach(a=>a.setAttribute('aria-current',a.dataset.view===view?'page':'false'));
  render();
}
function render(){updateHeaderDate();if(view==='track')renderTrack();else if(view==='analytics')renderAnalytics();else renderHistory();}
function previewNote(){return session.preview?'<div class="preview-note">Local preview · saved on this computer’s preview server. Your website will use its own PIN-protected database.</div>':'';}
function currentPeriod(){const p=periodsThrough(state);return p.find(p=>p.start<=today()&&p.end>=today())||p.at(-1);}
function entryForm(edit=null){
  if(edit?.archived)return historicalEntryForm(edit);
  const k=edit?.kind||kind;const selected=edit?.category||(k==='work'?lastCategory:'vacation');
  return `<form id="${edit?'edit-form':'entry-form'}" data-kind="${k}">
    ${k==='work'?`<div class="field"><input type="hidden" name="category" value="${esc(selected)}"><div class="category-grid" role="group" aria-label="Work category">${CATEGORIES.map(c=>`<button type="button" class="category-button" style="${style(c)}" data-category="${c.id}" aria-pressed="${selected===c.id}" title="${esc(c.description)}"><span class="dot"></span>${c.name}<span class="selected-check" aria-hidden="true">✓</span></button>`).join('')}</div></div>`:
      `<div class="field"><label for="${edit?'edit-':''}leave-type">Leave type</label><select id="${edit?'edit-':''}leave-type" name="category">${[['vacation','Vacation'],['sick','Sick leave'],['holiday','Holiday'],['other','Other']].map(([id,name])=>`<option value="${id}" ${selected===id?'selected':''}>${name}</option>`).join('')}</select></div>`}
    <div class="two-fields field"><div><label for="${edit?'edit-':''}date">Date</label><input id="${edit?'edit-':''}date" name="date" type="date" min="${state.settings.entryStart||state.periods.at(-1)?.start||state.settings.weeklyStart}" ${k==='work'?`max="${today()}"`:''} value="${esc(edit?.start||today())}" required></div><div><label for="${edit?'edit-':''}duration">${k==='work'?'Hours':'Time off'}</label>${k==='work'?`<div class="duration-control"><button type="button" data-duration-step="-0.5" aria-label="Subtract 30 minutes">−</button><input id="${edit?'edit-':''}duration" type="number" name="hours" min="0.5" max="24" step="0.5" value="${edit?.hours||0.5}" required aria-label="Duration in hours"><button type="button" data-duration-step="0.5" aria-label="Add 30 minutes">+</button></div>`:
      `<select id="${edit?'edit-':''}duration" name="hours"><option value="8" ${edit?.hours===4?'':'selected'}>Full day · 8 hours</option><option value="4" ${edit?.hours===4?'selected':''}>Half day · 4 hours</option></select>`}</div></div>
    ${k==='work'?'<div class="day-summary" role="status" aria-live="polite" aria-atomic="true"></div>':''}
    <div class="field"><label for="${edit?'edit-':''}note">${k==='work'?'A quick note':'Explanation'} <span class="note-optional">${k==='work'?'(optional)':'(required for Other)'}</span></label><textarea id="${edit?'edit-':''}note" name="note" rows="2" maxlength="4000" placeholder="${k==='work'?'A few words for future you…':'Anything you’d like to remember…'}">${esc(edit?.note||'')}</textarea></div>
    <p class="form-error" role="alert" hidden></p>
    ${edit?`<div class="edit-actions"><button type="button" class="delete-button" data-delete="${edit.id}">Delete entry</button><button type="submit" class="primary">Save changes</button></div>`:
      `<button type="submit" class="primary save-button"><span>${k==='work'?'＋ Add time':'Add leave'}</span>${k==='work'?'<span class="keyboard-hint">30-minute increments</span>':''}</button><p class="entry-footer">${k==='work'?'Work is saved in 30-minute increments.':'Leave reduces your target; it doesn’t count as work.'}</p>`}
  </form>`;
}
function historicalEntryForm(edit){
  const baseline=edit.originalValues||edit;
  return `<form id="edit-form" data-kind="work"><div class="field"><span class="field-label">Period</span><div class="locked-period">${rangeLabel(edit.start,edit.end)}</div><input type="hidden" name="date" value="${edit.start}"></div><div class="field"><input type="hidden" name="category" value="${edit.category}"><div class="category-grid" role="group" aria-label="Work category">${CATEGORIES.map(c=>`<button type="button" class="category-button" style="${style(c)}" data-category="${c.id}" aria-pressed="${edit.category===c.id}"><span class="dot"></span>${c.name}<span class="selected-check" aria-hidden="true">✓</span></button>`).join('')}</div></div><div class="field"><label for="edit-duration">Period hours</label><div class="duration-control"><button type="button" data-duration-step="-0.5" aria-label="Subtract 30 minutes">−</button><input id="edit-duration" name="hours" type="number" min="0" max="10000" step="0.5" required value="${edit.hours}"><button type="button" data-duration-step="0.5" aria-label="Add 30 minutes">+</button></div></div><div class="field"><label for="edit-note">Note</label><textarea id="edit-note" name="note" maxlength="4000" rows="2">${esc(edit.note)}</textarea></div><div class="field"><label for="edit-extra-note">Additional note</label><textarea id="edit-extra-note" name="extraNote" maxlength="4000" rows="2">${esc(edit.extraNote||'')}</textarea></div><details class="original-values"><summary>Original imported values</summary><p>${esc(cat(baseline.category).name)} · ${hours(baseline.hours)}h${baseline.note?'<br>'+esc(baseline.note):''}${baseline.extraNote?'<br>'+esc(baseline.extraNote):''}</p><button type="button" class="secondary" data-original>Use original values</button></details><p class="form-error" role="alert" hidden></p><div class="edit-actions"><button type="submit" class="primary">Save changes</button></div></form>`;
}
function renderTrack(draft=null){
  updateHeaderDate();
  const p=currentPeriod(); const cperiod=p.legacy?'Transition period':'This week';
  const newRecords=recentEntries(state.records);
  const owed=p.balance>=0;const required=Math.max(0,p.opening+p.target+(p.adjustment||0));
  app.innerHTML=`${previewNote()}
    <div class="grid"><section class="card card-pad entry-card"><div class="card-heading"><h2>Add an entry</h2><div class="segmented" aria-label="Entry type"><button type="button" data-kind="work" aria-pressed="${kind==='work'}">Work</button><button type="button" data-kind="leave" aria-pressed="${kind==='leave'}">Leave</button></div></div><div id="entry-form-slot">${entryForm()}</div></section>
    <div class="right-column"><section class="balance-card ${owed?'balance-owed':'balance-banked'}"><div class="period-title"><div><div class="eyebrow">${cperiod}</div><h2>${rangeLabel(p.start,p.end)}</h2></div><span class="badge">${p.legacy?'2 weeks':'40h / week'}</span></div><div class="balance-value">${hours(Math.abs(p.balance))}<span> h ${owed?'owed':'banked'}</span></div><p class="balance-caption">${owed?`Remaining through ${dateLabel(p.end)}.`:'Time you can carry into the next week.'}</p><div class="progress" role="progressbar" aria-label="Progress toward target including carried balance" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(required?Math.min(100,p.worked/required*100):100)}"><div style="width:${required?Math.min(100,p.worked/required*100):100}%"></div></div><div class="progress-label"><span>${hours(p.worked)}h worked</span><span>${hours(required)}h including carry</span></div><div class="balance-breakdown"><div><strong>${hours(p.target)}h</strong><span>Adjusted target</span></div><div><strong>${hours(Math.abs(p.opening))}h</strong><span>Carried ${p.opening>=0?'owed':'banked'}</span></div><div><strong>${hours(p.leave+(p.legacy?80-p.target-p.leave:0))}h</strong><span>Target reduction</span></div></div><p class="balance-note">${p.legacy?`Weekly tracking begins ${dateLabel(state.settings.weeklyStart,{weekday:'long',year:'numeric'})}. Your balance carries forward automatically.`:'40 hours, less leave, plus hours owed or minus hours banked. Unused credit carries forward.'}</p></section>
    <section class="card recent-card"><div class="card-heading recent-heading"><h2>Recent entries</h2><a href="#history">View all ↗</a></div>${newRecords[0]?.createdAt?`<p class="last-entered">Last entered <time datetime="${esc(newRecords[0].createdAt)}">${esc(entryTimestamp(newRecords[0].createdAt))}</time></p>`:''}<div class="recent-list">${newRecords.length?newRecords.slice(0,8).map(r=>recordRow(r)).join(''):'<div class="empty">No new entries yet.</div>'}</div></section></div></div>
    ${state.import.periodCount?`<details class="import-banner"><summary>Original import · ${hours(state.import.totalHours)} hours</summary><p>Imported records retain their original reporting periods. Add only work that is not already included in your imported totals.</p><p>Historical target reductions and balance adjustments remain as recorded.</p></details>`:''}`;
  bindForm($('#entry-form'));
  if(draft){for(const [key,value] of Object.entries(draft)){const field=$('#entry-form').elements[key];if(field)field.value=value;}updateCategoryButtons($('#entry-form'));}
  updateDaySummary($('#entry-form'));
}
function updateDaySummary(form){
  const element=form.querySelector('.day-summary');if(!element)return;
  const date=form.elements.date.value;
  if(!date){element.innerHTML='<span>Choose a date to see hours logged.</span>';return;}
  const day=dailyWork(state,date);
  element.innerHTML=`<div class="day-summary-top"><div><span class="day-summary-label">Worked on ${dateLabel(date,{weekday:'short'})}</span><span class="day-summary-count">${day.count} saved ${day.count===1?'entry':'entries'} · all categories</span></div><strong>${hours(day.hours)}<span> h</span></strong></div>`;
}
function updateHeaderDate(){const date=$('#header-date');date.textContent=dateLabel(today(),{weekday:'short'});date.dateTime=today();}
function categoryPie(totals){
  const total=totals.reduce((sum,c)=>sum+c.hours,0),segments=pieSegments(totals);
  const slices=segments.map(c=>c.full?`<circle cx="110" cy="110" r="100" fill="${c.color}"><title>${esc(c.name)}: ${hours(c.hours)}h</title></circle>`:`<path d="${c.path}" fill="${c.color}" stroke="#fff" stroke-width="2"><title>${esc(c.name)}: ${hours(c.hours)}h (${hours(c.fraction*100)}%)</title></path>`).join('');
  return `<figure class="pie-layout"><svg class="pie-chart" viewBox="0 0 220 220" role="img" aria-label="Work by category, ${hours(total)} hours"><title>Work by category: ${hours(total)} hours</title>${slices||'<circle cx="110" cy="110" r="100" fill="#edf0f4"/><text x="110" y="115" text-anchor="middle" fill="#748092" font-size="15">No work logged</text>'}</svg><figcaption class="pie-legend">${totals.map(c=>`<div class="pie-legend-row" style="${style(c)}"><span class="summary-name"><span class="dot"></span>${c.name}</span><span class="pie-legend-value">${hours(c.hours)}h <small>${total?hours(c.hours/total*100):0}%</small></span></div>`).join('')}</figcaption></figure>`;
}
function recordRow(r,source=false){const c=cat(r.category);const edited=r.originalValues&&['category','hours','note','extraNote'].some(key=>(r[key]??'')!==(r.originalValues[key]??''));return `<div class="entry-row" style="${style(c)}"><div class="entry-mark" aria-hidden="true">${r.kind==='leave'?'◷':'↗'}</div><div class="entry-body"><div class="entry-title">${esc(c.name)} <span class="muted" style="font-weight:400">· ${r.archived?'Period total':dateLabel(r.start,{weekday:'short'})}</span></div>${r.note?`<div class="entry-note">${esc(r.note)}</div>`:''}${r.extraNote?`<div class="entry-note">${esc(r.extraNote)}</div>`:''}${!r.archived&&entryTimestamp(r.createdAt)?`<div class="entry-timestamp">Entered <time datetime="${esc(r.createdAt)}">${esc(entryTimestamp(r.createdAt))}</time>${r.updatedAt&&r.updatedAt!==r.createdAt&&entryTimestamp(r.updatedAt)?` · Edited <time datetime="${esc(r.updatedAt)}">${esc(entryTimestamp(r.updatedAt))}</time>`:''}</div>`:''}${source?`<div class="source-category">${esc(r.originalCategory)} · source row ${r.sourceRow}</div>`:''}</div><div class="entry-amount">${hours(r.hours)}h</div>${edited?'<span class="edited-tag">Edited</span>':''}<button class="icon-button edit-button" data-edit="${r.id}" aria-label="Edit ${esc(c.name)} ${r.archived?'source row '+r.sourceRow:'entry on '+r.start}">Edit</button></div>`;}
function updateCategoryButtons(form){form.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.category===form.elements.category.value));}
function bindForm(form,edit=null){
  updateDaySummary(form);
  form.onchange=e=>{if(e.target.name==='date'){if(!edit)automaticEntryDate=false;updateDaySummary(form);}};
  form.onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.category){form.elements.category.value=b.dataset.category;updateCategoryButtons(form);if(!edit)lastCategory=b.dataset.category;}
    if(b.dataset.durationStep){form.elements.hours.value=Math.min(Number(form.elements.hours.max),Math.max(Number(form.elements.hours.min),Number(form.elements.hours.value)+Number(b.dataset.durationStep)));}
    if(b.hasAttribute('data-original')){const original=edit.originalValues||edit;for(const key of ['category','hours','note','extraNote'])form.elements[key].value=original[key]??'';updateCategoryButtons(form);}
    if(b.dataset.delete)deleteEntry(edit,form);
  };
  form.onsubmit=async e=>{
    e.preventDefault();const err=form.querySelector('.form-error');err.hidden=true;
    const payload={id:edit?.id||crypto.randomUUID(),version:edit?.version,kind:edit?.kind||kind,date:form.elements.date.value,category:form.elements.category.value,hours:Number(form.elements.hours.value),note:form.elements.note.value,extraNote:edit?.archived?form.elements.extraNote.value:undefined};
    if(payload.kind==='leave'&&payload.category==='other'&&!payload.note.trim()){err.textContent='Please add an explanation for Other leave.';err.hidden=false;return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;$('#sync').textContent='Saving…';
    try{
      const result=await api('save',payload);const index=state.records.findIndex(r=>r.id===result.record.id);
      if(index>=0)state.records[index]=result.record;else state.records.push(result.record);
      $('#sync').textContent=session.preview?'Local preview':'Saved to server';
      if(edit)$('#entry-dialog').close();
      const savedDate=payload.date;render();
      if(!edit&&view==='track'){$('#entry-form').elements.date.value=savedDate;updateDaySummary($('#entry-form'));}
      toast(edit?'Entry updated.':payload.kind==='leave'?'Leave saved. Target updated.':`${hours(payload.hours)} hours added to ${cat(payload.category).name}.`);
    }catch(error){err.textContent=error.message;err.hidden=false;button.disabled=false;$('#sync').textContent='Not saved';$('#sync').classList.add('sync-error');}
  };
}
async function deleteEntry(record,form){
  const button=form.querySelector('[data-delete]');
  if(button.dataset.confirm!=='true'){button.dataset.confirm='true';button.textContent='Confirm delete';return;}
  button.disabled=true;
  try{await api('delete',{id:record.id,version:record.version});state.records=state.records.filter(r=>r.id!==record.id);$('#entry-dialog').close();render();toast('Entry deleted.');}
  catch(error){form.querySelector('.form-error').textContent=error.message;form.querySelector('.form-error').hidden=false;button.disabled=false;}
}
function openEdit(id){const r=state.records.find(r=>r.id===id);if(!r)return;$('#edit-title').textContent=r.archived?'Edit historical entry':'Edit entry';$('#edit-body').innerHTML=entryForm(r);bindForm($('#edit-form'),r);$('#entry-dialog').showModal();}
function goalBar(worked,leave,limit,scale,segments,label){
  const layout=expectedBarLayout(worked,leave,limit,scale);
  return `<div class="goal-lane"><div class="stacked-track goal-track" style="width:${layout.goalWidth}%" role="img" aria-label="${esc(label)}; expected ${limit} hours; ${hours(Math.max(0,worked-limit))} hours above expected">${segments(layout)}<span class="excess-segment" style="width:${layout.excessWidth}%" title="Above ${limit}h: ${hours(Math.max(0,worked-limit))}h"></span><span class="leave-segment" style="width:${layout.leaveWidth}%" title="Leave / reductions: ${hours(leave)}h"></span><i class="goal-marker"><small>${limit}h</small></i></div></div>`;
}
function dailyChart(){
  const rows=dailyCategoryHours(state,filter.from,filter.to,filter.category);
  const scale=expectedBarScale(rows.map(r=>({worked:r.worked,leave:r.leave,limit:8})));
  const categories=CATEGORIES.filter(c=>filter.category==='all'||c.id===filter.category);
  const imported=state.records.some(r=>r.archived&&r.kind==='work'&&r.hours>0&&r.start<=filter.to&&r.end>=filter.from);
  return `<h2>By day</h2><div class="daily-legend">${categories.map(c=>`<span style="${style(c)}"><i class="dot"></i>${c.name}</span>`).join('')}<span><i class="excess-swatch"></i>Above 8h</span><span><i class="leave-swatch"></i>Leave</span></div><div class="trend-list daily-trend">${rows.map(r=>`<div class="trend-row daily-trend-row"><span>${dateLabel(r.date,{weekday:'short'})}</span>${goalBar(r.worked,r.leave,8,scale,layout=>r.categories.map(c=>`<span style="background:${c.color};width:${c.hours*layout.regularShare/8*100}%" title="${c.name}: ${hours(c.hours)}h total"></span>`).join(''),`${dateLabel(r.date)}: ${r.categories.map(c=>`${c.name} ${hours(c.hours)} hours`).join(', ')}; leave ${hours(r.leave)} hours`)}<strong>${hours(r.worked)}h${r.leave?`<span class="leave-hours"> + ${hours(r.leave)}h</span>`:''}</strong></div>`).join('')}</div>${imported?'<p class="daily-source-note">Daily entries only. Imported totals have no daily dates.</p>':''}`;
}
function renderAnalytics(){
  if(analyticsPreset==='period')filter={...filter,...currentPeriodRange(state)};
  const result=analytics(state,filter.from,filter.to,filter.category);
  const periods=reportingPeriods(state,filter.from,filter.to,filter.category);
  const scale=expectedBarScale(periods.map(p=>({worked:p.worked,leave:p.timeOff,limit:p.workLimit})));
  app.innerHTML=`${previewNote()}<div class="page-heading"><div><div class="eyebrow">Hours by category and date</div><h1>Work analytics</h1></div></div><section class="card card-pad"><form id="analytics-filters" class="filters"><div class="field"><label for="from">From</label><input type="date" id="from" name="from" required value="${filter.from}"></div><div class="field"><label for="to">Through</label><input type="date" id="to" name="to" required value="${filter.to}"></div><div class="field"><label for="category-filter">Category</label><select id="category-filter" name="category"><option value="all">All categories</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${filter.category===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div><button class="primary" type="submit">Apply</button><p class="form-error full-width" role="alert" hidden></p></form><div class="presets">${[['period','Current period'],['30days','Last 30 days'],['year','This year'],['all','All time']].map(([id,label])=>`<button data-preset="${id}">${label}</button>`).join('')}</div></section>
    ${result.partial.length?`<p class="range-note muted small">Includes full totals from ${new Set(result.partial.map(r=>r.periodId)).size} historical period(s) touching these dates.</p>`:''}
    <div class="analytics-grid"><section class="card"><div class="card-heading analytics-category-heading"><h2>By category</h2><strong class="category-total">${hours(result.total)}<small> hours</small></strong></div>${categoryPie(result.totals)}</section><section class="card">${analyticsDetailMode(state,filter.from,filter.to)==='daily'?dailyChart():`<h2>By reporting period</h2><div class="trend-legend"><span><i class="worked-swatch"></i>${filter.category==='all'?'Worked':esc(cat(filter.category).name)+' work'}</span><span><i class="excess-swatch"></i>Above 80h / 40h</span><span><i class="leave-swatch"></i>Leave / reductions</span></div><div class="trend-list">${periods.length?periods.slice().reverse().map(p=>`<div class="trend-row stacked-trend" title="${rangeLabel(p.start,p.end)}: ${hours(p.worked)}h worked (${hours(p.excessWork)}h above ${p.workLimit}h), ${hours(p.timeOff)}h leave / reductions"><span>${dateLabel(p.start,{year:'2-digit'})}</span>${goalBar(p.worked,p.timeOff,p.workLimit,scale,layout=>`<span class="worked-segment" style="width:${layout.regularWidth}%"></span>`,`${hours(p.worked)} hours worked, ${hours(p.timeOff)} hours leave or reductions`)}<strong><span>${hours(p.worked)}h</span>${p.timeOff?`<span class="leave-hours"> + ${hours(p.timeOff)}h</span>`:''}</strong></div>`).join(''):'<div class="empty">No reporting periods in this range.</div>'}</div>`}</section></div><div class="analytics-footer"><p class="muted small">Leave is excluded from work totals. No historical hours are prorated.</p><button class="secondary" id="export-filtered">Export this range</button></div>`;
  $('#analytics-filters').onsubmit=e=>{e.preventDefault();const f=e.target;const from=f.from.value,to=f.to.value;if(from>to){const er=f.querySelector('.form-error');er.textContent='The end date must be on or after the start date.';er.hidden=false;return;}analyticsPreset='custom';filter={from,to,category:f.category.value};renderAnalytics();};
  $('#export-filtered').onclick=()=>download(csv(result.records),`ginger-hours-${filter.from}-${filter.to}.csv`,'text/csv;charset=utf-8');
}
function renderHistory(){
  const openPeriods=new Set([...document.querySelectorAll('.history-period[open]')].map(p=>p.dataset.period));
  const term=historyFilter.search.toLowerCase();
  const ps=periodsThrough(state).filter(p=>p.start<=historyFilter.to&&p.end>=historyFilter.from&&(!term||[p.note,p.closingNote,...p.records.map(r=>r.note+' '+(r.extraNote||'')+' '+cat(r.category).name+' '+(r.originalCategory||''))].join(' ').toLowerCase().includes(term))).reverse();
  app.innerHTML=`${previewNote()}<div class="page-heading"><div><div class="eyebrow">Your complete log</div><h1>Work history</h1>${state.import.periodCount?`<p>${state.import.periodCount} imported periods. Every note kept.</p>`:''}</div></div><section class="card card-pad"><form class="filters" id="history-filters"><div class="field"><label for="history-from">From</label><input id="history-from" name="from" type="date" value="${historyFilter.from}" required></div><div class="field"><label for="history-to">Through</label><input id="history-to" name="to" type="date" value="${historyFilter.to}" required></div><div class="field"><label for="history-search">Search notes or categories</label><input id="history-search" name="search" type="search" placeholder="e.g. camps or INVITE" value="${esc(historyFilter.search)}"></div><button class="primary">Find</button><p class="form-error full-width" role="alert" hidden></p></form></section>
    <div class="history-list">${ps.slice(0,historyLimit).map(p=>`<details class="history-period" data-period="${p.id}" ${openPeriods.has(p.id)?'open':''}><summary><span class="period-name">${rangeLabel(p.start,p.end)}<small>${p.legacy?'Imported period':'Weekly log'}</small></span><span class="history-amount">${hours(p.worked)}h</span><span class="history-balance">${balanceLabel(p.balance)}</span></summary><div class="period-content"><div class="period-meta">Target ${hours(p.target)}h · carried ${balanceLabel(p.opening)}${p.leave?' · '+hours(p.leave)+'h new leave':''}${p.note?'<br>'+esc(p.note):''}${p.closingNote?'<br>Closing note: '+esc(p.closingNote):''}${p.extraNote?'<br>'+esc(p.extraNote):''}${p.adjustment?`<br>Source balance adjustment: ${p.adjustment>0?'+':''}${hours(p.adjustment)}h. Preserved from source formula ${esc(p.sourceFormula)}.`:''}${p.end>=today()?'<br>In progress: balance includes the full remaining period target.':''}</div>${p.records.filter(r=>r.archived||r.hours||r.note||r.extraNote).map(r=>recordRow(r,p.legacy&&r.archived)).join('')||'<div class="empty">No entries yet.</div>'}</div></details>`).join('')||'<div class="card empty">No matching periods.</div>'}</div>${ps.length>historyLimit?`<button class="secondary more-button" id="show-more">Show older periods (${ps.length-historyLimit} remaining)</button>`:''}
    ${state.import.periodCount?`<details class="import-audit"><summary>About the spreadsheet import</summary><p>Only the Weekly tab was imported: ${state.import.periodCount} periods, ${state.import.recordCount} category rows, ${hours(state.import.totalHours)} hours. Original source values remain available when editing historical entries. Targets and source balance adjustments are preserved; calculated balances update when hours change.</p><p>${esc(state.import.yearInference)}</p><p>${esc(state.import.categoryPolicy)}</p><p>Source adjustments, when present, preserve recorded closing balances:</p><ul>${state.import.audit.map(a=>`<li>Source row ${a.row}: ${a.adjustment>0?'+':''}${hours(a.adjustment)}h. Formula: ${esc(a.formula)}</li>`).join('')}</ul></details>`:''}`;
  $('#history-filters').onsubmit=e=>{e.preventDefault();const f=e.target;if(f.from.value>f.to.value){const er=f.querySelector('.form-error');er.textContent='The end date must be on or after the start date.';er.hidden=false;return;}historyFilter={from:f.from.value,to:f.to.value,search:f.search.value};historyLimit=20;renderHistory();};
  if($('#show-more'))$('#show-more').onclick=()=>{historyLimit+=30;renderHistory();};
}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
app.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.kind){kind=button.dataset.kind;renderTrack();}
  if(button.dataset.edit)openEdit(button.dataset.edit);
  if(button.dataset.preset){const preset=button.dataset.preset;analyticsPreset=preset;const p=currentPeriod();filter={...filter,from:preset==='all'?(state.periods[0]?.start||state.settings.weeklyStart):preset==='period'?p.start:preset==='year'?today().slice(0,4)+'-01-01':addDays(today(),-29),to:preset==='all'?[(state.periods.at(-1)?.end||p.end),today()].sort().at(-1):preset==='period'?p.end:today()};renderAnalytics();}
});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
$('#export-open').onclick=()=>$('#export-dialog').showModal();
$('#export-csv').onclick=()=>download(csv(state.records),'ginger-hours-all.csv','text/csv;charset=utf-8');
$('#export-json').onclick=()=>download(JSON.stringify(state,null,2),'ginger-hours-backup-'+today()+'.json','application/json');
$('#logout').onclick=async()=>{try{await api('logout',{});state=null;session=null;showAuth();}catch(error){toast(error.message);}};
window.addEventListener('hashchange',route);
// Refresh on return to the tab; preserve an unfinished entry instead of replacing it.
async function refresh(){
  if(document.hidden||!state||!session||$('#entry-dialog').open)return;
  const draft=view==='track'&&$('#entry-form')?Object.fromEntries(new FormData($('#entry-form'))):null;
  const newWorkDate=today();
  if(draft&&automaticEntryDate&&newWorkDate!==lastWorkDate)draft.date=newWorkDate;
  lastWorkDate=newWorkDate;
  try{await load();if(view==='track')renderTrack(draft);else render();}catch(error){$('#sync').textContent='Connection lost';$('#sync').classList.add('sync-error');}
}
document.addEventListener('visibilitychange',refresh);
setInterval(refresh,60000);
async function start(){try{session=await api('session');if(!session.authenticated){showAuth();return;}await load();enter();}catch(error){if(!$('.setup-note'))app.innerHTML=`<section class="card login-card"><h1>Couldn’t open your log.</h1><p>${esc(error.message)}</p><button class="primary" onclick="location.reload()">Try again</button></section>`;}}
start();
