import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base='http://127.0.0.1:4173/KFE-New/'
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
preview.stdout.on('data',c=>{output+=c.toString()}); preview.stderr.on('data',c=>{output+=c.toString()})
const assert=(x,m)=>{if(!x)throw new Error(m)}
const wait=async p=>{const end=Date.now()+30000;while(Date.now()<end){if(await p())return;await new Promise(r=>setTimeout(r,150))}throw new Error('Timed out')}
const stop=async()=>{try{process.kill(-preview.pid,'SIGTERM')}catch(_){}}
let browser
try{
  const end=Date.now()+30000
  while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250))}
  mkdirSync('artifacts/phase7-isolation',{recursive:true})
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
  await context.addInitScript(()=>{localStorage.clear();sessionStorage.clear()})
  const page=await context.newPage()
  page.on('dialog',async d=>await d.accept())

  async function admin(){await page.goto(base+'admin',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})}
  async function openSynthetic(){await page.getByRole('button',{name:'Settings'}).click();await page.getByRole('button',{name:'Synthetic Data',exact:true}).click()}
  async function loadStage(name){await openSynthetic();await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(1200);await page.reload({waitUntil:'domcontentloaded'});await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})}
  async function createVehicle(registration){
    if(await page.getByRole('button',{name:/Create Vehicle/}).count()===0) await page.getByRole('button',{name:'Vehicle',exact:true}).click()
    await page.getByRole('button',{name:/Create Vehicle/}).click()
    await page.locator('#field-registrationNumber').fill(registration)
    await page.locator('#field-make').fill('Isolation')
    await page.locator('#field-model').fill('Boundary')
    await page.locator('#field-acquiredOn').fill('2026-05-01')
    await page.locator('#field-openingOdometerKm').fill('70000')
    await page.locator('#field-fuelType').selectOption('CNG')
    await page.locator('#field-status').selectOption('Active')
    await page.getByRole('button',{name:'Save record'}).click()
    await page.getByText(registration,{exact:true}).waitFor({state:'visible',timeout:30000})
  }

  // 7A — canonical baseline and physical source identity.
  await admin()
  await createVehicle('CANONICAL-ISOLATION-001')
  const canonicalBefore=await page.evaluate(()=>indexedDB.databases().then(xs=>xs.map(x=>x.name)))
  assert(canonicalBefore.includes('kanishka_kfe_canonical_db'),'canonical DB missing before synthetic activation')

  // 7B — switch to synthetic and verify canonical data is not visible.
  await loadStage('1 week')
  const syntheticActive=await page.evaluate(()=>sessionStorage.getItem('kfe:active-data-source'))
  assert(syntheticActive==='synthetic','synthetic source was not activated')
  assert(await page.getByText('CANONICAL-ISOLATION-001',{exact:true}).count()===0,'canonical record leaked into synthetic UI')
  await createVehicle('SYNTHETIC-ISOLATION-001')
  const syntheticDb=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('kanishka_kfe_synthetic_db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const rows=await new Promise((resolve,reject)=>{const r=db.transaction('vehicles','readonly').objectStore('vehicles').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})
    db.close();return rows
  })
  assert(syntheticDb.some(x=>x.registrationNumber==='SYNTHETIC-ISOLATION-001'),'synthetic write did not land in synthetic DB')
  assert(!syntheticDb.some(x=>x.registrationNumber==='CANONICAL-ISOLATION-001'),'canonical vehicle leaked into synthetic DB')

  // 7C — clear/switch back and prove synthetic writes do not leak into canonical.
  await openSynthetic()
  await page.getByRole('button',{name:'Test Data Reset'}).click()
  await page.waitForTimeout(1200);await page.reload({waitUntil:'domcontentloaded'});await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  const canonicalAfter=await page.evaluate(()=>sessionStorage.getItem('kfe:active-data-source'))
  assert(canonicalAfter==='canonical','clear did not restore canonical source')
  assert(await page.getByText('CANONICAL-ISOLATION-001',{exact:true}).count()>0,'canonical record was lost after synthetic reset')
  assert(await page.getByText('SYNTHETIC-ISOLATION-001',{exact:true}).count()===0,'synthetic record leaked into canonical UI')

  // 7D — repeat with five-year synthetic dataset and verify calculations remain isolated.
  await loadStage('5 years')
  await openSynthetic();const fiveYearStatus=await page.getByText(/Loaded 2026-05-01 → 2031-04-30 · 1826 days/).count()
  assert(fiveYearStatus>0,'five-year synthetic manifest not loaded')
  assert(await page.getByText('CANONICAL-ISOLATION-001',{exact:true}).count()===0,'canonical data leaked into five-year synthetic mode')
  await page.goto(base+'performance',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.performance-page').waitFor({state:'visible',timeout:30000})
  assert(await page.getByText(/212\.2117 KM\/day/).count()>0,'five-year synthetic calculation path unavailable')
  assert(await page.getByText(/1\.061058×/).count()>0,'five-year synthetic target multiplier unavailable')

  // 7E — final reset, reload, and physical DB proof.
  await page.goto(base+'admin',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  await openSynthetic();await page.getByRole('button',{name:'Test Data Reset'}).click()
  await page.waitForTimeout(1200);await page.reload({waitUntil:'domcontentloaded'});await page.locator('.admin-page').waitFor({state:'visible',timeout:30000})
  const dbs=await page.evaluate(()=>indexedDB.databases().then(xs=>xs.map(x=>x.name)))
  assert(dbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing after final reset')
  assert(dbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB missing after final reset')
  assert(await page.getByText('CANONICAL-ISOLATION-001',{exact:true}).count()>0,'canonical record not recoverable after repeated source switching')
  assert(await page.getByText('SYNTHETIC-ISOLATION-001',{exact:true}).count()===0,'synthetic record survived isolated reset')
  await page.screenshot({path:'artifacts/phase7-isolation/final-canonical.png',fullPage:true})
  console.log('Phase 7 canonical ↔ synthetic isolation runtime verification PASS')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
