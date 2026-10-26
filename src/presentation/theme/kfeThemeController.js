const STORAGE_KEY='kfe.visual.theme.mode'
const VALID_MODES=new Set(['auto','light','dark'])
let mediaQuery=null
let mediaListener=null

function readMode(){
  try{
    const stored=localStorage.getItem(STORAGE_KEY)
    return VALID_MODES.has(stored)?stored:'auto'
  }catch(_){return 'auto'}
}
function resolvedMode(mode){
  if(mode==='light'||mode==='dark')return mode
  return typeof window!=='undefined'&&window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark'
}
export function applyKfeTheme(mode=readMode()){
  const selected=VALID_MODES.has(mode)?mode:'auto'
  const resolved=resolvedMode(selected)
  const root=document.documentElement
  root.dataset.kfeTheme=resolved
  root.dataset.kfeThemeMode=selected
  root.style.colorScheme=resolved
  return selected
}
export function setKfeThemeMode(mode){
  const selected=VALID_MODES.has(mode)?mode:'auto'
  try{localStorage.setItem(STORAGE_KEY,selected)}catch(_){}
  return applyKfeTheme(selected)
}
export function setKfeThemeSchedule(_schedule){
  return setKfeThemeMode('auto')
}
export function getKfeThemeSettings(){
  const mode=readMode()
  return {mode,resolved:resolvedMode(mode)}
}
export function startKfeThemeController(){
  applyKfeTheme()
  if(typeof window!=='undefined'&&window.matchMedia){
    mediaQuery=window.matchMedia('(prefers-color-scheme: light)')
    mediaListener=()=>{if(readMode()==='auto')applyKfeTheme('auto')}
    mediaQuery.addEventListener?.('change',mediaListener)
  }
  const onVisibility=()=>{if(document.visibilityState==='visible')applyKfeTheme()}
  const onStorage=event=>{if(event.key===STORAGE_KEY)applyKfeTheme()}
  document.addEventListener('visibilitychange',onVisibility)
  window.addEventListener('storage',onStorage)
  return ()=>{
    document.removeEventListener('visibilitychange',onVisibility)
    window.removeEventListener('storage',onStorage)
    if(mediaQuery&&mediaListener)mediaQuery.removeEventListener?.('change',mediaListener)
  }
}
