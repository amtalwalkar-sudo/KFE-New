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
  const result=await page.evaluate(async()=>{
    const { loadSyntheticStage } = await import('/KFE-New/src/application/synthetic/syntheticDataService.js')
    const { setActiveDataSource, getActiveDataSource, initializeActiveStorage } = await import('/KFE-New/src/utils/indexedDB.js')
    const { AdminService } = await import('/KFE-New/src/application/admin/adminService.js')
    const { PerformanceRepository } = await import('/KFE-New/src/repositories/performanceRepository.js')

    await loadSyntheticStage('fiveYears')
    const syntheticBefore = getActiveDataSource()
    const syntheticMarker = await AdminService.save('driver',{name:'PHASE7-SYNTHETIC-MARKER',phone:'0000000000',licenseNumber:'PHASE7-SYN',licenseExpiry:'2031-04-08',joinedOn:'2026-05-01',status:'Active'})
    const syntheticList = await AdminService.list('driver')
    const syntheticMetrics = await PerformanceRepository.getSnapshot()
    setActiveDataSource('canonical')
    const canonicalList = await AdminService.list('driver')
    const canonicalMetrics = await PerformanceRepository.getSnapshot()
    setActiveDataSource('synthetic')
    const syntheticReloadList = await AdminService.list('driver')
    const afterReloadSwitch = await PerformanceRepository.getSnapshot()
    const canonicalDb = await new Promise((resolve,reject)=>{const r=indexedDB.open('kanishka_kfe_canonical_db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const syntheticDb = await new Promise((resolve,reject)=>{const r=indexedDB.open('kanishka_kfe_synthetic_db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const readAll=(db,store)=>new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})
    const [canonicalDrivers,syntheticDrivers,canonicalMutations,syntheticMutations]=await Promise.all([
      readAll(canonicalDb,'drivers'),readAll(syntheticDb,'drivers'),readAll(canonicalDb,'pending_mutations'),readAll(syntheticDb,'pending_mutations')
    ])
    canonicalDb.close();syntheticDb.close()
    return {
      syntheticBefore, markerId:syntheticMarker.id,
      syntheticMarkerVisible:syntheticList.some(x=>x.id===syntheticMarker.id),
      canonicalMarkerAbsent:!canonicalList.some(x=>x.id===syntheticMarker.id),
      syntheticMarkerAfterSwitchBack:syntheticReloadList.some(x=>x.id===syntheticMarker.id),
      syntheticShiftCount:syntheticMetrics.shifts.length,
      canonicalShiftCount:canonicalMetrics.shifts.length,
      syntheticShiftCountAfterSwitchBack:afterReloadSwitch.shifts.length,
      canonicalDrivers:canonicalDrivers.length,syntheticDrivers:syntheticDrivers.length,
      canonicalMutations:canonicalMutations.length,syntheticMutations:syntheticMutations.length,
      active:getActiveDataSource()
    }
  })
  assert(result.syntheticBefore==='synthetic','synthetic activation failed')
  assert(result.syntheticMarkerVisible,'synthetic CRUD marker not visible')
  assert(result.canonicalMarkerAbsent,'synthetic CRUD leaked into canonical')
  assert(result.syntheticMarkerAfterSwitchBack,'synthetic record lost after source switch')
  assert(result.syntheticShiftCount===1826,'synthetic calculation input count mismatch')
  assert(result.syntheticShiftCountAfterSwitchBack===1826,'synthetic calculation count changed after switch')
  assert(result.canonicalShiftCount===0,'canonical store unexpectedly contains synthetic shifts')
  assert(result.active==='synthetic','active source did not return to synthetic')
  assert(result.syntheticMutations>=1,'synthetic mutation/audit queue did not remain in synthetic DB')
  await page.reload({waitUntil:'domcontentloaded'})
  const persisted=await page.evaluate(async()=>{
    const {getActiveDataSource}=await import('/KFE-New/src/utils/indexedDB.js')
    const {AdminService}=await import('/KFE-New/src/application/admin/adminService.js')
    return {active:getActiveDataSource(),drivers:(await AdminService.list('driver')).some(x=>x.values?.name==='PHASE7-SYNTHETIC-MARKER')}
  })
  assert(persisted.active==='synthetic','synthetic source did not survive reload')
  assert(persisted.drivers,'synthetic CRUD record did not survive reload')
  await page.screenshot({path:'artifacts/phase7-isolation/synthetic-isolation-mobile.png',fullPage:true})
  if(errors.length)throw new Error('Browser errors:\\n'+errors.join('\\n'))
  console.log('Phase 7 canonical/synthetic isolation verification PASS')
}catch(e){throw new Error(e.message+'\\n'+output)}finally{await browser?.close();await stop()}
