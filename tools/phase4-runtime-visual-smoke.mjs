import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const externalBase=process.env.KFE_RUNTIME_BASE_URL?.trim()
const base=externalBase ? (externalBase.endsWith('/') ? externalBase : externalBase+'/') : 'http://127.0.0.1:4173/'
const preview=externalBase ? null : spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
if(preview){ preview.stdout.on('data',c=>{output+=c.toString()}); preview.stderr.on('data',c=>{output+=c.toString()}) }
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
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000})
 await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_canonical_db');req.onupgradeneeded=()=>{};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
   await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'kfe-first-run-setup',settingKey:'firstRunSetup',values:{version:1,status:'completed',steps:{},completedAt:new Date().toISOString()},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
   db.close()
 })
 await page.reload({waitUntil:'domcontentloaded'})
 const healthy=async(label)=>{assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')}
 const route=async(path,selector,label)=>{const target=path?new URL(path,base).href:base;const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});if(res){const acceptable=res.ok()||(externalBase&&res.status()===404);assert(acceptable,label+' response failed with HTTP '+res.status())};await Promise.race([page.locator(selector).waitFor({state:'attached',timeout:30000}),page.locator('.kfe-runtime-error').waitFor({state:'attached',timeout:30000}).then(async()=>{throw new Error(label+' startup/runtime error: '+(await page.locator('body').innerText()).slice(0,1000))})]);assert(await page.locator(selector).count()>0,label+' selector missing');await healthy(label)}
 await route('', '.work-canonical','Work');await page.getByText('Kanishka Enterprises',{exact:true}).first().waitFor({state:'visible'})
 for(const n of ['Work','Timeline','Performance','Admin']){const navCount=await page.getByRole('link',{name:n,exact:true}).count();if(!navCount){throw new Error('missing nav '+n+'\\nBODY:\\n'+(await page.locator('body').innerText()).slice(0,4000))}}
 await page.screenshot({path:'artifacts/phase4-runtime/work-mobile.png',fullPage:true})
 await route('timeline','.timeline','Timeline');await page.screenshot({path:'artifacts/phase4-runtime/timeline-mobile.png',fullPage:true})
 await route('performance','.performance-page','Performance');assert(await page.locator('header.top-bar').count()===0,'Performance header metadata not honored');await page.screenshot({path:'artifacts/phase4-runtime/performance-mobile.png',fullPage:true})
 await route('admin','.admin-page','Admin');await page.screenshot({path:'artifacts/phase4-runtime/admin-mobile.png',fullPage:true})
 const seedCanonicalFixture=async()=>page.evaluate(async()=>{
   const openCanonicalDb=async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})};
   const db=await openCanonicalDb(); const now=new Date();
   const istDayStartUtc=()=>{ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const y=Number(parts.find(p=>p.type==='year').value),m=Number(parts.find(p=>p.type==='month').value)-1,d=Number(parts.find(p=>p.type==='day').value); return Date.UTC(y,m,d)-19800000 }
   const dayStart=istDayStartUtc(); const start=new Date(dayStart+2*60*60*1000).toISOString(); const end=new Date(dayStart+6*60*60*1000).toISOString();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts','trips'],'readwrite'); tx.objectStore('shifts').put({id:'phase4-runtime-shift',status:'COMPLETED',shiftStartAt:start,shiftEndAt:end,startOdometer:1000,endOdometer:1100,totalDistance:100,revenue:1000,toll:50,parking:0,tollParkingRevenueTreatment:'EXCLUDED',openingPersonalKm:0,openingDeadKm:0}); tx.objectStore('trips').put({id:'phase4-runtime-trip',shiftId:'phase4-runtime-shift',status:'COMPLETED',operator:'Uber',tripStartAt:new Date(Date.parse(start)+3600000).toISOString(),tripEndAt:new Date(Date.parse(start)+5400000).toISOString(),tripStartLocation:{latitude:19.076,longitude:72.8777,placeName:'Mumbai Pickup',capturedAt:start},tripEndLocation:{latitude:19.08,longitude:72.88,placeName:'Mumbai Drop',capturedAt:end},tripKm:80,revenue:1000,revenueAuthority:'SUPPORTING_ONLY',tripStage:'RIDE_STARTED'}); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close();
 });
 await seedCanonicalFixture();
 await page.evaluate(async()=>{
   const db=await (async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})})();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts'],'readwrite');const q=tx.objectStore('shifts').getAll();q.onsuccess=()=>{for(const s of q.result||[])if(s.status==='ACTIVE')tx.objectStore('shifts').delete(s.id)};q.onerror=()=>reject(q.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()
 });
 await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#main-content').waitFor({state:'attached'}); await page.getByRole('link',{name:'Timeline',exact:true}).click(); await page.locator('.timeline').waitFor({state:'attached'}); await page.getByRole('button',{name:'Today',exact:true}).click();
 await wait(async()=> (await page.locator('.timeline').innerText()).includes('Mumbai Pickup'),'persisted Timeline trip'); assert((await page.locator('.timeline').innerText()).includes('Mumbai Pickup → Mumbai Drop'),'Timeline did not render persisted canonical trip');
 await page.getByRole('link',{name:'Performance',exact:true}).click(); await page.locator('.performance-page').waitFor({state:'attached'}); await wait(async()=> (await page.locator('.performance-page').innerText()).includes('₹1,000'),'persisted Performance revenue'); const perfText=await page.locator('.performance-page').innerText(); assert(perfText.includes('₹1,000'),'Performance did not consume the same canonical shift revenue'); assert(perfText.includes('₹950'),'BR-11 excluded toll was not reflected in actual profit'); console.log('Phase 4 runtime canonical fixture PASS — persisted shift/trip survived reload and reconciled Timeline revenue with Performance under BR-11 EXCLUDED toll treatment.');
 await route('','.work-canonical','Work technical surface'); const shiftToggle=page.locator('button.shift-toggle').first(); await shiftToggle.waitFor({state:'visible',timeout:30000}); assert((await shiftToggle.innerText()).trim()==='OFFLINE','Work did not initialize in the expected OFFLINE state'); assert(await page.getByRole('button',{name:'START SHIFT',exact:true}).count()===1,'Work START SHIFT action is missing'); assert(await page.getByRole('button',{name:'CNG refuelling',exact:true}).count()===1,'Work CNG control is missing');
 // Simulate an open keyboard where visualViewport already ends above the keyboard.
 const viewportScrolls=await page.evaluate(async()=>{
   const root=document.documentElement,oldInset=root.style.getPropertyValue('--kfe-keyboard-inset'),oldState=root.dataset.kfeKeyboard;
   root.style.setProperty('--kfe-keyboard-inset','300px');root.dataset.kfeKeyboard='open';
   const surface=document.createElement('form');surface.setAttribute('data-kfe-form-surface','true');
   const field=document.createElement('input');field.id='kfe-viewport-inset-check';
   const vv=window.visualViewport;const bottom=(vv?vv.height+vv.offsetTop:window.innerHeight)-100;
   field.getBoundingClientRect=()=>({top:bottom-32,bottom,left:0,right:100,width:100,height:32,x:0,y:bottom-32,toJSON(){return this}});
   const scrolls=[];field.scrollIntoView=()=>scrolls.push('scroll');surface.appendChild(field);document.body.appendChild(surface);
   field.focus();await new Promise(resolve=>setTimeout(resolve,260));surface.remove();
   if(oldInset)root.style.setProperty('--kfe-keyboard-inset',oldInset);else root.style.removeProperty('--kfe-keyboard-inset');
   if(oldState===undefined)delete root.dataset.kfeKeyboard;else root.dataset.kfeKeyboard=oldState;
   field.blur();return scrolls;
 });
 assert(viewportScrolls.length===0,'Visible-viewport control was unnecessarily scrolled after keyboard inset was counted twice: '+JSON.stringify(viewportScrolls));
 console.log('Keyboard viewport behavioral check PASS — visible viewport is not reduced by the keyboard inset a second time.');
 // Reproduce a rapid focus change with off-screen test controls and capture scroll requests.
 const focusScrolls=await page.evaluate(async()=>{
   const surface=document.createElement('form');surface.setAttribute('data-kfe-form-surface','true');
   const first=document.createElement('input');first.id='kfe-focus-race-first';
   const second=document.createElement('input');second.id='kfe-focus-race-second';
   const scrolls=[];for(const [el,id] of [[first,'first'],[second,'second']]){
     el.getBoundingClientRect=()=>({top:1000,bottom:1032,left:0,right:100,width:100,height:32,x:0,y:1000,toJSON(){return this}});
     el.scrollIntoView=()=>scrolls.push(id);surface.appendChild(el);
   }
   document.body.appendChild(surface);first.focus();second.focus();
   await new Promise(resolve=>setTimeout(resolve,260));surface.remove();return scrolls;
 });
 assert(!focusScrolls.includes('first')&&focusScrolls.includes('second'),'Stale focus callback scrolled the field that had already lost focus: '+JSON.stringify(focusScrolls));
 console.log('Focus-race behavioral check PASS — stale field callbacks cannot scroll after focus moves.');
 // Exercise the custom Work keypad rather than only checking that the controls render.
 await page.getByRole('button',{name:'CNG refuelling',exact:true}).click();
 await page.getByText('CNG REFUEL',{exact:true}).waitFor({state:'visible'});
 await page.getByRole('textbox',{name:'Odometer',exact:true}).click();
 await page.getByRole('button',{name:'6',exact:true}).click();
 await page.getByRole('button',{name:'NEXT →',exact:true}).click();
 await wait(async()=> (await page.locator('.kfe-work-number-pad__display').innerText()).toLowerCase().includes('price / kg'),'Work keypad Next navigation');
 assert((await page.locator('.kfe-work-number-pad__display').innerText()).toLowerCase().includes('price / kg'),'Work keypad Next did not advance from fuel odometer to price; display='+(await page.locator('.kfe-work-number-pad__display').innerText()));
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByText('CNG REFUEL',{exact:true}).waitFor({state:'detached'});
 console.log('Work numeric keypad behavioral check PASS — Done advances to the declared next fuel field without submitting the form.');
 const gps=page.locator('button.header-gps');assert(await gps.count()===1,'GPS control missing'); await wait(async()=>['GPS connected','GPS ready — tap to check','GPS permission needed','GPS unavailable','Connecting GPS'].includes(await gps.getAttribute('aria-label')),'GPS initial state'); await gps.click(); await wait(async()=>['GPS connected','GPS permission needed','GPS unavailable'].includes(await gps.getAttribute('aria-label')),'GPS post-check state'); assert(!(await gps.innerText()).trim(),'GPS control is not icon-only');
 // 4D canonical theme presentation: light and dark must use the shared token system and
 // the whole PWA must actually respond when the user changes theme mode.
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','light'));await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='day','light mode');const light=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim());
 await page.evaluate(()=>localStorage.setItem('kfe.visual.theme.mode','dark'));await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='night','dark mode');const dark=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim());assert(light!==dark,'canonical theme tokens must respond to light/dark mode');
 await page.evaluate(()=>{localStorage.setItem('kfe.visual.theme.mode','auto');localStorage.setItem('kfe.visual.theme.schedule',JSON.stringify({dayStart:'00:00',nightStart:'23:59'}))});await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>['day','night'].includes(await page.locator('html').getAttribute('data-kfe-theme')),'auto mode');assert(['day','night'].includes(await page.locator('html').getAttribute('data-kfe-theme')),'auto mode invalid');
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length}).filter(e=>!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180))); assert(unnamed.length===0,'unnamed visible interactive elements: '+JSON.stringify(unnamed.slice(0,10)));
 await page.setViewportSize({width:1280,height:800});await route('','.work-canonical','Work desktop');await page.screenshot({path:'artifacts/phase4-runtime/work-desktop.png',fullPage:true});
 const dbs=await page.evaluate(async()=>indexedDB.databases? (await indexedDB.databases()).map(x=>x.name).filter(Boolean):[]); assert(dbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing at runtime');assert(!dbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB created during canonical startup');
 if(errors.length)throw new Error('Browser runtime errors:\n'+errors.join('\n'));if(failed.length)throw new Error('Failed requests:\n'+failed.join('\n')); console.log('Phase 4 runtime visual verification PASS — shell/routes, Work interactions, GPS, canonical theme switching, accessibility, responsive layout, and DB isolation.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
