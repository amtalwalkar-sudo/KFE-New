#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { SWIPE_CONFIG } from '../src/domain/work/swipeConfig.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const css=fs.readFileSync(path.join(root,'src/styles/kfe-ui.css'),'utf8')
const java=fs.readFileSync(path.join(root,'android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java'),'utf8')
const view=fs.readFileSync(path.join(root,'src/views/WorkModuleView.vue'),'utf8')
const fail=m=>{throw new Error(m)}
const rgb=h=>{const s=h.replace('#','');return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]}
const same=(a,b)=>a.join(',')===b.join(',')
export function runNativeSwipeVisualParityAudit(){
  if(!view.includes('swipeConfig: SWIPE_CONFIG')||!view.includes("'--swipe-action-color': color"))fail('PWA swipe bar must consume shared SWIPE_CONFIG.')
  for(const marker of ['.trip-swipe.semantic-go','.trip-swipe.semantic-start','.trip-swipe.semantic-end'])if(!css.includes(marker))fail('Missing PWA semantic swipe selector: '+marker)
  const action=java.match(/private int actionColor\(\)\{([\s\S]*?)\n  \}/);if(!action)fail('Native actionColor() not found')
  const items=[{stage:'GO_TO_PICKUP',field:'swipePickupColor',color:SWIPE_CONFIG.pickupColor,returned:'return swipePickupColor'},{stage:'START_RIDE',field:'swipeStartColor',color:SWIPE_CONFIG.startColor,returned:'return swipeStartColor'},{stage:'END_RIDE',field:'swipeEndColor',color:SWIPE_CONFIG.endColor,returned:'return swipeEndColor'}]
  for(const item of items){const m=java.match(new RegExp(item.field+'=Color\\.rgb\\(([^)]*)\\)'));if(!m||!same(m[1].split(',').map(Number),rgb(item.color)))fail('Native '+item.stage+' default colour differs from shared SWIPE_CONFIG.');if(!action[1].includes(item.returned))fail('Native '+item.stage+' renderer is not bound to shared semantic colour.')}
  if(!java.includes('swipeCommitThresholdPercent/100f'))fail('Native swipe threshold must use shared SWIPE_CONFIG.')
  if(!java.includes('retractAnimator.setDuration(swipeReturnDurationMs)'))fail('Native swipe return animation must use shared SWIPE_CONFIG.')
  for(const key of ['swipeConfig.optInt("commitThresholdPercent",70)','swipeConfig.optInt("returnDurationMs",220)','swipeConfig.optString("pickupColor"','swipeConfig.optString("startColor"','swipeConfig.optString("endColor"'])if(!java.includes(key))fail('Native overlay does not apply shared setting: '+key)
  if(!view.includes('swipeProgress.value >= SWIPE_CONFIG.commitThresholdPercent'))fail('PWA commit threshold must use shared SWIPE_CONFIG.')
  if(!view.includes('SWIPE_CONFIG.returnDurationMs'))fail('PWA return animation must use shared SWIPE_CONFIG.')
  if(!view.includes('SWIPE_CONFIG.endColor')||!view.includes('SWIPE_CONFIG.startColor')||!view.includes('SWIPE_CONFIG.pickupColor'))fail('PWA semantic colors must use shared SWIPE_CONFIG.')
  if(!java.includes('thumbW=dp(58)')||!java.includes('barTop+dp(124)'))fail('Frozen native swipe mechanics missing.')
  return{status:'PASS',threshold:SWIPE_CONFIG.commitThresholdPercent,returnDurationMs:SWIPE_CONFIG.returnDurationMs,colors:{pickup:SWIPE_CONFIG.pickupColor,start:SWIPE_CONFIG.startColor,end:SWIPE_CONFIG.endColor}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){try{runNativeSwipeVisualParityAudit();console.log('NATIVE SWIPE VISUAL PARITY: PASS')}catch(error){console.error('NATIVE SWIPE VISUAL PARITY: FAIL — '+error.message);process.exitCode=1}}
