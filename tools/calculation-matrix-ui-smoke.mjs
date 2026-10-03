import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base=process.env.KFE_RUNTIME_BASE_URL?.trim() || 'http://127.0.0.1:4173/'
const preview=process.env.KFE_RUNTIME_BASE_URL ? null : spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe'],detached:true})
const wait=async(fn,label)=>{const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out: '+label)}
const route=async(page,path,selector)=>{await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});await page.locator(selector).waitFor({state:'attached',timeout:30000})}
const checks=[
 ['CV-01','performance','.performance-page','Vehicle KM'],
 ['CV-02','performance','.performance-page','Business KM'],
 ['CV-03','performance','.performance-page','Dead KM'],
 ['CV-04','work','.work-canonical','START SHIFT'],
 ['CV-05','work','.work-canonical','START SHIFT'],
 ['CV-06','performance','.performance-page','ACTUAL PROFIT / LOSS'],
 ['CV-07','work','.work-canonical','KFE WORK'],
 ['CV-08','work','.work-canonical','KFE WORK'],
 ['CV-09','performance','.performance-page','Fuel trail'],
 ['CV-10','performance','.performance-page','Total spend'],
 ['CV-11','performance','.performance-page','Maintenance'],
 ['CV-12','performance','.performance-page','Maintenance provision'],
 ['CV-13','performance','.performance-page','RECOVERY & PROVISIONS'],
 ['CV-14','performance','.performance-page','Compliance'],
 ['CV-15','admin','.admin-page','Loan'],
 ['CV-16','admin','.admin-page','Loan'],
 ['CV-17','finance','.admin-page','Ledger'],
 ['CV-18','performance','.performance-page','RECOVERY & PROVISIONS'],
 ['CV-19','performance','.performance-page','Operating cost'],
 ['CV-20','finance','.admin-page','Ledger'],
 ['CV-21','performance','.performance-page','ACTUAL PROFIT / LOSS'],
 ['CV-22','performance','.performance-page','PROVISIONAL PROFIT / LOSS'],
 ['CV-23','performance','.performance-page','BREAK-EVEN'],
 ['CV-24','performance','.performance-page','BREAK-EVEN'],
 ['CV-25','performance','.performance-page',"TODAY'S TARGET"],
 ['CV-26','performance','.performance-page','DAILY REVENUE ALLOCATION'],
 ['CV-27','performance','.performance-page','Operating KM outlook'],
 ['CV-28','performance','.performance-page','Performance period'],
 ['CV-29','performance','.performance-page','PROVISIONS'],
 ['CV-30','finance','.admin-page','Ledger'],
]
let browser
try{
 const end=Date.now()+30000
 while(Date.now()<end){try{if((await fetch(base)).ok)break}catch(_){ }await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:390,height:844}})
 const grouped=new Map()
 for(const [id,surface,selector,label] of checks){
   if(!grouped.has(surface))grouped.set(surface,[])
   grouped.get(surface).push([id,label])
 }
 for(const [surface,items] of grouped){
   const path=surface==='performance'?'performance':surface==='work'?'':'admin'
   await route(page,path,selectorFor(surface))
   if(surface==='performance') await wait(async()=> (await page.locator('body').innerText()).includes('Where the business stands'),'Performance ready')
   if(surface==='admin') await wait(async()=> (await page.locator('body').innerText()).includes('Business Setup'),'Admin ready')
   if(surface==='work') await wait(async()=> (await page.locator('body').innerText()).includes('START SHIFT'),'Work ready')
   const body=await page.locator('body').textContent()
   for(const [id,label] of items) if(!body.includes(label)) throw new Error(`${id} UI DOM assertion failed: missing "${label}" on ${surface}`)
 }
 console.log('Calculation matrix rendered UI smoke: PASS')
 console.log(JSON.stringify({rows:checks.length,assertions:checks.length,surfaces:[...grouped.keys()]}))
}finally{await browser?.close();if(preview?.pid){try{process.kill(-preview.pid,'SIGTERM')}catch(_){}}}

function selectorFor(surface){
 if(surface==='performance')return '.performance-page'
 if(surface==='work')return '.work-canonical'
 return '.admin-page'
}
