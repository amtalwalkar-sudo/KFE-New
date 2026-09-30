const STORAGE_KEY='kfe.visual.theme.mode'
const SCHEDULE_KEY='kfe.visual.theme.schedule'

const defaults={dayStart:'06:00',nightStart:'19:00'}

function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}
}
function minutes(value){
  const [h,m]=String(value||'').split(':').map(Number)
  return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0
}
function resolveAuto(schedule=defaults,date=new Date()){
  const now=date.getHours()*60+date.getMinutes()
  const dayStart=minutes(schedule.dayStart)
  const nightStart=minutes(schedule.nightStart)
  return now>=dayStart&&now<nightStart?'day':'night'
}
export function applyKfeTheme(){
  const mode=localStorage.getItem(STORAGE_KEY)||'auto'
  const schedule={...defaults,...readJson(SCHEDULE_KEY,{})}
  const resolved=mode==='light'?'day':mode==='dark'?'night':resolveAuto(schedule)
  document.documentElement.dataset.kfeTheme=resolved
  document.documentElement.dataset.kfeThemeMode=mode
  return resolved
}
export function setKfeThemeMode(mode){
  const value=['auto','light','dark'].includes(mode)?mode:'auto'
  localStorage.setItem(STORAGE_KEY,value)
  return applyKfeTheme()
}
export function setKfeThemeSchedule(schedule){
  const next={...defaults,...schedule}
  localStorage.setItem(SCHEDULE_KEY,JSON.stringify(next))
  return applyKfeTheme()
}
export function getKfeThemeSettings(){
  return {mode:localStorage.getItem(STORAGE_KEY)||'auto',schedule:{...defaults,...readJson(SCHEDULE_KEY,{})}}
}
export function startKfeThemeController(){
  applyKfeTheme()
  const tick=()=>applyKfeTheme()
  const onVisibility=()=>{if(document.visibilityState==='visible')tick()}
  const onStorage=event=>{if(event.key===STORAGE_KEY||event.key===SCHEDULE_KEY)tick()}
  const intervalId=window.setInterval(tick,60_000)
  document.addEventListener('visibilitychange',onVisibility)
  window.addEventListener('storage',onStorage)
  return ()=>{
    window.clearInterval(intervalId)
    document.removeEventListener('visibilitychange',onVisibility)
    window.removeEventListener('storage',onStorage)
  }
}
