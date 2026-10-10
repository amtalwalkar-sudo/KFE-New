/**
 * KFE Universal Form & Input System
 * Presentation/input behavior only. No business rules or persistence.
 *
 * One shared keyboard/viewport contract is used by native forms and
 * form-like contextual surfaces (including Work). Business components
 * own values/validation/commit; this layer owns input ergonomics only.
 */
const SURFACE_SELECTOR = [
  'form',
  '[data-kfe-form-surface]',
  '.kfe-contextual-form',
  '.contextual-form',
  '.focus-surface',
  '.state-gate',
  '.work-context-form',
  '.universal-admin-form',
  '[role="dialog"]'
].join(', ');

function isEditableControl(el){
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function owner(el){
  return el?.closest(SURFACE_SELECTOR) || null;
}

function controls(surface){
  return [...surface.querySelectorAll('input,select,textarea')]
    .filter(el=>!el.disabled && el.type!=='hidden' && el.type!=='checkbox' && el.type!=='radio' && el.type!=='file');
}

function primaryAction(surface){
  return surface?.querySelector(
    'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled]), ' +
    'button.primary-action:not([disabled]), button.kfe-primary-action:not([disabled]), ' +
    'button.btn-submit:not([disabled]), button[data-kfe-submit]:not([disabled])'
  ) || null;
}

function applyInputHints(surface){
  const editable=controls(surface);
  for(const el of surface.querySelectorAll('input')){
    if(el.type==='number'){
      const integer=el.step==='' || el.step==='1';
      if(!el.inputMode) el.inputMode=integer?'numeric':'decimal';
    }
    if(!el.enterKeyHint && !['checkbox','radio','file','button','submit','reset'].includes(el.type)){
      const index=editable.indexOf(el);
      el.enterKeyHint=index>=0 && index<editable.length-1?'next':'done';
    }
    el.setAttribute('data-kfe-input','true');
  }
  for(const el of surface.querySelectorAll('select,textarea')){
    el.setAttribute('data-kfe-input','true');
  }
}

function tagSurface(surface){
  if(!surface) return;
  surface.dataset.kfeFormSurface='true';
  surface.classList.add('kfe-contextual-form');
  if(!surface.dataset.formType){
    if(surface.classList.contains('work-context-form')) surface.dataset.formType='operational';
    else if(surface.classList.contains('universal-admin-form')) surface.dataset.formType='operational';
    else if(surface.classList.contains('form-layout')) surface.dataset.formType='contextual';
  }
  applyInputHints(surface);
}

function tagTree(root=document){
  if(root.matches?.(SURFACE_SELECTOR)) tagSurface(root);
  root.querySelectorAll?.(SURFACE_SELECTOR).forEach(tagSurface);
}

let focusFrame = 0;
let focusTimers = [];
let focusGeneration = 0;

function cancelPendingFocusScroll(){
  focusGeneration += 1;
  if(focusFrame) cancelAnimationFrame(focusFrame);
  focusFrame = 0;
  for(const timer of focusTimers) clearTimeout(timer);
  focusTimers = [];
}

function ensureFocusedControlVisible(el){
  const surface=owner(el);
  if(!surface) return;
  cancelPendingFocusScroll();
  const generation = focusGeneration;
  const move=()=>{
    if(generation !== focusGeneration || document.activeElement !== el || !el.isConnected || owner(el) !== surface) return;
    const vv=window.visualViewport;
    const viewportTop=vv?.offsetTop ?? 0;
    const viewportBottom=(vv ? vv.height + vv.offsetTop : window.innerHeight);
    const nav=Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--kfe-nav-height')
    ) || 76;
    const keyboard=Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--kfe-keyboard-inset')
    ) || 0;
    const keyboardOpen = keyboard > 80 || document.documentElement.dataset.kfeKeyboard === 'open';
    const safeTop=viewportTop+8;
    // visualViewport already excludes the on-screen keyboard. Subtracting the
    // keyboard inset again double-counts it; the bottom nav is obscured while
    // the keyboard is open, so only reserve nav height when it is closed.
    const safeBottom=viewportBottom-(keyboardOpen?0:nav)-8;
    const rect=el.getBoundingClientRect();
    if(rect.top<safeTop || rect.bottom>safeBottom){
      el.scrollIntoView({block:'nearest',inline:'nearest',behavior:
        document.documentElement.dataset.kfeReducedMotion==='true'?'auto':'smooth'});
    }
  };
  focusFrame = requestAnimationFrame(() => { focusFrame = 0; move(); });
  focusTimers = [60,220].map(delay => setTimeout(move,delay));
}

function handleEnter(event){
  // Only Enter advances focus. Ordinary key presses must never steal focus during text entry.
  if(event.key!=='Enter') return;
  const el=event.target;
  if(!(el instanceof HTMLInputElement)) return;
  if(['checkbox','radio','file','button','submit','reset'].includes(el.type)) return;
  if(event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

  const surface=owner(el);
  if(!surface || surface.dataset.kfeEnterNavigation==='false') return;

  const editable=controls(surface);
  const index=editable.indexOf(el);
  if(index<0) return;

  event.preventDefault();
  const next=editable[index+1];
  if(next){
    next.focus({preventScroll:true});
    ensureFocusedControlVisible(next);
    return;
  }

  const action=primaryAction(surface);
  if(action) action.click();
  else if(surface.matches('form') && typeof surface.requestSubmit==='function') surface.requestSubmit();
}

function updateViewport(){
  const vv=window.visualViewport;
  const keyboard=vv ? Math.max(0,window.innerHeight-vv.height-vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--kfe-keyboard-inset',`${Math.round(keyboard)}px`);
  document.documentElement.dataset.kfeKeyboard=keyboard>80?'open':'closed';
}

function install(){
  if(window.__KFE_UNIVERSAL_FORM_SYSTEM_INSTALLED__) return
  window.__KFE_UNIVERSAL_FORM_SYSTEM_INSTALLED__=true
  tagTree(document);
  document.addEventListener('focusin',event=>{
    if(!isEditableControl(event.target)) return;
    const surface=owner(event.target);
    if(surface) tagSurface(surface);
    ensureFocusedControlVisible(event.target);
  },true);
  document.addEventListener('keydown',handleEnter,true);
  updateViewport();
  window.visualViewport?.addEventListener('resize',updateViewport);
  window.visualViewport?.addEventListener('scroll',updateViewport);
  window.addEventListener('resize',updateViewport,{passive:true});
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1) tagTree(node);
      }
    }
  })
  observer.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
