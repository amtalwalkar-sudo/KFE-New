import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const externalBase=process.env.KFE_RUNTIME_BASE_URL?.trim()
const base=externalBase?(externalBase.endsWith('/')?externalBase:externalBase+'/'):'http://127.0.0.1:4173/'
const preview=externalBase?null:spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BROWSER:'none'},detached:true})
let output=''
if(preview){preview.stdout.on('data',c=>output+=c.toString());preview.stderr.on('data',c=>output+=c.toString())}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),assert=(x,m)=>{if(!x)throw new Error(m)}
const stop=async()=>{if(!preview?.pid)return;try{process.kill(-preview.pid,'SIGTERM')}catch(_){}await sleep(300)}
let browser
try{
const end=Date.now()+30000;while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){}await sleep(250)}
mkdirSync('artifacts/touch-surface-audit',{recursive:true})
browser=await chromium.launch({headless:true})
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},geolocation:{latitude:19.076,longitude:72.8777,accuracy:30},permissions:['geolocation'],reducedMotion:'reduce'})
await context.addInitScript(()=>{sessionStorage.setItem('__kfe_phase4_initialized','1');navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:19.076,longitude:72.8777,accuracy:30},timestamp:Date.now()})})
const page=await context.newPage(),errors=[],failed=[]
page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('requestfailed',r=>failed.push(r.url()))
const routes=[['/','.work-canonical','Work'],['/timeline','.timeline','Timeline'],['/performance','.performance-page','Performance'],['/admin','.admin-page','Admin']]
const records=[]
for(const [path,root,name] of routes){
await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});await page.locator(root).waitFor({state:'attached',timeout:30000});await sleep(200)
const surfaces=await page.evaluate(()=>[...document.querySelectorAll('button,a,input,select,textarea,summary,[role="button"],[role="tab"],[onclick]')].map((e,i)=>({i,tag:e.tagName.toLowerCase(),text:(e.innerText||e.value||e.getAttribute('aria-label')||e.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,100),aria:e.getAttribute('aria-label')||'',type:e.getAttribute('type')||'',role:e.getAttribute('role')||'',visible:!!e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).pointerEvents!=='none'})).filter(x=>x.visible))
const row={route:name,discovered:surfaces.length,surfaces:[]};records.push(row)
for(const s of surfaces){
await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});await page.locator(root).waitFor({state:'attached',timeout:30000});await sleep(80)
const target=page.locator('button,a,input,select,textarea,summary,[role="button"],[role="tab"],[onclick]').nth(s.i)
try{
await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();assert(box&&box.width>0&&box.height>0,'no hit box')
const beforeUrl=page.url(),before=await page.locator('body').innerText()
await target.click({timeout:5000,noWaitAfter:true});await sleep(120)
const after=await page.locator('body').innerText(),afterUrl=page.url()
const state=await target.evaluate(e=>({expanded:e.getAttribute('aria-expanded'),pressed:e.getAttribute('aria-pressed'),selected:e.getAttribute('aria-selected')})).catch(()=>({}))
const focused=await page.evaluate(()=>['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName||''))
assert(after!==before||afterUrl!==beforeUrl||focused||Object.values(state).some(Boolean),'tap produced no observable response')
row.surfaces.push({...s,status:'PASS'})
}catch(e){row.surfaces.push({...s,status:'FAIL',reason:e.message})}
}}
const all=records.flatMap(r=>r.surfaces),failures=all.filter(x=>x.status==='FAIL')
const summary={routes:records.map(r=>({route:r.route,discovered:r.discovered,pass:r.surfaces.filter(x=>x.status==='PASS').length,fail:r.surfaces.filter(x=>x.status==='FAIL').length})),total:all.length,pass:all.length-failures.length,fail:failures.length,failures}
const fs=await import('node:fs/promises');await fs.writeFile('artifacts/touch-surface-audit/touch-surface-audit.json',JSON.stringify(summary,null,2))
assert(failures.length===0,'Touch Surface Audit found '+failures.length+' non-responsive surface(s):\n'+failures.map(x=>x.tag+': '+x.text+' — '+x.reason).join('\n'))
assert(errors.length===0,'Browser page errors:\n'+errors.join('\n'));assert(failed.length===0,'Failed requests:\n'+failed.join('\n'))
console.log('Touch Surface Audit PASS — every discovered visible interactive surface on Work, Timeline, Performance and Admin responded to a real Playwright interaction.')
console.log(JSON.stringify(summary.routes))
}catch(e){throw new Error(e.message+'\n'+output)}finally{await browser?.close();await stop()}
