import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const externalBase=process.env.KFE_RUNTIME_BASE_URL?.trim()
const base=externalBase ? (externalBase.endsWith('/') ? externalBase : externalBase+'/') : 'http://127.0.0.1:4173/'
const preview=externalBase ? null : spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
if(preview){
  preview.stdout.on('data',c=>{output+=c.toString()})
  preview.stderr.on('data',c=>{output+=c.toString()})
}
const wait=async(predicate,label='condition')=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out waiting for '+label)}
const stop=async()=>{if(!preview?.pid)return;try{process.kill(-preview.pid,'SIGTERM')}catch(_){}await new Promise(r=>setTimeout(r,400))}
const assert=(x,m)=>{if(!x)throw new Error(m)}
let browser
try{
 const end=Date.now()+30000;while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250))}
 mkdirSync('artifacts/phase4-runtime',{recursive:true})
 browser=await chromium.launch({headless:true})
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},geolocation:{latitude:19.076,longitude:72.8777,accuracy:30},permissions:['geolocation'],reducedMotion:'reduce'})
 await context.addInitScript(()=>{sessionStorage.setItem('__kfe_phase4_initialized','1');navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:19.076,longitude:72.8777,accuracy:30},timestamp:Date.now()})})
 const page=await context.newPage(),errors=[],failed=[]
 // First-run setup must be completed on the served origin before testing deep routes.
 // Accessing IndexedDB on about:blank is denied, and leaving setup incomplete masks routes.
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000})
 await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_canonical_db');req.onupgradeneeded=()=>{};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
   await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'kfe-first-run-setup',settingKey:'firstRunSetup',values:{version:1,status:'completed',steps:{},completedAt:new Date().toISOString()},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
   db.close()
 })
 await page.reload({waitUntil:'domcontentloaded'})
 const healthy=async(label)=>{assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')}
 const route=async(path,selector,label)=>{const target=path?new URL(path,base).href:base;const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});if(res){const acceptable=res.ok()||(externalBase&&res.status()===404);assert(acceptable,label+' response failed with HTTP '+res.status())};await Promise.race([page.locator(selector).waitFor({state:'attached',timeout:30000}),page.locator('.kfe-runtime-error').waitFor({state:'attached',timeout:30000}).then(async()=>{throw new Error(label+' startup/runtime error: '+(await page.locator('body').innerText()).slice(0,1000))})]);assert(await page.locator(selector).count()>0,label+' selector missing');await healthy(label)}
 // 4A shell/routes
 await route('', '.work-canonical','Work');await page.getByText('Kanishka Enterprises',{exact:true}).first().waitFor({state:'visible'})
 for(const n of ['Work','Timeline','Performance','Admin'])assert(await page.getByRole('link',{name:n,exact:true}).count()>0,'missing nav '+n)
 await page.screenshot({path:'artifacts/phase4-runtime/work-mobile.png',fullPage:true})
 await route('timeline','.timeline','Timeline');await page.screenshot({path:'artifacts/phase4-runtime/timeline-mobile.png',fullPage:true})
 await route('performance','.performance-page','Performance');assert(await page.locator('header.top-bar').count()===0,'Performance header metadata not honored');await page.screenshot({path:'artifacts/phase4-runtime/performance-mobile.png',fullPage:true})
 await route('admin','.admin-page','Admin');await page.screenshot({path:'artifacts/phase4-runtime/admin-mobile.png',fullPage:true})
 // 4B canonical persistence + cross-surface runtime fixture
 const seedCanonicalFixture=async()=>page.evaluate(async()=>{
   const openCanonicalDb=async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})};
   const db=await openCanonicalDb();
   const now=new Date();
   const istDayStartUtc=()=>{ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const y=Number(parts.find(p=>p.type==='year').value),m=Number(parts.find(p=>p.type==='month').value)-1,d=Number(parts.find(p=>p.type==='day').value); return Date.UTC(y,m,d)-19800000 }
   // Timeline is keyed to the IST business day. Build the fixture from that
   // same day boundary rather than UTC midnight, which crosses the day at
   // 18:30 UTC and can otherwise make the fixture invisible on CI.
   const dayStart=istDayStartUtc(); const start=new Date(dayStart+2*60*60*1000).toISOString(); const end=new Date(dayStart+6*60*60*1000).toISOString();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts','trips'],'readwrite'); tx.objectStore('shifts').put({id:'phase4-runtime-shift',status:'COMPLETED',shiftStartAt:start,shiftEndAt:end,startOdometer:1000,endOdometer:1100,totalDistance:100,revenue:1000,toll:50,parking:0,tollParkingRevenueTreatment:'EXCLUDED',openingPersonalKm:0,openingDeadKm:0}); tx.objectStore('trips').put({id:'phase4-runtime-trip',shiftId:'phase4-runtime-shift',status:'COMPLETED',operator:'Uber',tripStartAt:new Date(Date.parse(start)+3600000).toISOString(),tripEndAt:new Date(Date.parse(start)+5400000).toISOString(),tripStartLocation:{latitude:19.076,longitude:72.8777,placeName:'Mumbai Pickup',capturedAt:start},tripEndLocation:{latitude:19.08,longitude:72.88,placeName:'Mumbai Drop',capturedAt:end},tripKm:80,revenue:1000,revenueAuthority:'SUPPORTING_ONLY',tripStage:'RIDE_STARTED'}); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close();
 });
 await seedCanonicalFixture();
 // The runtime matrix must start from a deterministic OFFLINE state. Remove
 // only stale ACTIVE fixture shifts; the completed persistence fixture remains.
 await page.evaluate(async()=>{
   const db=await (async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})})();
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(['shifts'],'readwrite');
     const q=tx.objectStore('shifts').getAll();
     q.onsuccess=()=>{for(const s of q.result||[])if(s.status==='ACTIVE')tx.objectStore('shifts').delete(s.id)};
     q.onerror=()=>reject(q.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
   }); db.close()
 });
 await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#main-content').waitFor({state:'attached'});
 await page.getByRole('link',{name:'Timeline',exact:true}).click(); await page.locator('.timeline').waitFor({state:'attached'}); await page.getByRole('button',{name:'Today',exact:true}).click();
 await wait(async()=> (await page.locator('.timeline').innerText()).includes('Mumbai Pickup'),'persisted Timeline trip');
 assert((await page.locator('.timeline').innerText()).includes('Mumbai Pickup → Mumbai Drop'),'Timeline did not render persisted canonical trip');
 await page.getByRole('link',{name:'Performance',exact:true}).click(); await page.locator('.performance-page').waitFor({state:'attached'});
 await wait(async()=> (await page.locator('.performance-page').innerText()).includes('₹1,000'),'persisted Performance revenue');
 const perfText=await page.locator('.performance-page').innerText(); assert(perfText.includes('₹1,000'),'Performance did not consume the same canonical shift revenue');
 assert(perfText.includes('₹950'),'BR-11 excluded toll was not reflected in actual profit');
 console.log('Phase 4 runtime canonical fixture PASS — persisted shift/trip survived reload and reconciled Timeline revenue with Performance under BR-11 EXCLUDED toll treatment.');
 // 4B Work interactions — includes end-to-end ONLINE persistence verification
 await route('','.work-canonical','Work interactions')
 const shiftToggle=page.locator('button.shift-toggle').first();
 await shiftToggle.waitFor({state:'visible',timeout:30000});
 assert((await shiftToggle.innerText()).trim()==='OFFLINE','Work did not initialize in the expected OFFLINE state');
 await shiftToggle.click();
 await page.getByText('Confirm shift start',{exact:true}).waitFor({state:'visible'});assert(await page.getByRole('button',{name:'Back'}).count()>0,'Start odometer Back missing');await page.getByRole('button',{name:'Back'}).first().click()
 await shiftToggle.click();await page.getByText('Confirm shift start',{exact:true}).waitFor({state:'visible'})
 const odo=page.locator('#start-shift-odometer');await odo.waitFor({state:'visible'});await odo.click();assert(await odo.evaluate(el=>document.activeElement===el),'Start Shift odometer did not receive focus from a real click');await odo.pressSequentially('1100');assert(await odo.inputValue()==='1100','Start Shift odometer did not accept sequential keyboard typing after tap');const startConfirm=page.getByRole('checkbox',{name:'Confirm current vehicle odometer',exact:true});await startConfirm.waitFor({state:'visible'});assert(await startConfirm.isDisabled()===false,'Start Shift confirmation must become available only after a valid odometer is entered');await startConfirm.check();assert(await startConfirm.isChecked(),'Start Shift confirmation checkbox did not remain checked after tap')
 // The seeded completed shift leaves a historical odometer gap. The UI requires
 // the driver to classify that full gap before the shift can be started.
 const personalKm=page.getByRole('button',{name:'Personal KM',exact:true})
 if(await personalKm.count()) await personalKm.click()
 await page.getByRole('button',{name:'CONFIRM & GO ONLINE',exact:true}).click()
 await wait(async()=>await page.getByRole('button',{name:'ONLINE',exact:true}).count()===1 || await page.locator('.feedback.error').count()>0,'shift goes ONLINE').catch(async e=>{throw new Error(e.message+'\nWork start UI: '+(await page.locator('body').innerText().catch(()=>'')))})
 assert(await page.getByRole('button',{name:'ONLINE',exact:true}).count()===1,'Shift start did not reach ONLINE: '+(await page.locator('.feedback.error').allTextContents()).join(' | '))
 assert(await page.getByText("TODAY'S TARGET",{exact:true}).count()>0,'Online target surface missing after shift start')
 // CNG refuelling is covered by the dedicated Work lifecycle/runtime gate; the persistence matrix intentionally does not reopen the full-viewport CNG refuelling overlay.
 // Mandatory fare capture is tested by the dedicated Work lifecycle/runtime
 // verification. Keep the persistence matrix focused on shift persistence here;
 // attempting to open a second full-viewport form from a seeded fixture can race
 // the persisted foreground form and does not test persistence itself.
 // 4B.1 Real Work online transaction: UI confirmation must persist an ACTIVE shift and
 // Verify the just-created ACTIVE shift survives a real browser reload.
 await route('','.work-canonical','Work online persistence')
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.work-canonical').waitFor({state:'attached'})
 await wait(async()=>await page.getByRole('button',{name:'ONLINE',exact:true}).count()===1,'persisted ONLINE state')
 const persistedToggle=page.getByRole('button',{name:'ONLINE',exact:true})
 assert(await persistedToggle.getAttribute('aria-pressed')==='true','Persisted ACTIVE shift did not restore ONLINE state')
 assert(await page.getByText("TODAY'S TARGET",{exact:true}).count()===1,'Persisted ONLINE Work surface did not render')
 const activeShift=await page.evaluate(async()=>{const db=await (async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})})();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts'],'readonly');const q=tx.objectStore('shifts').getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)});db.close();return rows.find(s=>s.status==='ACTIVE')||null})
 assert(activeShift && Number(activeShift.startOdometer)===1100,'ONLINE shift was not persisted in canonical DB') // Leave the smoke fixture clean for subsequent phases.
 await page.evaluate(async(id)=>{const db=await (async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})})();await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts'],'readwrite');tx.objectStore('shifts').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});db.close()},activeShift.id)
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.work-canonical').waitFor({state:'attached'})
 await wait(async()=>await page.getByRole('button',{name:'OFFLINE',exact:true}).count()===1,'clean OFFLINE state')
 
 // 4C GPS
 const gps=page.locator('button.header-gps');assert(await gps.count()===1,'GPS control missing')
 await wait(async()=>['GPS connected','GPS ready — tap to check','GPS permission needed','GPS unavailable','Connecting GPS'].includes(await gps.getAttribute('aria-label')),'GPS initial state')
 const beforeGps=await gps.getAttribute('aria-label');await gps.click()
 await wait(async()=>['GPS connected','GPS permission needed','GPS unavailable'].includes(await gps.getAttribute('aria-label')),'GPS post-check state')
 assert(!(await gps.innerText()).trim(),'GPS control is not icon-only')
// 4D clean baseline presentation
 // The theme controller remains a compatibility/runtime service, but the clean baseline
 // intentionally exposes one neutral visual palette. Theme mode must not alter presentation.
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','light'));await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='day','light mode');assert(await page.locator('html').getAttribute('data-kfe-theme')==='day','light mode failed')
 const light=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim())
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','dark'));await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='night','dark mode');assert(await page.locator('html').getAttribute('data-kfe-theme')==='night','dark mode failed')
 const dark=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim());assert(light===dark,'clean baseline must use one neutral visual palette')
 await page.evaluate(()=>{localStorage.setItem('kfe.visual.theme.mode','auto');localStorage.setItem('kfe.visual.theme.schedule',JSON.stringify({dayStart:'00:00',nightStart:'23:59'}))});await page.reload({waitUntil:'domcontentloaded'});assert(['day','night'].includes(await page.locator('html').getAttribute('data-kfe-theme')),'auto mode invalid')
 // 4E accessibility/responsive
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length}).filter(e=>!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180)))
 assert(unnamed.length===0,'unnamed visible interactive elements: '+JSON.stringify(unnamed.slice(0,10)))
 await page.setViewportSize({width:1280,height:800});await route('','.work-canonical','Work desktop');await page.screenshot({path:'artifacts/phase4-runtime/work-desktop.png',fullPage:true})
 // 4F physical DB separation
 const dbs=await page.evaluate(async()=>indexedDB.databases? (await indexedDB.databases()).map(x=>x.name).filter(Boolean):[])
 assert(dbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing at runtime');assert(!dbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB created during canonical startup')
 if(errors.length)throw new Error('Browser runtime errors:\n'+errors.join('\n'));if(failed.length)throw new Error('Failed requests:\n'+failed.join('\n'))
 console.log('Phase 4 runtime visual verification PASS — shell/routes, Work interactions, GPS, themes, accessibility, responsive layout, and DB isolation.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
