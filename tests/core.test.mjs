import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {periodsThrough,analytics,dailyWork,workDate,dailyCategoryHours,currentPeriodRange,reportingPeriods,analyticsDetailMode,expectedBarLayout,expectedBarScale,recentEntries,entryTimestamp,csv} from '../public/core.mjs';
const starter=JSON.parse(await readFile(new URL('../private/seed.example.json',import.meta.url),'utf8'));
function empty(){return {...structuredClone(starter),settings:{...starter.settings,weeklyStart:'2024-01-07'}};}
const work=(date,hours,category='admin')=>({id:date+category,kind:'work',start:date,end:date,hours,category,archived:false});

test('public starter contains no entries or historical metadata',()=>{
 assert.deepEqual(starter.records,[]);assert.deepEqual(starter.periods,[]);
 assert.equal(starter.import.totalHours,0);assert.equal(starter.import.source,'');assert.deepEqual(starter.import.audit,[]);
});
test('empty install has a current week and analytics ranges',()=>{
 const s=empty();assert.deepEqual(currentPeriodRange(s,'2024-01-09'),{from:'2024-01-07',to:'2024-01-13'});
 assert.equal(periodsThrough(s,'2024-01-09')[0].balance,40);assert.equal(analytics(s,'2024-01-07','2024-01-13').total,0);
 assert.equal(analyticsDetailMode(s,'2024-01-07','2024-01-13','2024-01-09'),'daily');
 assert.equal(analyticsDetailMode(s,'2024-01-07','2024-01-21','2024-01-09'),'period');
});
test('banked hours carry forward and leave reduces targets without becoming work',()=>{
 const s=empty();s.records=[work('2024-01-08',45),{...work('2024-01-15',4),kind:'leave',category:'sick'}];
 const p=periodsThrough(s,'2024-01-16');assert.equal(p[0].balance,-5);assert.equal(p[1].opening,-5);assert.equal(p[1].target,36);assert.equal(p[1].balance,31);
 assert.equal(analytics(s,'2024-01-07','2024-01-20').total,45);
});
test('daily totals exclude leave and keep category hours on their recorded dates',()=>{
 const s=empty();s.records=[work('2024-01-08',1),work('2024-01-08',2,'invite'),{...work('2024-01-08',4),kind:'leave',category:'sick'},work('2024-01-09',.5)];
 assert.deepEqual(dailyWork(s,'2024-01-08'),{hours:3,count:2,hasImportedTotals:false});
 const rows=dailyCategoryHours(s,'2024-01-08','2024-01-09');assert.equal(rows[0].worked,3);assert.equal(rows[0].leave,4);assert.equal(rows[1].worked,.5);
});
test('historical aggregates touching a range are included once without invented daily hours',()=>{
 const s=empty();s.periods=[{id:'synthetic-period',start:'2023-12-24',end:'2024-01-06',target:72,sourceRow:20}];
 s.records=[{...work('2023-12-24',83),end:'2024-01-06',archived:true,periodId:'synthetic-period'}];
 assert.equal(analytics(s,'2024-01-01','2024-01-02').total,83);assert.equal(dailyCategoryHours(s,'2024-01-01','2024-01-02')[0].worked,0);
 const p=reportingPeriods(s,'2024-01-01','2024-01-02','all','2024-01-09')[0];assert.equal(p.workLimit,80);assert.equal(p.excessWork,3);assert.equal(p.timeOff,8);
});
test('2 a.m. Denver cutoff respects daylight saving clock changes',()=>{
 assert.equal(workDate(new Date('2024-01-09T08:59:00Z')),'2024-01-08');assert.equal(workDate(new Date('2024-01-09T09:00:00Z')),'2024-01-09');
 assert.equal(workDate(new Date('2024-11-03T07:30:00Z')),'2024-11-02');assert.equal(workDate(new Date('2024-11-03T08:30:00Z')),'2024-11-02');
});
test('overtime starts exactly at the expected-hours endpoint and fits reserved space',()=>{
 for(const limit of [8,40,80]){const scale=expectedBarScale([{worked:limit*1.3,leave:0,limit}]);const b=expectedBarLayout(limit*1.3,0,limit,scale);assert.equal(b.regularWidth,100);assert.ok(Math.abs(b.excessWidth-30)<1e-9);assert.ok(b.goalWidth*1.3<=100);}
 assert.equal(expectedBarLayout(4,4,8).excessWidth,0);
});
test('entry timestamps, sorting, and exports preserve entry time separately from work date',()=>{
 const s=[{...work('2024-01-08',.5),createdAt:'2024-01-10T18:00:00Z'},{...work('2024-01-09',1),createdAt:'2024-01-09T18:00:00Z'}];
 assert.equal(recentEntries(s)[0].start,'2024-01-08');assert.match(entryTimestamp(s[0].createdAt),/11:00 AM MST/);
 const out=csv([{...s[0],note:'=SUM(A1)'}]);assert.ok(out.includes('Entered at (UTC)'));assert.ok(out.includes('2024-01-10T18:00:00Z'));assert.ok(out.includes("'=SUM(A1)"));
});
