import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base='http://127.0.0.1:5173/KFE-New/'
const dev=spawn('npm',['run','dev','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],detached:true})
let output=''
dev.stdout.on('data',c=>output+=c.toString());dev.stderr.on('data',c=>output+=c.toString())
const stop=async()=>{if(dev.pid){try{process.kill(-dev.pid,'SIGTERM')}catch(_){}}}
const assert=(x,m)=>{if(!x)throw new Error(m)}
let browser
try{
  const end=Date.now()+30000
  while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250))}
  mkdirSync('artifacts/phase7-isolation',{recursive:true})
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message))
  await page.goto(base+'admin',{waitUntil:'domcontentloaded',timeout:30000})
  await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await page.locator('.settings-icon-button').click()
  await page.locator('.settings-item').filter({hasText:'Synthetic Data'}).click()
  await page.getByRole('button',{name:'5 years',exact:true}).click()
  await page.waitForTimeout(1200)
  await page.waitForFunction(()=>indexedDB.databases().then(xs=>xs.some(x=>x.name==='kanishka_kfe_synthetic_db')))

  // 7A/7B: physical source activation + normal Admin repository CRUD.
  await page.goto(base+'admin',{waitUntil:'domcontentloaded',timeout:30000})
  await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await page.locator('.item-title').filter({hasText:/^Driver$/}).click()
  await page.getByRole('button',{name:'Create',exact:true}).click()
  await page.locator('#field-name').fill('PHASE7-SYNTHETIC-MARKER')
  await page.locator('#field-phone').fill('0000000000')
  await page.locator('#field-licenseNumber').fill('PHASE7-SYN')
  await page.locator('#field-licenseExpiry').fill('2031-04-08')
  await page.locator('#field-joinedOn').fill('2026-05-01')
  await page.locator('#field-status').selectOption('Active')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await page.getByText('Record created.').waitFor({state:'visible',timeout:30000})

  const syntheticEvidence=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('kanishka_kfe_synthetic_db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const read=(store)=>new Promise((resolve,reject)=>{const q=db.transaction(store,'readonly').objectStore(store).getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})
    const [drivers,shifts,trips,mutations]=await Promise.all([read('drivers'),read('shifts'),read('trips'),read('pending_mutations')]);db.close()
    return {driver:drivers.find(x=>x.name==='PHASE7-SYNTHETIC-MARKER'),shifts:shifts.length,trips:trips.length,mutations:mutations.length}
  })
  assert(syntheticEvidence.driver,'synthetic CRUD marker missing')
  assert(syntheticEvidence.shifts===1826,'synthetic shifts are not the full five-year dataset')
  assert(syntheticEvidence.trips===8951,'synthetic trips are not the full five-year dataset')
  assert(syntheticEvidence.mutations>=1,'synthetic mutation queue did not remain in synthetic DB')

  // 7C/7E: switch physically to canonical without copying records.
  await page.evaluate(()=>{sessionStorage.setItem('kfe:active-data-source','canonical');location.reload()})
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await page.locator('.admin-item').filter({hasText:'Driver'}).click()
  assert(await page.getByText('PHASE7-SYNTHETIC-MARKER',{exact:true}).count()===0,'synthetic record leaked into canonical UI')
  const canonicalEvidence=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('kanishka_kfe_canonical_db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const read=s=>new Promise((resolve,reject)=>{const q=db.transaction(s,'readonly').objectStore(s).getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})
    const [drivers,shifts,trips]=await Promise.all([read('drivers'),read('shifts'),read('trips')]);db.close();return {drivers,shifts:shifts.length,trips:trips.length}
  })
  assert(!canonicalEvidence.drivers.some(x=>x.name==='PHASE7-SYNTHETIC-MARKER'),'synthetic driver leaked into canonical DB')
  assert(canonicalEvidence.shifts===0,'synthetic shifts leaked into canonical DB')
  assert(canonicalEvidence.trips===0,'synthetic trips leaked into canonical DB')

  // 7D: switch back and reload; synthetic CRUD and calculations survive.
  await page.evaluate(()=>{sessionStorage.setItem('kfe:active-data-source','synthetic');location.reload()})
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await page.locator('.admin-item').filter({hasText:'Driver'}).click()
  assert(await page.getByText('PHASE7-SYNTHETIC-MARKER',{exact:true}).count()===1,'synthetic CRUD record did not survive source switch/reload')
  await page.goto(base+'performance',{waitUntil:'domcontentloaded',timeout:30000})
  await page.locator('.performance-page').waitFor({state:'visible',timeout:30000})
  assert(await page.getByText(/212\.2117 KM\/day/).count()>0,'synthetic calculation result not restored after reload')
  assert(await page.getByText(/1\.061058×/).count()>0,'synthetic Driver Target multiplier not restored after reload')

  const finalEvidence=await page.evaluate(async()=>({active:sessionStorage.getItem('kfe:active-data-source'),dbs:(await indexedDB.databases()).map(x=>x.name).filter(Boolean)}))
  assert(finalEvidence.active==='synthetic','synthetic source was not retained')
  assert(finalEvidence.dbs.includes('kanishka_kfe_synthetic_db')&&finalEvidence.dbs.includes('kanishka_kfe_canonical_db'),'both physical DBs are not present')
  await page.screenshot({path:'artifacts/phase7-isolation/synthetic-isolation-mobile.png',fullPage:true})
  if(errors.length)throw new Error('Browser errors:\n'+errors.join('\n'))
  console.log('Phase 7 canonical/synthetic isolation verification PASS — physical separation, active-source CRUD, switching, reload persistence, calculation isolation, and no leakage.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
