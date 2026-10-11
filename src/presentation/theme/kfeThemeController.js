const STORAGE_KEY='kfe.visual.theme.mode'
const SCHEDULE_KEY='kfe.visual.theme.schedule'

const fixedSettings={mode:'dark',schedule:{dayStart:'06:00',nightStart:'19:00'}}

function persistDarkPreference(){
  try{
    localStorage.setItem(STORAGE_KEY,'dark')
    localStorage.removeItem(SCHEDULE_KEY)
  }catch(_){}
}

export function applyKfeTheme(){
  persistDarkPreference()
  const root=document.documentElement
  root.dataset.kfeTheme='night'
  root.dataset.kfeThemeMode='dark'
  root.style.colorScheme='dark'
  return 'night'
}

// Compatibility API: requests for light/auto are intentionally normalized to dark.
export function setKfeThemeMode(_mode){
  return applyKfeTheme()
}

// Theme scheduling is retired; the app always uses the readable dark palette.
export function setKfeThemeSchedule(_schedule){
  return applyKfeTheme()
}

export function getKfeThemeSettings(){
  return {mode:fixedSettings.mode,schedule:{...fixedSettings.schedule}}
}

export function startKfeThemeController(){
  applyKfeTheme()
  const onVisibility=()=>{if(document.visibilityState==='visible')applyKfeTheme()}
  const onStorage=event=>{if(event.key===STORAGE_KEY||event.key===SCHEDULE_KEY)applyKfeTheme()}
  document.addEventListener('visibilitychange',onVisibility)
  window.addEventListener('storage',onStorage)
  return ()=>{
    document.removeEventListener('visibilitychange',onVisibility)
    window.removeEventListener('storage',onStorage)
  }
}
