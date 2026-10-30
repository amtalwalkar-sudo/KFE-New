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
 page.on('pageerror',error=>errors.push('pageerror: '+error.message)); page.on('console',message=>{if(message.type()==='error')errors.push('console '+message.type()+': '+message.text())});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000})
 // Wait for Work to finish its own canonical storage initialization before any
 // test fixture touches IndexedDB. Never create an unversioned partial database.
 await page.locator('.work-canonical').waitFor({state:'attached',timeout:30000})
 await page.reload({waitUntil:'domcontentloaded'})
 await page.locator('.work-canonical').waitFor({state:'attached',timeout:30000})
 const healthy=async(label)=>{assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')}
 const route=async(path,selector,label)=>{const target=path?new URL(path,base).href:base;const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});if(res){const acceptable=res.ok()||(externalBase&&res.status()===404);assert(acceptable,label+' response failed with HTTP '+res.status())};await Promise.race([page.locator(selector).waitFor({state:'attached',timeout:30000}),page.locator('.kfe-runtime-error').waitFor({state:'attached',timeout:30000}).then(async()=>{throw new Error(label+' startup/runtime error: '+(await page.locator('body').innerText()).slice(0,1000))})]);assert(await page.locator(selector).count()>0,label+' selector missing');await healthy(label)}
 await route('', '.work-canonical','Work');await page.getByText('Kanishka Enterprises',{exact:true}).first().waitFor({state:'visible'})
 for(const n of ['Work','Timeline','Performance','Admin']){const navCount=await page.getByRole('link',{name:n,exact:true}).count();if(!navCount){throw new Error('missing nav '+n+'\\nBODY:\\n'+(await page.locator('body').innerText()).slice(0,4000))}}
 await page.screenshot({path:'artifacts/phase4-runtime/work-mobile.png',fullPage:true})
 await route('timeline','.activity-timeline-page','Timeline');await page.locator('.activity-timeline-page').waitFor({state:'visible'});assert(await page.locator('.activity-timeline-page').count()===1,'Timeline screen did not mount');assert(await page.getByText('Average fuel cost/km',{exact:true}).count()===1,'Timeline fuel cost/km header is missing');assert(await page.getByText('Total amount refilled',{exact:true}).count()===1,'Timeline fuel expenditure header is missing');assert(await page.locator('.performance-page').count()===0,'Timeline mounted retired Performance presentation');for(const n of ['Timeline','Performance'])assert(await page.locator('.bottom-nav').getByText(n,{exact:true}).count(), 'Bottom navigation must retain '+n);await page.screenshot({path:'artifacts/phase4-runtime/timeline-mobile.png',fullPage:true})
  assert(await page.getByRole('link',{name:'Performance',exact:true}).count()===1,'Performance navigation link missing before canonical fixture seed');
  await route('admin','.admin-page','Admin');await page.screenshot({path:'artifacts/phase4-runtime/admin-mobile.png',fullPage:true});
 const seedCanonicalFixture=async()=>page.evaluate(async()=>{
   const openCanonicalDb=async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})};
   const db=await openCanonicalDb(); const now=new Date();
   const istDayStartUtc=()=>{ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const y=Number(parts.find(p=>p.type==='year').value),m=Number(parts.find(p=>p.type==='month').value)-1,d=Number(parts.find(p=>p.type==='day').value); return Date.UTC(y,m,d)-19800000 }
   const dayStart=istDayStartUtc(); const start=new Date(dayStart+2*60*60*1000).toISOString(); const end=new Date(dayStart+6*60*60*1000).toISOString();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts','trips','gps_snapshots','fuel_logs','loans','loan_payments'],'readwrite'); tx.objectStore('loans').clear(); tx.objectStore('loan_payments').clear(); tx.objectStore('shifts').put({id:'phase4-runtime-shift',status:'COMPLETED',shiftStartAt:start,shiftEndAt:end,startOdometer:1000,endOdometer:1100,totalDistance:100,revenue:1000,toll:50,parking:0,tollParkingRevenueTreatment:'EXCLUDED',openingPersonalKm:0,openingDeadKm:0}); tx.objectStore('trips').put({id:'phase4-runtime-trip',shiftId:'phase4-runtime-shift',status:'COMPLETED',operator:'Uber',tripStartAt:new Date(Date.parse(start)+3600000).toISOString(),tripEndAt:new Date(Date.parse(start)+5400000).toISOString(),tripStartLocation:{latitude:19.076,longitude:72.8777,placeName:'Mumbai Pickup',capturedAt:start},tripEndLocation:{latitude:19.08,longitude:72.88,placeName:'Mumbai Drop',capturedAt:end},tripKm:80,revenue:1000,revenueAuthority:'SUPPORTING_ONLY',tripStage:'RIDE_STARTED'});tx.objectStore('fuel_logs').put({id:'phase4-runtime-fuel',vehicleId:'synthetic-vehicle',odometer:1100,pricePerKg:82,amount:250,quantityKg:250/82,isFullTank:true,capturedAt:start,createdAt:start,updatedAt:start});tx.objectStore('gps_snapshots').put({id:'phase4-runtime-pickup-gps',entityType:'TRIP',entityId:'phase4-runtime-trip',eventType:'PICKUP_START',eventAt:start,latitude:19.076,longitude:72.8777,accuracy:null,capturedAt:start,createdAt:now.toISOString()});tx.objectStore('gps_snapshots').put({id:'phase4-runtime-drop-gps',entityType:'TRIP',entityId:'phase4-runtime-trip',eventType:'TRIP_END',eventAt:end,latitude:19.08,longitude:72.88,accuracy:null,capturedAt:end,createdAt:now.toISOString()}); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close();
 });
 await seedCanonicalFixture();
 await page.evaluate(async()=>{
   const db=await (async()=>{const list=await indexedDB.databases();const entry=list.find(x=>x.name==='kanishka_kfe_canonical_db');return await new Promise((resolve,reject)=>{const req=entry?.version?indexedDB.open('kanishka_kfe_canonical_db',entry.version):indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})})();
   await new Promise((resolve,reject)=>{const tx=db.transaction(['shifts'],'readwrite');const q=tx.objectStore('shifts').getAll();q.onsuccess=()=>{for(const s of q.result||[])if(s.status==='ACTIVE')tx.objectStore('shifts').delete(s.id)};q.onerror=()=>reject(q.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()
 });
 await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#main-content').waitFor({state:'attached'});
 const canonicalFixture=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});const read=(store,id)=>new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).get(id);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)});const shift=await read('shifts','phase4-runtime-shift');const trip=await read('trips','phase4-runtime-trip');db.close();return {shift:shift&&{id:shift.id,status:shift.status,revenue:shift.revenue,toll:shift.toll,treatment:shift.tollParkingRevenueTreatment},trip:trip&&{id:trip.id,shiftId:trip.shiftId,status:trip.status,revenue:trip.revenue,pickup:trip.tripStartLocation?.placeName,drop:trip.tripEndLocation?.placeName}}});
 assert(canonicalFixture.shift?.status==='COMPLETED'&&canonicalFixture.shift.revenue===1000,'Canonical completed shift did not persist through reload');assert(canonicalFixture.shift.treatment==='EXCLUDED'&&canonicalFixture.shift.toll===50,'BR-11 toll treatment did not persist: '+JSON.stringify(canonicalFixture.shift));assert(canonicalFixture.trip?.status==='COMPLETED'&&canonicalFixture.trip.shiftId===canonicalFixture.shift.id,'Canonical trip/shift relationship did not persist');assert(canonicalFixture.trip.revenue===1000&&canonicalFixture.trip.pickup==='Mumbai Pickup'&&canonicalFixture.trip.drop==='Mumbai Drop','Canonical trip revenue or location data did not persist');
 await page.getByRole('link',{name:'Timeline',exact:true}).click();await page.locator('.activity-timeline-page').waitFor({state:'visible'});await page.getByText('Location unavailable',{exact:true}).first().waitFor({state:'visible',timeout:10000});await page.getByText('Completed',{exact:true}).waitFor({state:'visible',timeout:10000});assert(await page.getByText('Location unavailable',{exact:true}).count()===2,'Timeline must not display unresolved coordinates as if they were locality names');assert(await page.getByText('Completed',{exact:true}).count()>=1,'Timeline did not include the canonical completed ride after reload');await page.getByRole('link',{name:'Performance',exact:true}).click();await page.locator('.performance-page').waitFor({state:'visible'});assert(await page.locator('.performance-page').count()===1,'Performance did not render after navigation');await page.waitForFunction(()=>{const root=document.querySelector('.performance-page');if(!root)return false;const metric=[...root.querySelectorAll('.performance-metric')].some(el=>el.textContent.includes('Fare income')&&el.getClientRects().length>0);const error=root.querySelector('.performance-error');return metric||Boolean(error&&error.getClientRects().length>0)},{timeout:45000}).catch(async()=>{throw new Error('Performance data load timed out; screen: '+(await page.locator('.performance-page').innerText()).slice(0,2000)+'; runtime errors: '+JSON.stringify(errors))});if(await page.locator('.performance-error').count()){throw new Error('Performance service reported an error: '+await page.locator('.performance-error').innerText())}if(await page.locator('.performance-metric').filter({hasText:'Fare income'}).filter({hasNotText:'Income after fuel'}).count()!==1){throw new Error('Fare income metric missing; Performance screen: '+(await page.locator('.performance-page').innerText()).slice(0,3000)+'; runtime errors: '+JSON.stringify(errors))} const fareIncomeText=await page.locator('.performance-metric').filter({hasText:'Fare income'}).filter({hasNotText:'Income after fuel'}).innerText(); if(!fareIncomeText.includes('1,000')) throw new Error('Fare income value mismatch; actual metric: '+fareIncomeText+'; Performance screen: '+(await page.locator('.performance-page').innerText()).slice(0,3000));await page.locator('.performance-metric').filter({hasText:'Fuel spending'}).getByText('₹250.00',{exact:true}).waitFor({state:'visible'});await page.locator('.performance-metric').filter({hasText:'Income after fuel'}).getByText('₹750.00',{exact:true}).waitFor({state:'visible'});assert(await page.locator('.performance-metric').filter({hasText:'Completed rides'}).getByText('1',{exact:true}).count()===1,'Performance completed-ride count must match the seeded canonical trip');assert(await page.locator('.performance-footnote').innerText().then(t=>t.includes('not included in Phase 1')),'Performance must clearly exclude unimplemented maintenance and EMI costs'); await page.getByRole('heading',{name:'Cumulative provision balances'}).waitFor({state:'visible'});  for(const n of ['Timeline','Performance'])assert(await page.locator('.bottom-nav').getByText(n,{exact:true}).count(),'Bottom navigation must retain '+n);console.log('Phase 4 runtime canonical fixture PASS — persisted shift/trip/fuel records produce the expected rendered fare, fuel and income-after-fuel values; Timeline remains locality-honest and Performance scope is explicit.');
 await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('kanishka_kfe_canonical_db');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});const now=new Date().toISOString();await new Promise((resolve,reject)=>{const tx=db.transaction(['loans','loan_payments'],'readwrite');tx.objectStore('loans').put({id:'phase4-runtime-loan',lender:'CI audit fixture loan',accountReference:'CI-FIXTURE',principal:100000,tenureMonths:60,startDate:'2026-01-01',annualInterestRatePercent:0,status:'Active',createdAt:now,updatedAt:now});tx.objectStore('loan_payments').put({id:'phase4-runtime-loan-payment',loanId:'phase4-runtime-loan',amount:20000,paidOn:now,status:'PAID',createdAt:now,updatedAt:now});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()});
  await route('admin','.admin-page','Admin seeded Finance'); await page.getByRole('button',{name:/Loan/}).first().click(); await page.getByRole('heading',{name:'Loan',exact:true}).waitFor({state:'visible'}); await page.getByText(/CI audit fixture loan/).waitFor({state:'visible'}); const adminLoanCard=page.locator('.record-card').filter({hasText:'CI audit fixture loan'}); await adminLoanCard.getByText('EMI provision balance',{exact:true}).waitFor({state:'attached'}); await wait(async()=>/(?:-|−).*₹|₹.*(?:-|−)/.test(await adminLoanCard.innerText()),'rendered negative EMI balance in Admin Finance'); await adminLoanCard.getByRole('button',{name:/View amortization schedule/}).click(); await adminLoanCard.getByRole('region',{name:/Amortization schedule/}).waitFor({state:'visible'}); if(await adminLoanCard.locator('.loan-amortization-row').count()<2) throw new Error('Admin Finance did not render the canonical amortization schedule');
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
 // Exercise the custom Work keypad's distinct NEXT and DONE semantics.
 await page.getByRole('button',{name:'CNG refuelling',exact:true}).click();
 await page.locator('.work-context-form.form-fuel').waitFor({state:'visible'});
 await page.getByRole('textbox',{name:'Odometer',exact:true}).click();
 await page.getByRole('button',{name:'6',exact:true}).click();
 await page.getByRole('button',{name:/NEXT/}).click();
 await wait(async()=> (await page.locator('.kfe-work-number-pad__display').innerText()).toLowerCase().includes('price / kg'),'Work keypad Next navigation');
 assert((await page.locator('.kfe-work-number-pad__display').innerText()).toLowerCase().includes('price / kg'),'Work keypad NEXT did not advance from fuel odometer to price; display='+(await page.locator('.kfe-work-number-pad__display').innerText()));
 await page.getByRole('button',{name:'DONE',exact:true}).click();
 await page.locator('.kfe-work-number-pad').waitFor({state:'detached'});
 assert(await page.locator('.work-context-form.form-fuel').count()===1,'DONE unexpectedly submitted or dismissed the fuel form before the final field');
 await page.getByRole('button',{name:'Close fuel form'}).click();
 await page.locator('.work-context-form.form-fuel').waitFor({state:'detached'});
 console.log('Work numeric keypad behavioral check PASS — NEXT advances and non-terminal DONE closes the keypad without submitting.');
 // 4D canonical theme: legacy Light/Auto preferences must be coerced to Dark-only.
 for(const legacyMode of ['light','auto','dark']){
   await page.evaluate(mode=>localStorage.setItem('kfe.visual.theme.mode',mode),legacyMode);
   await page.reload({waitUntil:'domcontentloaded'});
   await wait(async()=>await page.locator('html').getAttribute('data-kfe-theme')==='dark','Dark-only theme enforced for '+legacyMode);
   const theme=await page.evaluate(()=>({mode:document.documentElement.dataset.kfeThemeMode,bg:getComputedStyle(document.documentElement).getPropertyValue('--kfe-ui-bg').trim(),scheme:getComputedStyle(document.documentElement).colorScheme,stored:localStorage.getItem('kfe.visual.theme.mode')}));
   assert(theme.mode==='dark'&&theme.scheme==='dark'&&theme.stored==='dark','KFE must persist and enforce dark-only theme for prior preference '+legacyMode+': '+JSON.stringify(theme));
   assert(theme.bg==='#10151B','Dark-only theme must retain the canonical dark background: '+JSON.stringify(theme));
 }
 console.log('Dark-only theme behavioral check PASS — legacy Light/Auto settings are migrated to persisted Dark.');
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length}).filter(e=>!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180))); assert(unnamed.length===0,'unnamed visible interactive elements: '+JSON.stringify(unnamed.slice(0,10)));
 await page.setViewportSize({width:1280,height:800});await route('','.work-canonical','Work desktop');await page.screenshot({path:'artifacts/phase4-runtime/work-desktop.png',fullPage:true});
 const dbs=await page.evaluate(async()=>indexedDB.databases? (await indexedDB.databases()).map(x=>x.name).filter(Boolean):[]); assert(dbs.includes('kanishka_kfe_canonical_db'),'canonical DB missing at runtime');assert(!dbs.includes('kanishka_kfe_synthetic_db'),'synthetic DB created during canonical startup');
 if(errors.length)throw new Error('Browser runtime errors:\n'+errors.join('\n'));if(failed.length)throw new Error('Failed requests:\n'+failed.join('\n')); console.log('Phase 4 runtime visual verification PASS — shell/routes, Work interactions, Light/Dark/Auto canonical theme enforcement, accessibility, responsive layout, and DB isolation.')
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
