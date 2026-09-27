<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { MovementTraceService } from '../infrastructure/location/movementTraceService.js'
import { KfeRideNotificationService } from '../infrastructure/android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../infrastructure/android/kfeOverlay.js'

const store=useShiftTripStore(), fuel=useFuelStore()
const startOdo=ref(''), startOpen=ref(false), startAck=ref(false), gapChoice=ref(''), startBusy=ref(false)
const operator=ref(''), busy=ref(false), message=ref(''), error=ref('')
const fareTripId=ref(null), fare=ref(''), fareBusy=ref(false)
const cancelOpen=ref(false), cancelReason=ref(''), cancelFare=ref(''), cancelBusy=ref(false)
const fuelOpen=ref(false), fuelOdo=ref(''), fuelPrice=ref(''), fuelAmount=ref(''), fuelFull=ref(true), fuelBusy=ref(false)
const endOpen=ref(false), endStage=ref('CLOSE'), closingOdo=ref(''), shiftRevenue=ref(''), toll=ref(''), parking=ref(''), tollTreatment=ref('INCLUDED'), endBusy=ref(false)
const reviewRevenue=ref({}), reviewKm=ref({}), reviewOperator=ref({}), clock=ref(Date.now()), target=ref(null), targetAchieved=ref(0)
const swipe=ref({down:false,start:0,offset:0}), track=ref(null)
let timer=null, traceRunning=false

const money=v=>Number.isFinite(Number(v))?'₹'+Math.round(Number(v)).toLocaleString('en-IN'):'—'
const notify=t=>{message.value=t;error.value='';clearTimeout(notify.t);notify.t=setTimeout(()=>{if(message.value===t)message.value=''},2400)}
const fail=t=>{error.value=t;message.value=''}
// ODOMETER CHECK is the canonical Start Shift gate.
const gap= computed(()=>store.calculateGap(startOdo.value)), gapKm=computed(()=>Number(gap.value?.gapKm||0))
const targetValue=computed(()=>target.value?.target==null?null:Number(target.value.target))
const targetProgress=computed(()=>targetValue.value>0?Math.min(100,Math.round(targetAchieved.value/targetValue.value*100)):0)
const targetRemaining=computed(()=>targetValue.value==null?null:Math.max(0,targetValue.value-targetAchieved.value))
const ready=computed(()=>store.isTripActive&&store.trip?.tripStage==='PICKUP')
const goingPickup=computed(()=>store.isTripActive&&!ready.value&&!active.value)
const active=computed(()=>store.isTripActive&&store.trip?.tripStage==='RIDE_STARTED')
const pendingFare=computed(()=>fareTripId.value?store.completedTrips.find(t=>t.id===fareTripId.value):store.completedTrips.find(t=>t.status==='COMPLETED'&&(t.revenue===''||t.revenue==null)))
// ENTER FARE is the mandatory post-trip fare capture stage.
const missing=computed(()=>completed.value.filter(t=>reviewRevenue.value[t.id]===''||reviewRevenue.value[t.id]==null))
const completed=computed(()=>store.completedTrips.filter(t=>t.status==='COMPLETED'))
// RECONCILIATION is the canonical End Shift verification stage.
const preview=computed(()=>endOpen.value?WorkService.reconcileShiftRevenue({shiftRevenue:shiftRevenue.value,trips:completed.value.map(t=>({...t,revenue:reviewRevenue.value[t.id]??t.revenue,tripKm:reviewKm.value[t.id]??t.tripKm,operator:reviewOperator.value[t.id]??t.operator})),toll:toll.value,parking:parking.value,tollParkingRevenueTreatment:tollTreatment.value}):null)
const endReady=computed(()=>Boolean(closingOdo.value)&&shiftRevenue.value!==''&&preview.value?.reconciliationStatus!=='UNAVAILABLE'&&preview.value?.reconciliationStatus!=='MISMATCH')
// SHIFT TIME remains a persistent operational instrument.
const tripTimer=computed(()=>{if(!store.trip?.tripStartAt)return'00:00:00';const s=Math.max(0,Math.floor((clock.value-Date.parse(store.trip.tripStartAt))/1000));return`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`})
const fuelQty=computed(()=>fuel.calculateQuantity(fuelPrice.value,fuelAmount.value))
const shiftKm=computed(()=>Math.max(0,Number(closingOdo.value||store.lastKnownOdometer||store.startOdometer||0)-Number(store.startOdometer||0)))

async function targetRefresh(){try{const snapshot=await PerformanceService.getDailyTargetSnapshot();target.value=snapshot.target;targetAchieved.value=Number(snapshot.achieved||0)}catch(_){target.value=null;targetAchieved.value=0}}
async function syncSurfaces(){if(!store.isOnline){await AndroidOverlay.hide().catch(()=>{});return}await AndroidOverlay.update({shift:store.shift?{id:store.shift.id}:null,trip:store.trip?{id:store.trip.id,status:store.trip.status,tripStage:store.trip.tripStage}:null,target:targetValue.value==null?'—':money(targetValue.value),targetProgress:targetProgress.value,rides:String(store.completedTrips.length),overlayAction:active.value?'END_RIDE':ready.value?'START_RIDE':'GO_TO_PICKUP',overlayTripId:store.trip?.id||''}).catch(()=>{})}

function openStart(){fuelOpen.value=false;endOpen.value=false;startOpen.value=true;startOdo.value=store.lastKnownOdometer==null?'':String(store.lastKnownOdometer);startAck.value=false;gapChoice.value='';error.value='';message.value=''}
async function submitStart(){if(startBusy.value)return;if(!startOdo.value)return fail('Current odometer is required.');if(!startAck.value)return fail('Confirm the current odometer reading before continuing.');if(!gap.value.valid)return fail(gap.value.reason||'Enter a valid odometer.');if(gapKm.value&&!gapChoice.value)return fail('Choose Personal KM or Dead KM for the full odometer gap.');startBusy.value=true;const r=await store.startShift(startOdo.value,gapKm.value?{category:gapChoice.value}:null);startBusy.value=false;if(!r.ok)return fail(r.reason);startOdo.value='';startOpen.value=false;startAck.value=false;gapChoice.value='';await targetRefresh();await KfeRideNotificationService.goOnline().catch(()=>{});await AndroidOverlay.prepare().catch(()=>{});await syncSurfaces();notify('Online — shift started.')}

async function goPickup(){if(busy.value||!store.isOnline||store.isTripActive)return;busy.value=true;try{try{traceRunning=MovementTraceService.start({entityType:'SHIFT',entityId:store.shift?.id,eventType:'DEAD_MOVEMENT_TRACE',profile:'DEAD_LEG'})}catch(_){traceRunning=false}const r=await store.beginPickup(operator.value||store.defaultOperator);if(!r?.ok){if(traceRunning)MovementTraceService.reset();traceRunning=false;return fail(r?.reason||'Could not start pickup.')}await KfeRideNotificationService.beginPickup(`pickup-${Date.now()}`).catch(()=>{});await syncSurfaces();notify('Going to pickup.')}finally{busy.value=false}}
async function startTrip(){if(busy.value||!ready.value)return;busy.value=true;try{if(traceRunning){MovementTraceService.reset();traceRunning=false}const r=await store.startRide();if(!r.ok)return fail(r.reason);await KfeRideNotificationService.startRide().catch(()=>{});await syncSurfaces();notify('Trip active.')}finally{busy.value=false}}
async function endTrip(){if(busy.value||!active.value)return;busy.value=true;try{const id=store.trip.id;if(!await store.endTrip())return fail('Trip could not be completed.');await KfeRideNotificationService.completeRide().catch(()=>{});fareTripId.value=id;fare.value='';await syncSurfaces();notify('Trip completed — enter fare.')}finally{busy.value=false}}
async function saveFare(){if(fareBusy.value)return;if(!pendingFare.value)return;if(fare.value==='')return fail('Trip fare is required.');if(!Number.isFinite(Number(fare.value))||Number(fare.value)<0)return fail('Trip fare must be a non-negative number.');fareBusy.value=true;const r=await store.updateTrip({id:pendingFare.value.id,revenue:Number(fare.value)});fareBusy.value=false;if(!r.ok)return fail(r.reason);fareTripId.value=null;fare.value='';await targetRefresh();await syncSurfaces();notify('Fare saved.')}
function openCancel(){cancelOpen.value=true;cancelReason.value='';cancelFare.value='';error.value='';message.value=''}
async function saveCancel(){if(cancelBusy.value)return;if(!cancelReason.value.trim())return fail('Cancellation reason is required.');if(cancelFare.value!==''&&(!Number.isFinite(Number(cancelFare.value))||Number(cancelFare.value)<0))return fail('Cancellation fare must be a non-negative number.');cancelBusy.value=true;const r=await store.cancelTrip({reason:cancelReason.value.trim(),revenue:cancelFare.value});cancelBusy.value=false;if(!r?.ok)return fail(r?.reason||'Cancellation could not be saved.');cancelOpen.value=false;await syncSurfaces();notify('Trip cancelled.')}
function toggleFuel(){fuelOpen.value=!fuelOpen.value;if(fuelOpen.value){endOpen.value=false;fuelOdo.value='';fuelPrice.value='';fuelAmount.value='';fuelFull.value=true;error.value='';message.value=''}}
async function saveFuel(){if(fuelBusy.value)return;fuelBusy.value=true;const r=await WorkService.recordFuel({odometer:fuelOdo.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value,isFullTank:fuelFull.value});fuelBusy.value=false;if(!r.ok)return fail(r.reason);fuelOpen.value=false;notify('Fuel saved.')}
function seedReview(){const rev={},km={},op={};completed.value.forEach(t=>{rev[t.id]=t.revenue??'';km[t.id]=t.tripKm??'';op[t.id]=t.operator??store.defaultOperator});reviewRevenue.value=rev;reviewKm.value=km;reviewOperator.value=op}
function openEnd(){if(store.isTripActive)return fail('End the active Trip before going Offline.');fuelOpen.value=false;endOpen.value=true;endStage.value='CLOSE';closingOdo.value='';shiftRevenue.value='';toll.value='';parking.value='';tollTreatment.value='INCLUDED';seedReview();error.value='';message.value=''}
function cancelEnd(){endOpen.value=false;notify('Still Online — End Shift cancelled.')}
function closeShift(){if(!closingOdo.value)return fail('Closing odometer is required.');if(shiftRevenue.value==='')return fail('Total shift revenue is required.');const c=Number(closingOdo.value),s=Number(store.startOdometer);if(!Number.isFinite(c)||c<s)return fail(`Closing odometer must be at least ${s} km.`);if(!Number.isFinite(Number(shiftRevenue.value))||Number(shiftRevenue.value)<0)return fail('Total shift revenue must be non-negative.');seedReview();endStage.value='RECONCILE';error.value='';message.value=''}
function continueReconcile(){if(missing.value.length)return fail('Enter revenue for every listed completed trip.');if(preview.value?.reconciliationStatus==='MISMATCH'){endStage.value='MISMATCH';return}endStage.value='REVIEW'}
function checkMismatch(){if(preview.value?.reconciliationStatus==='MISMATCH')return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`);endStage.value='REVIEW'}
function reviewDone(){if(preview.value?.reconciliationStatus==='MISMATCH')return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`);endStage.value='CONFIRM'}
async function finishEnd(){if(endBusy.value)return;if(!endReady.value)return fail('Complete the required reconciliation before ending the shift.');endBusy.value=true;const trips=completed.value.map(t=>({id:t.id,operator:reviewOperator.value[t.id]??t.operator,tripKm:reviewKm.value[t.id]??t.tripKm??'',revenue:reviewRevenue.value[t.id]??t.revenue??''}));const r=await store.endShift({closingOdometer:closingOdo.value,revenue:shiftRevenue.value,toll:toll.value,parking:parking.value,tollParkingRevenueTreatment:tollTreatment.value,trips});endBusy.value=false;if(!r.ok)return fail(r.reason);endStage.value='ENDED';await targetRefresh();await KfeRideNotificationService.clear().catch(()=>{});notify('Shift ended.')}
function finishEnded(){endOpen.value=false;closingOdo.value='';shiftRevenue.value='';toll.value='';parking.value='';notify('Offline.')}
const actionLabel=computed(()=>active.value?'END TRIP':ready.value?'START TRIP':'GO TO PICKUP')
function doAction(){if(active.value)return endTrip();if(ready.value)return startTrip();return goPickup()}
const progress=computed(()=>{const w=track.value?.clientWidth||320;return Math.max(0,Math.min(100,(swipe.value.offset/Math.max(1,w-76))*100))})
function down(e){if(busy.value||!store.isOnline||endOpen.value||fuelOpen.value||cancelOpen.value||pendingFare.value)return;if(e.pointerType==='mouse'&&e.button!==0)return;if(!e.target.closest('.swipe-handle'))return;swipe.value={down:true,start:e.clientX,offset:0};e.currentTarget.setPointerCapture?.(e.pointerId)}
function move(e){if(!swipe.value.down)return;swipe.value.offset=Math.max(0,Math.min((track.value?.clientWidth||320)-76,e.clientX-swipe.value.start))}
async function up(){if(!swipe.value.down)return;const commit=progress.value>=70;swipe.value={down:false,start:0,offset:0};if(commit)await doAction()}
function keyAction(){if(!busy.value)doAction()}
function displayTime(v){const d=new Date(v);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`}
watch(()=>store.completedTrips.map(t=>t.id+':'+(t.revenue??'')).join('|'),()=>{if(!fareTripId.value&&pendingFare.value)fareTripId.value=pendingFare.value.id})
watch(()=>store.isOnline,()=>syncSurfaces())
onMounted(async()=>{await store.initialize();await targetRefresh();operator.value=store.defaultOperator;if(pendingFare.value)fareTripId.value=pendingFare.value.id;clock.value=Date.now();timer=setInterval(()=>clock.value=Date.now(),1000);await syncSurfaces()})
onBeforeUnmount(()=>{if(timer)clearInterval(timer);if(traceRunning)MovementTraceService.reset();AndroidOverlay.hide().catch(()=>{})})
</script>

<template>
<div class="work-canonical">
  <header class="work-header">
    <div class="identity">
      <span class="eyebrow">KFE WORK</span>
      <h1>Driver Cockpit</h1>
    </div>
    <div class="header-controls">
      <button class="icon-action" type="button" aria-label="CNG refuelling" title="CNG refuelling" @click="toggleFuel">⛽</button>
      <button class="shift-toggle" :class="{online:store.isOnline}" type="button" :aria-pressed="store.isOnline" @click="store.isOnline?openEnd():openStart()">
        <span>{{store.isOnline?'ONLINE':'OFFLINE'}}</span><i aria-hidden="true"/>
      </button>
    </div>
  </header>

  <main class="work-main">
    <!-- State gate: always occupies the same position below the shift control. -->
    <section v-if="!store.isOnline&&startOpen&&!fuelOpen&&!endOpen" class="state-gate">
      <div class="gate-head">
        <div><span class="eyebrow">START SHIFT</span><h2>Odometer check</h2></div>
        <button class="text-action" type="button" @click="startOdo='';startOpen=false;startAck=false;gapChoice=''">Back</button>
      </div>
      <label>Current odometer
        <div class="input-unit"><input v-model="startOdo" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off"><b>km</b></div>
      </label>
      <label class="check-row"><input v-model="startAck" type="checkbox"> <span>I confirm this is the current vehicle odometer.</span></label>
      <div v-if="gapKm>0" class="gap-panel">
        <div><span class="eyebrow">ODOMETER GAP</span><strong>{{gapKm}} km</strong><p>Classify the full gap.</p></div>
        <div class="choice-row">
          <button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="gapChoice='PERSONAL'">Personal KM</button>
          <button type="button" :class="{selected:gapChoice==='DEAD'}" @click="gapChoice='DEAD'">Dead KM</button>
        </div>
      </div>
      <button class="primary-action" :disabled="startBusy" @click="submitStart">{{startBusy?'STARTING…':'CONFIRM & GO ONLINE'}}</button>
    </section>

    <section v-if="endOpen" class="state-gate end-gate">
      <div class="gate-head">
        <div><span class="eyebrow">GOING OFFLINE</span><h2>{{endStage==='CLOSE'?'Close shift':endStage==='RECONCILE'?'Reconciliation':endStage==='MISMATCH'?'Revenue exception':endStage==='REVIEW'?'Shift review':endStage==='CONFIRM'?'Ready to end':'Shift ended'}}</h2></div>
        <button v-if="endStage==='CLOSE'" class="text-action" type="button" @click="cancelEnd">Back</button>
      </div>

      <template v-if="endStage==='CLOSE'">
        <div class="fact-line"><span>Shift started</span><strong>{{store.startOdometer}} km</strong></div>
        <label>Closing odometer
          <div class="input-unit"><input v-model="closingOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div>
        </label>
        <label>Total shift revenue
          <div class="input-unit"><b>₹</b><input v-model="shiftRevenue" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div>
        </label>
        <details class="optional-details">
          <summary>Optional business costs</summary>
          <label>Business toll
            <div class="input-unit"><b>₹</b><input v-model="toll" type="number" inputmode="numeric" min="0"></div>
          </label>
          <label>Business parking
            <div class="input-unit"><b>₹</b><input v-model="parking" type="number" inputmode="numeric" min="0"></div>
          </label>
          <label class="check-row"><input v-model="tollTreatment" true-value="EXCLUDED" false-value="INCLUDED" type="checkbox"><span>Exclude toll & parking from trip fare</span></label>
        </details>
        <button class="primary-action" @click="closeShift">CONTINUE</button>
      </template>

      <template v-else-if="endStage==='RECONCILE'">
        <div v-if="missing.length" class="exception-panel">
          <span class="eyebrow">ACTION REQUIRED</span><h3>Missing trip revenue</h3><p>Complete the listed fares before continuing.</p>
          <div v-for="t in missing" :key="t.id" class="reconcile-row">
            <div><strong>{{t.operator}}</strong><span>{{Number(t.tripKm||0).toFixed(1)}} km</span></div>
            <div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[t.id]" type="number" inputmode="numeric" min="0" @input="reviewRevenue={...reviewRevenue,[t.id]:$event.target.value}"></div>
          </div>
        </div>
        <div v-else class="success-panel"><strong>ALL REVENUE CAPTURED</strong><span>No missing trip revenue exceptions.</span></div>
        <div class="fact-grid"><div><span>Shift revenue</span><strong>{{money(shiftRevenue)}}</strong></div><div><span>Trip revenue</span><strong>{{money(preview?.tripRevenue)}}</strong></div></div>
        <button class="primary-action" @click="continueReconcile">CONTINUE</button>
      </template>

      <template v-else-if="endStage==='MISMATCH'">
        <div class="exception-panel">
          <span class="eyebrow">REVENUE EXCEPTION</span><h3>Shift total and trip fares differ</h3><p>Correct the entries before continuing.</p>
          <div class="fact-grid"><div><span>Trip fares</span><strong>{{money(preview?.tripRevenue)}}</strong></div><div><span>Difference</span><strong>{{money(Math.abs(preview?.difference||0))}}</strong></div></div>
        </div>
        <label>Correct total shift revenue
          <div class="input-unit"><b>₹</b><input v-model="shiftRevenue" type="number" inputmode="numeric" min="0"></div>
        </label>
        <div class="reconcile-list"><div v-for="t in completed" :key="t.id" class="reconcile-row"><div><strong>{{t.operator}}</strong><span>{{Number(t.tripKm||0).toFixed(1)}} km</span></div><div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[t.id]" type="number" inputmode="numeric" min="0" @input="reviewRevenue={...reviewRevenue,[t.id]:$event.target.value}"></div></div></div>
        <button class="primary-action" @click="checkMismatch">CHECK AGAIN</button>
      </template>

      <template v-else-if="endStage==='REVIEW'">
        <div class="fact-grid review">
          <div><span>Trips</span><strong>{{completed.length}}</strong></div>
          <div><span>Total shift KM</span><strong>{{shiftKm.toFixed(1)}}</strong></div>
          <div><span>Trip KM</span><strong>{{completed.reduce((s,t)=>s+Number(reviewKm[t.id]??t.tripKm??0),0).toFixed(1)}}</strong></div>
          <div><span>Dead KM</span><strong>{{Math.max(0,shiftKm-completed.reduce((s,t)=>s+Number(reviewKm[t.id]??t.tripKm??0),0)).toFixed(1)}}</strong></div>
          <div><span>Revenue</span><strong>{{money(shiftRevenue)}}</strong></div>
          <div><span>Toll / parking</span><strong>{{money(toll||0)}} / {{money(parking||0)}}</strong></div>
        </div>
        <p class="supporting">Trip KM corrections are optional. Review and confirm the shift summary.</p>
        <button class="primary-action" @click="reviewDone">REVIEW COMPLETE</button>
      </template>

      <template v-else-if="endStage==='CONFIRM'">
        <div class="completion-panel"><span class="eyebrow">SHIFT REVIEW</span><strong>READY TO END</strong><p>{{completed.length}} completed trips · {{shiftKm.toFixed(1)}} km · {{money(shiftRevenue)}} revenue.</p></div>
        <button class="primary-action" :disabled="endBusy" @click="finishEnd">{{endBusy?'ENDING SHIFT…':'OK — END SHIFT'}}</button>
      </template>

      <template v-else>
        <div class="completion-panel success"><span class="completion-mark" aria-hidden="true">✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div>
        <button class="primary-action" @click="finishEnded">OK</button>
      </template>
    </section>

    <section v-if="!store.isOnline&&!startOdo&&!fuelOpen&&!endOpen" class="offline-state">
      <div class="state-mark" aria-hidden="true">○</div>
      <span class="eyebrow">CURRENT STATE</span>
      <strong>OFFLINE</strong>
      <p>Shift is not active.</p>
      <button class="primary-action" @click="openStart">START SHIFT</button>
    </section>

    <template v-if="store.isOnline&&!fuelOpen&&!endOpen">
      <section class="instrument target-instrument">
        <div><span class="eyebrow">TODAY'S TARGET</span><strong>{{targetValue==null?'—':money(targetValue)}}</strong></div>
        <div class="target-meta"><span>{{targetValue==null?'—':money(targetAchieved)}} achieved</span><span>{{targetProgress}}%</span></div>
        <div class="progress-track"><i :style="{width:targetProgress+'%'}"/></div>
        <span class="target-remaining">{{targetRemaining==null?'—':money(targetRemaining)}} remaining</span>
      </section>

      <section class="instrument time-instrument">
        <span class="eyebrow">{{active?'TRIP ACTIVE · TIME':'SHIFT TIME'}}</span>
        <strong>{{active?tripTimer:displayTime(store.shift?.startAt||Date.now())}}</strong>
      </section>

      <section v-if="!store.isTripActive" class="operational-state">
        <span class="eyebrow">ONLINE · IDLE</span>
        <strong>READY FOR NEXT PICKUP</strong>
        <p>Select the operator, then begin the next pickup.</p>
        <label>Operator<select v-model="operator"><option v-for="o in store.operators" :key="o">{{o}}</option></select></label>
      </section>

      <section v-else-if="goingPickup" class="operational-state">
        <span class="eyebrow">GOING TO PICKUP</span>
        <strong>{{store.trip?.operator||'TRIP'}}</strong>
        <p>Pickup movement is active. GPS and movement tracing continue in the background.</p>
        <div class="context-line"><span>GPS</span><strong>{{store.trip?.tripStartLocation?.placeName||'ACTIVE'}}</strong></div>
      </section>

      <section v-else-if="ready" class="operational-state">
        <span class="eyebrow">READY FOR TRIP</span>
        <strong>PICKUP REACHED</strong>
        <p>Start the trip or cancel it.</p>
        <button class="secondary-action" type="button" @click="openCancel">CANCEL TRIP</button>
      </section>

      <section v-else class="operational-state active-state">
        <span class="eyebrow">TRIP ACTIVE</span>
        <strong>{{store.trip?.operator||'TRIP'}}</strong>
        <div class="active-metrics">
          <div><span>TIME</span><strong>{{tripTimer}}</strong></div>
          <div><span>TRIP KM</span><strong>{{Number(store.trip?.tripKm||0).toFixed(1)}} km</strong></div>
          <div><span>GPS</span><strong>{{store.trip?.tripStartLocation?.placeName||'ACTIVE'}}</strong></div>
        </div>
      </section>

      <section class="action-instrument">
        <div><span class="eyebrow">PRIMARY ACTION</span><strong>{{actionLabel}}</strong><p>{{active?'End the active trip when the ride is complete.':ready?'Release at the threshold to start the trip.':'Begin the next pickup.'}}</p></div>
        <div ref="track" class="swipe trip-swipe" :class="{threshold:progress>=70,committing:busy}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="swipe-copy"><span>{{progress>=70?'RELEASE TO':'SWIPE TO'}}</span><strong>{{actionLabel}}</strong></div>
          <button class="swipe-handle" type="button" :aria-label="actionLabel" @pointerup.stop="keyAction" @click.stop="keyAction">→</button>
        </div>
        <span class="swipe-hint">{{progress>=70?'Release to continue':'Drag the handle right. Tap the handle for the accessible alternative.'}}</span>
      </section>
    </template>

    <section v-if="pendingFare&&!endOpen" class="focus-surface">
      <div class="focus-head"><div><span class="eyebrow">FARE ENTRY</span><strong>TRIP COMPLETED</strong></div></div>
      <div class="fact-grid two"><div><span>Operator</span><strong>{{pendingFare.operator}}</strong></div><div><span>Trip KM</span><strong>{{Number(pendingFare.tripKm||0).toFixed(1)}} km</strong></div></div>
      <label>Trip fare
        <div class="input-unit"><b>₹</b><input v-model="fare" type="number" inputmode="numeric" enterkeyhint="done" min="0" autofocus></div>
      </label>
      <button class="primary-action" :disabled="fareBusy" @click="saveFare">{{fareBusy?'SAVING…':'OK — SAVE FARE'}}</button>
    </section>

    <section v-if="cancelOpen" class="focus-surface">
      <div class="gate-head"><div><span class="eyebrow">CANCELLATION</span><strong>CAPTURE CANCELLATION</strong></div><button class="text-action" type="button" @click="cancelOpen=false">Back</button></div>
      <label>Cancellation reason<input v-model="cancelReason" type="text" enterkeyhint="next"></label>
      <label>Cancellation fare <span class="optional-label">optional where applicable</span>
        <div class="input-unit"><b>₹</b><input v-model="cancelFare" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div>
      </label>
      <button class="primary-action" :disabled="cancelBusy" @click="saveCancel">{{cancelBusy?'SAVING…':'OK — CONFIRM CANCELLATION'}}</button>
    </section>

    <section v-if="fuelOpen" class="focus-surface">
      <div class="gate-head"><div><span class="eyebrow">FUEL</span><strong>CNG REFUEL</strong></div><button class="text-action" type="button" @click="toggleFuel">Close</button></div>
      <label>Odometer<div class="input-unit"><input v-model="fuelOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div></label>
      <label>Price / kg<div class="input-unit"><b>₹</b><input v-model="fuelPrice" type="number" inputmode="decimal" enterkeyhint="next" min="0" step=".01"></div></label>
      <label>Amount<div class="input-unit"><b>₹</b><input v-model="fuelAmount" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <div class="calculated-value"><span>Quantity</span><strong>{{fuelQty.valid?fuelQty.quantityKg.toFixed(2)+' kg':'—'}}</strong></div>
      <label class="check-row"><input v-model="fuelFull" type="checkbox"><span>Full tank</span></label>
      <button class="primary-action" :disabled="fuelBusy" @click="saveFuel">{{fuelBusy?'SAVING…':'OK — SAVE FUEL'}}</button>
    </section>

    <p v-if="error" class="feedback error" role="alert">{{error}}</p>
    <p v-if="message" class="feedback success" role="status">{{message}}</p>
  </main>
</div>
</template>

