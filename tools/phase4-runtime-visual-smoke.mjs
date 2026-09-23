import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base='http://127.0.0.1:4173/KFE-New/'
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
 const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:19.076,longitude:72.8777,accuracy:30},permissions:['geolocation'],reducedMotion:'reduce'})
 await context.addInitScript(()=>{localStorage.clear();sessionStorage.clear();navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:19.076,longitude:72.8777,accuracy:30},timestamp:Date.now()})})
 const page=await context.newPage(),errors=[],failed=[]
 page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('requestfailed',r=>failed.push(r.url()))
 const healthy=async(label)=>{assert((await page.locator('.kfe-runtime-error').count())===0,label+' runtime error');assert((await page.locator('body').innerText()).trim().length>40,label+' empty UI');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')}
 const route=async(path,selector,label)=>{const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});assert(res?.ok(),label+' response failed');await page.locator(selector).waitFor({state:'visible',timeout:20000});await healthy(label)}
 // 4A shell/routes
 await route('', '.cockpit','Work');await page.getByText('Kanishka Enterprises',{exact:true}).first().waitFor({state:'visible'})
 for(const n of ['Work','Timeline','Performance','Admin'])assert(await page.getByRole('link',{name:n,exact:true}).count()>0,'missing nav '+n)
 await page.screenshot({path:'artifacts/phase4-runtime/work-mobile.png',fullPage:true})
 await route('timeline','.timeline','Timeline');await page.screenshot({path:'artifacts/phase4-runtime/timeline-mobile.png',fullPage:true})
 await route('performance','.performance-page','Performance');assert(await page.locator('header.top-bar').count()===0,'Performance header metadata not honored');await page.screenshot({path:'artifacts/phase4-runtime/performance-mobile.png',fullPage:true})
 await route('admin','.admin-page','Admin');await page.screenshot({path:'artifacts/phase4-runtime/admin-mobile.png',fullPage:true})
 // 4B Work interactions
 await route('','.cockpit','Work interactions')
 await page.getByRole('button',{name:'CNG refuelling'}).click();await page.getByText('Refuelling',{exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Keep Draft & Close'}).click()
 await page.getByRole('switch',{name:/go online/i}).click();await page.getByText('START ODOMETER',{exact:true}).waitFor({state:'visible'});assert(await page.getByRole('button',{name:'Back'}).count()>0,'Start odometer Back missing');await page.getByRole('button',{name:'Back'}).first().click()
 // 4C GPS
 const gps=page.locator('button.header-gps');assert(await gps.count()===1,'GPS control missing');await wait(async()=>['GPS connected','GPS ready — tap to check'].includes(await gps.getAttribute('aria-label')));if((await gps.getAttribute('aria-label'))!=='GPS connected')await gps.click();await wait(async()=>await gps.getAttribute('aria-label')==='GPS connected');assert(!(await gps.innerText()).trim(),'GPS control is not icon-only')
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
