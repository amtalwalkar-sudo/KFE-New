import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base='http://127.0.0.1:4173/KFE-New/'
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
preview.stdout.on('data',c=>{output+=c.toString()}); preview.stderr.on('data',c=>{output+=c.toString()})
const wait=async predicate=>{const end=Date.now()+30000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,150))}throw new Error('Timed out')}
const assert=(x,m)=>{if(!x)throw new Error(m)}
const stop=async()=>{if(!preview.pid)return;try{process.kill(-preview.pid,'SIGTERM')}catch(_){}await new Promise(r=>setTimeout(r,500))}
let browser
try{
  const end=Date.now()+30000
  while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250))}
  mkdirSync('artifacts/phase6-runtime',{recursive:true})
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:19.076,longitude:72.8777,accuracy:30},permissions:['geolocation'],reducedMotion:'reduce'})
  await context.addInitScript(()=>{localStorage.clear();sessionStorage.clear();navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:19.076,longitude:72.8777,accuracy:30},timestamp:Date.now()})})
  const page=await context.newPage(), errors=[], failed=[]
  page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('requestfailed',r=>failed.push(r.url()))
  const healthy=async label=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow');assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error')}
  const route=async(path,selector,label)=>{const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});assert(res?.ok(),label+' response failed');await page.locator(selector).waitFor({state:'visible',timeout:30000});await healthy(label)}

  await route('admin','.admin-page','Admin')
  await page.getByRole('button',{name:'Settings'}).click()
  await page.getByRole('button',{name:'Synthetic Data',exact:true}).click()
  await page.getByRole('button',{name:'5 years',exact:true}).click()
  await page.getByText(/5 years synthetic dataset loaded/i).waitFor({state:'visible',timeout:30000})
  await page.waitForTimeout(1800)
  await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await page.getByRole('button',{name:'Settings'}).click()
  await page.getByRole('button',{name:'Synthetic Data',exact:true}).click()
  await page.getByText(/Loaded 2026-05-01 → 2031-04-30 · 1826 days/i).waitFor({state:'visible',timeout:30000})
  await wait(async()=>page.evaluate(()=>indexedDB.databases().then(d=>d.some(x=>x.name==='kanishka_kfe_synthetic_db'))))

  const dbEvidence=await page.evaluate(async()=>{
    const names=(await indexedDB.databases()).map(x=>x.name).filter(Boolean)
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_synthetic_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
    const read=name=>new Promise((resolve,reject)=>{const req=db.transaction(name,'readonly').objectStore(name).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})
    const shifts=await read('shifts'), trips=await read('trips'), settings=await read('settings'), loans=await read('loans'), payments=await read('loan_payments')
    db.close()
    return {names,shifts:shifts.length,trips:trips.length,settings,loans:loans.length,payments:payments.length}
  })
  assert(dbEvidence.names.includes('kanishka_kfe_synthetic_db'),'synthetic DB missing')
  assert(dbEvidence.shifts===1826,'synthetic DB shift count mismatch: '+dbEvidence.shifts)
  assert(dbEvidence.trips===8951,'synthetic DB trip count mismatch: '+dbEvidence.trips)
  assert(dbEvidence.loans===1,'synthetic DB loan count mismatch: '+dbEvidence.loans)
  assert(dbEvidence.payments===0,'synthetic DB must start with zero EMI payments')
  const manifest=dbEvidence.settings.find(x=>x.id==='synthetic-setting-manifest')?.values
  assert(manifest?.startDate==='2026-05-01','synthetic start date mismatch')
  assert(manifest?.endDate==='2031-04-30','synthetic end date mismatch')
  assert(manifest?.fullTimeline===true,'synthetic fullTimeline flag missing')

  await route('performance','.performance-page','Performance synthetic')
  await wait(async()=>page.getByText(/212\.2117 KM\/day/).count()>0)
  assert(await page.getByText(/212\.2117 KM\/day/).count()>0,'frozen operating-KM forecast not visible')
  assert(await page.getByText(/1\.061058×/).count()>0,'frozen KM multiplier not visible')
  assert(await page.getByText(/8,951 trips|8951 trips/).count()>0,'synthetic trip count not visible')
  assert(await page.getByText(/Manual override UI is intentionally hidden|Manual override/).count()===0,'manual override UI leaked into user-facing app')
  await page.screenshot({path:'artifacts/phase6-runtime/performance-five-year-mobile.png',fullPage:true})

  await route('timeline','.timeline','Timeline synthetic')
  await page.screenshot({path:'artifacts/phase6-runtime/timeline-five-year-mobile.png',fullPage:true})
  await route('','.cockpit','Work synthetic')
  await page.screenshot({path:'artifacts/phase6-runtime/work-five-year-mobile.png',fullPage:true})
  await page.setViewportSize({width:1280,height:800})
  await route('performance','.performance-page','Performance synthetic desktop')
  await page.screenshot({path:'artifacts/phase6-runtime/performance-five-year-desktop.png',fullPage:true})
  await route('admin','.admin-page','Admin synthetic desktop')

  const finalDbs=await page.evaluate(()=>indexedDB.databases().then(xs=>xs.map(x=>x.name).filter(Boolean)))
  assert(finalDbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB disappeared')
  assert(finalDbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing')
  if(errors.length)throw new Error('Browser runtime errors:\n'+errors.join('\n'))
  if(failed.length)throw new Error('Failed requests:\n'+failed.join('\n'))
  console.log('Phase 6 five-year synthetic runtime verification PASS — UI load, physical DB, full calculation path, visible frozen results, route safety, and DB isolation.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
