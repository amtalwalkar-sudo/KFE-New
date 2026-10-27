const STORAGE_KEY='kfe.visual.theme.mode'

function readMode(){
  try {
    if (localStorage.getItem(STORAGE_KEY) !== 'dark') localStorage.setItem(STORAGE_KEY, 'dark')
  } catch (_) {}
  return 'dark'
}

export function applyKfeTheme(){
  readMode()
  const root=document.documentElement
  root.dataset.kfeTheme='dark'
  root.dataset.kfeThemeMode='dark'
  root.style.colorScheme='dark'
  return 'dark'
}

export function setKfeThemeMode(_mode){
  try { localStorage.setItem(STORAGE_KEY, 'dark') } catch (_) {}
  return applyKfeTheme()
}

export function setKfeThemeSchedule(_schedule){
  return setKfeThemeMode('dark')
}

export function getKfeThemeSettings(){
  return {mode:'dark',resolved:'dark'}
}

export function startKfeThemeController(){
  applyKfeTheme()
  const onVisibility=()=>{if(document.visibilityState==='visible')applyKfeTheme()}
  const onStorage=event=>{if(event.key===STORAGE_KEY)applyKfeTheme()}
  document.addEventListener('visibilitychange',onVisibility)
  window.addEventListener('storage',onStorage)
  return ()=>{
    document.removeEventListener('visibilitychange',onVisibility)
    window.removeEventListener('storage',onStorage)
  }
}
