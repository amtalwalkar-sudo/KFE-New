/**
 * KFE Universal Form & Input System
 * Presentation/input behavior only. No business rules or persistence.
 */
const OPERATIONAL_FORM_TYPES=new Set(['compact','operational','fuel','fare','cancellation','shift','confirmation','trip','search']);

function isEditableControl(el){
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
function controls(form){
  return [...form.querySelectorAll('input,select,textarea,button[type="submit"]')]
    .filter(el=>!el.disabled && el.type!=='hidden');
}
function applyInputHints(form){
  for(const el of form.querySelectorAll('input')){
    if(el.type==='number'){
      const integer=el.step==='' || el.step==='1';
      if(!el.inputMode) el.inputMode=integer?'numeric':'decimal';
    }
    if(!el.enterKeyHint && el.type!=='checkbox' && el.type!=='radio' && el.type!=='file'){
      const editable=controls(form).filter(isEditableControl);
      const index=editable.indexOf(el);
      el.enterKeyHint=index>=0 && index<editable.length-1?'next':'done';
    }
    el.setAttribute('data-kfe-input','true');
  }
}
function tagForm(form){
  if(form.dataset.kfeUniversalForm==='true') return;
  form.dataset.kfeUniversalForm='true';
  form.classList.add('kfe-contextual-form');
  if(!form.dataset.formType && form.classList.contains('form-layout')) form.dataset.formType='contextual';
  applyInputHints(form);
}
function ensureFocusedControlVisible(el){
  const form=el.closest('form');
  if(!form) return;
  requestAnimationFrame(()=>{
    const vv=window.visualViewport;
    const bottom=vv ? vv.height + vv.offsetTop : window.innerHeight;
    const rect=el.getBoundingClientRect();
    const reserved=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kfe-nav-height'))||76;
    const safeBottom=bottom-reserved-8;
    const safeTop=(vv?.offsetTop||0)+8;
    if(rect.bottom>safeBottom || rect.top<safeTop){
      el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
    }
  });
}
function handleEnter(event){
  const el=event.target;
  if(!(el instanceof HTMLInputElement) || ['checkbox','radio','file','button','submit','reset'].includes(el.type)) return;
  if(event.isComposing || event.shiftKey) return;
  const form=el.closest('form');
  if(!form || form.dataset.kfeEnterNavigation==='false') return;
  const editable=controls(form).filter(isEditableControl);
  const index=editable.indexOf(el);
  if(index<0) return;
  event.preventDefault();
  const next=editable[index+1];
  if(next){
    next.focus({preventScroll:true});
    ensureFocusedControlVisible(next);
  }else{
    const submit=form.querySelector('button[type="submit"],input[type="submit"]');
    if(submit && !submit.disabled) submit.click();
    else if(typeof form.requestSubmit==='function') form.requestSubmit();
  }
}
function updateViewport(){
  const vv=window.visualViewport;
  const keyboard=vv ? Math.max(0,window.innerHeight-vv.height-vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--kfe-keyboard-inset',`${Math.round(keyboard)}px`);
  document.documentElement.dataset.kfeKeyboard=keyboard>80?'open':'closed';
}
function install(){
  document.querySelectorAll('form').forEach(tagForm);
  document.addEventListener('focusin',event=>{
    if(isEditableControl(event.target)){
      tagForm(event.target.closest('form'));
      ensureFocusedControlVisible(event.target);
    }
  },true);
  document.addEventListener('keydown',handleEnter,true);
  updateViewport();
  window.visualViewport?.addEventListener('resize',updateViewport);
  window.visualViewport?.addEventListener('scroll',updateViewport);
  window.addEventListener('resize',updateViewport,{passive:true});
  new MutationObserver(records=>{
    for(const record of records) for(const node of record.addedNodes){
      if(node.nodeType!==1) continue;
      if(node.matches?.('form')) tagForm(node);
      node.querySelectorAll?.('form').forEach(tagForm);
    }
  }).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
