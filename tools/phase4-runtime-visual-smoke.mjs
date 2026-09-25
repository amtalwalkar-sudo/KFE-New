import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base='http://127.0.0.1:4173/'
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
preview.stdout.on('data',c=>{output+=c.toString()}); preview.stderr.on('data',c=>{output+=c.toString()})
const wait=async predicate=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out')}
const stop=async()=>{if(!preview.pid)return;try{process.kill(-preview.pid,'SIGTERM')}catch(_){}await new Promise(r=>setTimeout(r,400))}
const assert=(x,m)=>{if(!x)throw new Error(m)}
let browser
try{
 const end=Date.now()+30000;while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250))}
 mkdirSync('artifacts/phase4-runtime',{recursive:true})
 browser=await chromium.launch({headless:true})
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},geolocation:{latitude:19.076,longitude:72.8777,accuracy:30},permissions:['geolocation'],reducedMotion:'reduce'})
 await context.addInitScript(()=>{sessionStorage.setItem('__kfe_phase4_initialized','1');navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:19.076,longitude:72.8777,accuracy:30},timestamp:Date.now()})})
 const page=await context.newPage(),errors=[],failed=[]
 page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('requestfailed',r=>failed.push(r.url()))
 const healthy=async(label)=>{assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')}
 const route=async(path,selector,label)=>{const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});assert(res?.ok(),label+' response failed');await Promise.race([page.locator(selector).waitFor({state:'attached',timeout:30000}),page.locator('.kfe-runtime-error').waitFor({state:'attached',timeout:30000}).then(async()=>{throw new Error(label+' startup/runtime error: '+(await page.locator('body').innerText()).slice(0,1000))})]);assert(await page.locator(selector).count()>0,label+' selector missing');await healthy(label)}
 // 4A shell/routes
 await route('', '.cockpit','Work');await page.getByText('Kanishka Enterprises',{exact:true}).first().waitFor({state:'visible'})
 for(const n of ['Work','Timeline','Performance','Admin'])assert(await page.getByRole('link',{name:n,exact:true}).count()>0,'missing nav '+n)
 await page.screenshot({path:'artifacts/phase4-runtime/work-mobile.png',fullPage:true})
 await route('timeline','.timeline','Timeline');await page.screenshot({path:'artifacts/phase4-runtime/timeline-mobile.png',fullPage:true})
 await route('performance','.performance-page','Performance');assert(await page.locator('header.top-bar').count()===0,'Performance header metadata not honored');await page.screenshot({path:'artifacts/phase4-runtime/performance-mobile.png',fullPage:true})
 await route('admin','.admin-page','Admin');await page.screenshot({path:'artifacts/phase4-runtime/admin-mobile.png',fullPage:true})
 // 4B canonical persistence + cross-surface runtime fixture
 const seedCanonicalFixture=async()=>page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_canonical_db',13);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
   const now=new Date(); const y=now.getUTCFullYear(),m=now.getUTCMonth(),d=now.getUTCDate();
   const start=new Date(Date.UTC(y,m,d,4,0,0,0)).toISOString(); const end=new Date(Date.UTC(y,m,d,12,0,0,0)).toISOString();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts','trips'],'readwrite'); tx.objectStore('shifts').put({id:'phase4-runtime-shift',status:'COMPLETED',shiftStartAt:start,shiftEndAt:end,startOdometer:1000,endOdometer:1100,totalDistance:100,revenue:1000,toll:50,parking:0,tollParkingRevenueTreatment:'EXCLUDED',openingPersonalKm:0,openingDeadKm:0}); tx.objectStore('trips').put({id:'phase4-runtime-trip',shiftId:'phase4-runtime-shift',status:'COMPLETED',operator:'Uber',tripStartAt:new Date(Date.parse(start)+3600000).toISOString(),tripEndAt:new Date(Date.parse(start)+5400000).toISOString(),tripStartLocation:{latitude:19.076,longitude:72.8777,placeName:'Mumbai Pickup',capturedAt:start},tripEndLocation:{latitude:19.08,longitude:72.88,placeName:'Mumbai Drop',capturedAt:end},tripKm:80,revenue:1000,revenueAuthority:'SUPPORTING_ONLY',tripStage:'RIDE_STARTED'}); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close();
 });
 await seedCanonicalFixture();
 await page.reload({waitUntil:'domcontentloaded'}); await page.locator('.cockpit').waitFor({state:'visible'});
 await page.getByRole('link',{name:'Timeline',exact:true}).click(); await page.locator('.timeline').waitFor({state:'visible'}); await page.getByRole('button',{name:'Today',exact:true}).click();
 await wait(async()=> (await page.locator('.timeline').innerText()).includes('Mumbai Pickup') );
 assert((await page.locator('.timeline').innerText()).includes('Mumbai Pickup → Mumbai Drop'),'Timeline did not render persisted canonical trip');
 await page.getByRole('link',{name:'Performance',exact:true}).click(); await page.locator('.performance-page').waitFor({state:'visible'});
 await wait(async()=> (await page.locator('.performance-page').innerText()).includes('₹1,000'));
 const perfText=await page.locator('.performance-page').innerText(); assert(perfText.includes('₹1,000'),'Performance did not consume the same canonical shift revenue');
 assert(perfText.includes('₹950'),'BR-11 excluded toll was not reflected in actual profit');
 console.log('Phase 4 runtime canonical fixture PASS — persisted shift/trip survived reload and reconciled Timeline revenue with Performance under BR-11 EXCLUDED toll treatment.');
 // 4B Work interactions
 await route('','.cockpit','Work interactions')
 await page.getByRole('button',{name:'CNG refuelling'}).click();await page.getByText('Refuelling',{exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Keep Draft & Close'}).click()
 await page.getByRole('switch',{name:/go online/i}).click();await page.getByText('START ODOMETER',{exact:true}).waitFor({state:'visible'});assert(await page.getByRole('button',{name:'Back'}).count()>0,'Start odometer Back missing');await page.getByRole('button',{name:'Back'}).first().click()
 // 4C GPS
 const gps=page.locator('button.header-gps');assert(await gps.count()===1,'GPS control missing')
 await wait(async()=>['GPS connected','GPS ready — tap to check','GPS permission needed','GPS unavailable','Connecting GPS'].includes(await gps.getAttribute('aria-label')))
 const beforeGps=await gps.getAttribute('aria-label');await gps.click()
 await wait(async()=>['GPS connected','GPS permission needed','GPS unavailable'].includes(await gps.getAttribute('aria-label')))
 assert(!(await gps.innerText()).trim(),'GPS control is not icon-only')
// 4D themes
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','light'));await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cockpit').waitFor({state:'visible'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='day');assert(await page.locator('html').getAttribute('data-kfe-theme')==='day','light theme failed')
 const light=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim())
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','dark'));await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cockpit').waitFor({state:'visible'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='night');assert(await page.locator('html').getAttribute('data-kfe-theme')==='night','dark theme failed')
 const dark=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim());assert(light!==dark,'light/dark palettes are identical')
 await page.evaluate(()=>{localStorage.setItem('kfe.visual.theme.mode','auto');localStorage.setItem('kfe.visual.theme.schedule',JSON.stringify({dayStart:'00:00',nightStart:'23:59'}))});await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cockpit').waitFor({state:'visible'});assert(['day','night'].includes(await page.locator('html').getAttribute('data-kfe-theme')),'auto theme invalid')
 // 4E accessibility/responsive
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length}).filter(e=>!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180)))
 assert(unnamed.length===0,'unnamed visible interactive elements: '+JSON.stringify(unnamed.slice(0,10)))
 await page.setViewportSize({width:1280,height:800});await route('','.cockpit','Work desktop');await page.screenshot({path:'artifacts/phase4-runtime/work-desktop.png',fullPage:true})
 // 4F physical DB separation
 const dbs=await page.evaluate(async()=>indexedDB.databases? (await indexedDB.databases()).map(x=>x.name).filter(Boolean):[])
 assert(dbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing at runtime');assert(!dbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB created during canonical startup')
 if(errors.length)throw new Error('Browser runtime errors:\n'+errors.join('\n'));if(failed.length)throw new Error('Failed requests:\n'+failed.join('\n'))
 console.log('Phase 4 runtime visual verification PASS — shell/routes, Work interactions, GPS, themes, accessibility, responsive layout, and DB isolation.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
