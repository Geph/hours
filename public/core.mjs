export const CATEGORIES = [
  {id:'admin', name:'Admin', color:'#6d59dd', tint:'#efebff', description:'Email, Slack, tasks, travel and upkeep'},
  {id:'whimc', name:'WHIMC/QRF', color:'#137fbd', tint:'#e6f4ff', description:'Minecraft, plugins, research and grant work'},
  {id:'invite', name:'INVITE', color:'#d12e88', tint:'#fce8f3', description:'Zany, codesign, Strand 3 and VEXcode VR'},
  {id:'teaching', name:'Teaching', color:'#ff7800', ink:'#512500', tint:'#fff0da', description:'UXD & AI, class, grading and students'},
  {id:'flex', name:'Flex time', color:'#1bbc9c', ink:'#064c3e', tint:'#e0f7ef', description:'AI reading, videos and professional learning'},
  {id:'engagement', name:'Engagement', color:'#f9d900', ink:'#514500', tint:'#fffbd9', description:'Outreach, tutorials, camps and curriculum engagement'}
];
export const hours = n => Number(n).toLocaleString('en-US',{maximumFractionDigits:1});
export const addDays = (iso,n) => new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function workDate(now=new Date(),timeZone='America/Denver') {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  // Compare local clock time, not elapsed hours: DST changes the length of some days.
  return Number(parts.hour)<2?addDays(date,-1):date;
}
export function today() { return workDate(); }
export function dailyWork(state,date) {
  const records=state.records.filter(r=>r.kind==='work'&&!r.archived&&r.start===date&&r.end===date);
  return {hours:records.reduce((sum,r)=>sum+r.hours,0),count:records.length,
    hasImportedTotals:state.records.some(r=>r.kind==='work'&&r.archived&&r.start<=date&&r.end>=date)};
}
export const dateLabel = (iso,opts={}) => new Date(iso+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',...opts});
export const rangeLabel = (a,b) => `${dateLabel(a)} – ${dateLabel(b,{year:'numeric'})}`;
export function periodsThrough(state, date=today()) {
  const periods = state.periods.map(p=>({...p,legacy:true}));
  for(let start=state.settings.weeklyStart;start<=date;start=addDays(start,7))
    periods.push({id:'week-'+start,start,end:addDays(start,6),target:state.settings.weeklyHours,legacy:false,note:''});
  let carry=0;
  return periods.map(p=>{
    const records=state.records.filter(r=>r.start>=p.start && r.end<=p.end);
    const worked=records.filter(r=>r.kind==='work').reduce((s,r)=>s+r.hours,0);
    const leave=records.filter(r=>r.kind==='leave').reduce((s,r)=>s+r.hours,0);
    const target=Math.max(0,p.target-leave);
    const opening=carry;
    carry=opening+target-worked+(p.adjustment||0);
    return {...p,worked,leave,target,baseTarget:p.target,opening,balance:carry,records};
  });
}
export function analytics(state,from,to,category='all') {
  if(from>to) throw new Error('Choose an end date on or after the start date.');
  const works=state.records.filter(r=>r.kind==='work'&&(category==='all'||r.category===category));
  const records=works.filter(r=>r.archived?r.start<=to&&r.end>=from:r.start>=from&&r.end<=to);
  const partial=works.filter(r=>r.archived&&r.start<=to&&r.end>=from&&(r.start<from||r.end>to)&&r.hours>0);
  const totals=CATEGORIES.map(c=>({...c,hours:records.filter(r=>r.category===c.id).reduce((s,r)=>s+r.hours,0)}));
  return {records,totals,partial,total:totals.reduce((s,c)=>s+c.hours,0)};
}
export function currentPeriodRange(state,date=today()) {
  const periods=periodsThrough(state,date);
  const period=periods.find(p=>p.start<=date&&p.end>=date)||periods.at(-1);
  return {from:period.start,to:period.end};
}
export function reportingPeriods(state,from,to,category='all',asOf=today()) {
  return periodsThrough(state,asOf).filter(p=>p.start<=to&&p.end>=from).map(p=>{
    const inRange=r=>r.archived||(r.start>=from&&r.end<=to);
    const worked=p.records.filter(r=>inRange(r)&&r.kind==='work'&&(category==='all'||r.category===category)).reduce((s,r)=>s+r.hours,0);
    // Older logs give adjusted targets, not dated leave records. Exclude the two startup periods.
    const importedReduction=p.legacy&&p.sourceRow>11?Math.max(0,80-p.baseTarget):0;
    const timeOff=p.records.filter(r=>r.kind==='leave'&&inRange(r)).reduce((s,r)=>s+r.hours,0)+importedReduction;
    const workLimit=p.legacy?80:40;
    return {...p,worked,timeOff,total:worked+timeOff,importedReduction,workLimit,
      regularWork:Math.min(worked,workLimit),excessWork:Math.max(0,worked-workLimit)};
  });
}
export function analyticsDetailMode(state,from,to,asOf=today()) {
  const current=currentPeriodRange(state,asOf);
  const days=(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000+1;
  return (from===current.from&&to===current.to)||days<=7?'daily':'period';
}
export function dailyCategoryHours(state,from,to,category='all') {
  const records=state.records.filter(r=>!r.archived&&r.start===r.end&&r.start>=from&&r.end<=to);
  const rows=[];
  for(let date=from;date<=to;date=addDays(date,1)) {
    const categories=CATEGORIES.filter(c=>category==='all'||c.id===category).map(c=>({...c,
      hours:records.filter(r=>r.kind==='work'&&r.category===c.id&&r.start===date).reduce((s,r)=>s+r.hours,0)}));
    const worked=categories.reduce((s,c)=>s+c.hours,0);
    const leave=records.filter(r=>r.kind==='leave'&&r.start===date).reduce((s,r)=>s+r.hours,0);
    rows.push({date,categories,worked,leave,total:worked+leave});
  }
  return rows;
}
export function pieSegments(totals) {
  const total=totals.reduce((sum,c)=>sum+c.hours,0);
  let angle=-Math.PI/2;
  return totals.filter(c=>c.hours>0).map(c=>{
    const fraction=c.hours/total,start=angle;angle+=fraction*2*Math.PI;
    const point=a=>`${(110+100*Math.cos(a)).toFixed(4)},${(110+100*Math.sin(a)).toFixed(4)}`;
    return {...c,fraction,full: fraction===1,path:`M110,110 L${point(start)} A100,100 0 ${fraction>.5?1:0} 1 ${point(angle)} Z`};
  });
}
export function csv(records) {
  const escape=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  // Text cells are prefixed when needed so spreadsheet programs do not execute notes as formulas.
  const text=x=>/^[=+\-@\t\r\n]/.test(String(x??''))?"'"+x:x;
  return '\uFEFF'+[['Start date','End date','Type','Category','Hours','Note','Additional source note','Original category','Source row','Entered at (UTC)','Updated at (UTC)'],
    ...records.map(r=>[r.start,r.end,r.kind,CATEGORIES.find(c=>c.id===r.category)?.name||r.category,r.hours,text(r.note),text(r.extraNote),text(r.originalCategory),r.sourceRow,r.createdAt||'',r.updatedAt||''])]
    .map(row=>row.map(escape).join(',')).join('\r\n');
}

// A shared proportional lane leaves visible room beyond each row's expected-hours endpoint.
export function expectedBarLayout(worked,leave,limit,scale=1.5) {
  const regular=Math.min(worked,limit),excess=Math.max(0,worked-limit);
  return {goalWidth:100/scale,regularWidth:regular/limit*100,excessWidth:excess/limit*100,leaveWidth:leave/limit*100,regularShare:worked?regular/worked:0};
}
export function expectedBarScale(rows) {
  return Math.max(1.5,...rows.map(r=>(r.worked+r.leave)/r.limit));
}

export function entryTimestamp(value) {
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
}
export function recentEntries(records) {
  return records.filter(r=>!r.archived).slice().sort((a,b)=>{
    const time=r=>typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))?Date.parse(r.createdAt):0;
    return time(b)-time(a)||b.start.localeCompare(a.start)||b.id.localeCompare(a.id);
  });
}
