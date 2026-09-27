<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { DriverTargetService } from '../application/performance/driverTargetService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { MovementTraceService } from '../infrastructure/location/movementTraceService.js'
import { KfeRideNotificationService } from '../infrastructure/android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../infrastructure/android/kfeOverlay.js'

const store=useShiftTripStore(), fuel=useFuelStore()
const startOdo=ref(''), startAck=ref(false), gapChoice=ref(''), startBusy=ref(false), startOpen=ref(false)
const operator=ref(''), busy=ref(false), message=ref(''), error=ref('')
const fareTripId=ref(null), fareTrip=ref(null), fare=ref(''), fareBusy=ref(false)
const cancelOpen=ref(false), cancelReason=ref(''), cancelFare=ref(''), cancelBusy=ref(false)
const fuelOpen=ref(false), fuelOdo=ref(''), fuelPrice=ref(''), fuelAmount=ref(''), fuelFull=ref(true), fuelBusy=ref(false)
const endOpen=ref(false), endStage=ref('CLOSE'), closingOdo=ref(''), shiftRevenue=ref(''), toll=ref(''), parking=ref(''), tollTreatment=ref('INCLUDED'), endBusy=ref(false)
const reviewRevenue=ref({}), reviewKm=ref({}), reviewOperator=ref({}), movementPreview=ref(null), clock=ref(Date.now()), target=ref(null), targetAchieved=ref(0)
const swipe=ref({down:false,start:0,offset:0}), track=ref(null)
let timer=null, traceRunning=false

const money=v=>Number.isFinite(Number(v))?'₹'+Math.round(Number(v)).toLocaleString('en-IN'):'—'
const notify=t=>{message.value=t;error.value='';clearTimeout(notify.t);notify.t=setTimeout(()=>{if(message.value===t)message.value=''},2400)}
const fail=t=>{error.value=t;message.value=''}
const gap= computed(()=>store.calculateGap(startOdo.value)), gapKm=computed(()=>Number(gap.value?.gapKm||0))
const targetValue=computed(()=>target.value?.target==null?null:Number(target.value.target))
const targetProgress=computed(()=>targetValue.value>0?Math.min(100,Math.round(targetAchieved.value/targetValue.value*100)):0)
const targetRemaining=computed(()=>targetValue.value==null?null:Math.max(0,targetValue.value-targetAchieved.value))
const ready=computed(()=>store.isTripActive&&store.trip?.tripStage==='PICKUP')
const active=computed(()=>store.isTripActive&&store.trip?.tripStage==='RIDE_STARTED')
const pendingFare=computed(()=>fareTrip.value||store.pendingFareTrip)
const missing=computed(()=>store.completedTrips.filter(t=>t.status==='COMPLETED'&&(t.revenue===''||t.revenue==null)))
const completed=computed(()=>store.completedTrips.filter(t=>t.status==='COMPLETED'))
const preview=computed(()=>endOpen.value?WorkService.reconcileShiftRevenue({shiftRevenue:shiftRevenue.value,trips:completed.value.map(t=>({...t,revenue:reviewRevenue.value[t.id]??t.revenue,tripKm:reviewKm.value[t.id]??t.tripKm,operator:reviewOperator.value[t.id]??t.operator})),toll:toll.value,parking:parking.value,tollParkingRevenueTreatment:tollTreatment.value}):null)
const endReady=computed(()=>Boolean(closingOdo.value)&&shiftRevenue.value!==''&&preview.value?.reconciliationStatus!=='UNAVAILABLE'&&preview.value?.reconciliationStatus!=='MISMATCH')
const tripTimer=computed(()=>{if(!store.trip?.tripStartAt)return'00:00:00';const s=Math.max(0,Math.floor((clock.value-Date.parse(store.trip.tripStartAt))/1000));return`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`})
const shiftTimer=computed(()=>{if(!store.shift?.startAt)return'00:00:00';const s=Math.max(0,Math.floor((clock.value-Date.parse(store.shift.startAt))/1000));return`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`})
const fuelQty=computed(()=>fuel.calculateQuantity(fuelPrice.value,fuelAmount.value))
const shiftKm=computed(()=>Math.max(0,Number(closingOdo.value||store.lastKnownOdometer||store.startOdometer||0)-Number(store.startOdometer||0)))

async function targetRefresh(){try{const snapshot=await PerformanceService.getDailyTargetSnapshot();target.value=snapshot.target;const trips=store.shift?.id?await WorkService.getTripsForShift(store.shift.id):[];targetAchieved.value=trips.filter(t=>t.status==='COMPLETED'&&Number.isFinite(Number(t.revenue))).reduce((sum,t)=>sum+Number(t.revenue),0)}catch(_){target.value=null;targetAchieved.value=0}}
async function syncSurfaces(){if(!store.isOnline){await AndroidOverlay.hide().catch(()=>{});return}const action=pendingFare.value?'ENTER_FARE':active.value?'END_RIDE':ready.value?'START_RIDE':'GO_TO_PICKUP';await AndroidOverlay.update({shift:store.shift?{id:store.shift.id}:null,trip:store.trip?{id:store.trip.id,status:store.trip.status,tripStage:store.trip.tripStage}:null,target:targetValue.value==null?'—':money(targetValue.value),targetProgress:targetProgress.value,rides:String(store.completedTrips.length),overlayAction:action,overlayTripId:pendingFare.value?.id||store.trip?.id||''}).catch(()=>{})}

function openStart(){fuelOpen.value=false;endOpen.value=false;startOpen.value=true;startOdo.value=store.lastKnownOdometer!=null?String(store.lastKnownOdometer):store.businessStartBaseline?.businessStartOdometer!=null?String(store.businessStartBaseline.businessStartOdometer):'';startAck.value=false;gapChoice.value='';error.value='';message.value=''}
async function submitStart(){if(startBusy.value)return;if(!startOdo.value)return fail('Current odometer is required.');if(!startAck.value)return fail('Confirm the current odometer reading before continuing.');if(!gap.value.valid)return fail(gap.value.reason||'Enter a valid odometer.');if(gapKm.value&&!gapChoice.value)return fail('Choose Personal KM or Dead KM for the full gap.');startBusy.value=true;try{const r=await store.startShift(startOdo.value,gapKm.value?{category:gapChoice.value}:null);if(!r?.ok)return fail(r.reason||'Could not start shift.');startOdo.value='';startAck.value=false;gapChoice.value='';startOpen.value=false;await targetRefresh();await KfeRideNotificationService.goOnline().catch(()=>{});await AndroidOverlay.prepare().catch(()=>{});await syncSurfaces();notify('Online — shift started.')}catch(e){fail(e?.message||'Could not start shift.')}finally{startBusy.value=false}}

async function goPickup(){if(busy.value||!store.isOnline||store.isTripActive)return;busy.value=true;try{try{traceRunning=MovementTraceService.start({entityType:'SHIFT',entityId:store.shift?.id,eventType:'DEAD_MOVEMENT_TRACE',profile:'DEAD_LEG'})}catch(_){traceRunning=false}const r=await store.beginPickup(operator.value||store.defaultOperator);if(!r?.ok){if(traceRunning)MovementTraceService.reset();traceRunning=false;return fail(r?.reason||'Could not start pickup.')}await KfeRideNotificationService.beginPickup(r.trip?.id || '').catch(()=>{});await syncSurfaces();notify('Going to pickup.')}finally{busy.value=false}}
async function startTrip(){if(busy.value||!ready.value)return;busy.value=true;try{if(traceRunning){void MovementTraceService.stop({captureFinal:false}).catch(()=>{});traceRunning=false}const r=await store.startRide();if(!r.ok)return fail(r.reason);await KfeRideNotificationService.startRide(store.trip?.id).catch(()=>{});await syncSurfaces();notify('Trip active.')}finally{busy.value=false}}
async function endTrip(){if(busy.value||!active.value)return;busy.value=true;try{const id=store.trip.id;if(!await store.endTrip())return fail('Trip could not be completed.');await KfeRideNotificationService.completeRide().catch(()=>{});fareTripId.value=id;fareTrip.value=null;fare.value='';await targetRefresh();await syncSurfaces();notify('Trip completed — enter fare.')}finally{busy.value=false}}
async function saveFare(){if(fareBusy.value)return;if(!pendingFare.value)return;if(fare.value==='')return fail('Trip fare is required.');if(!Number.isFinite(Number(fare.value))||Number(fare.value)<0)return fail('Trip fare must be a non-negative number.');fareBusy.value=true;const r=await store.updateTrip({id:pendingFare.value.id,revenue:Number(fare.value)});fareBusy.value=false;if(!r.ok)return fail(r.reason);fareTripId.value=null;fareTrip.value=null;fare.value='';await KfeRideNotificationService.clear().catch(()=>{});await targetRefresh();await syncSurfaces();notify('Fare saved.')}
function openCancel(){if(pendingFare.value)return fail('Enter the previous Trip fare before starting another Trip.');cancelOpen.value=true;cancelReason.value='';cancelFare.value='';error.value='';message.value=''}
async function saveCancel(){if(cancelBusy.value)return;if(!cancelReason.value.trim())return fail('Cancellation reason is required.');if(cancelFare.value!==''&&(!Number.isFinite(Number(cancelFare.value))||Number(cancelFare.value)<0))return fail('Cancellation fare must be a non-negative number.');const tripId=store.trip?.id;cancelBusy.value=true;const r=await store.cancelTrip({reason:cancelReason.value.trim(),revenue:cancelFare.value});cancelBusy.value=false;if(!r?.ok)return fail(r?.reason||'Cancellation could not be saved.');cancelOpen.value=false;await KfeRideNotificationService.clear().catch(()=>{});KfeRideNotificationService.recordCancellation(tripId, cancelFare.value);await syncSurfaces();notify('Trip cancelled.')}
function toggleFuel(){if(!fuelOpen.value&&pendingFare.value)return fail('Enter the completed Trip fare before opening Fuel.');fuelOpen.value=!fuelOpen.value;if(fuelOpen.value){endOpen.value=false;fuelOdo.value='';fuelPrice.value='';fuelAmount.value='';fuelFull.value=true;error.value='';message.value=''}}
async function saveFuel(){if(fuelBusy.value)return;fuelBusy.value=true;const r=await WorkService.recordFuel({odometer:fuelOdo.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value,isFullTank:fuelFull.value});fuelBusy.value=false;if(!r.ok)return fail(r.reason);fuelOpen.value=false;notify('Fuel saved.')}
function seedReview(){const rev={},km={},op={};completed.value.forEach(t=>{rev[t.id]=t.revenue??'';km[t.id]=t.tripKm??'';op[t.id]=t.operator??store.defaultOperator});reviewRevenue.value=rev;reviewKm.value=km;reviewOperator.value=op}
function openEnd(){if(pendingFare.value)return fail('Enter the completed Trip fare before going Offline.');if(store.isTripActive)return fail('End the active Trip before going Offline.');fuelOpen.value=false;endOpen.value=true;endStage.value='CLOSE';closingOdo.value='';shiftRevenue.value='';toll.value='';parking.value='';tollTreatment.value='INCLUDED';seedReview();error.value='';message.value=''}
function cancelEnd(){endOpen.value=false;notify('Still Online — End Shift cancelled.')}
async function refreshMovementPreview(){if(!store.shift?.id||!closingOdo.value)return;movementPreview.value=await WorkService.previewMovementReconciliation({shiftId:store.shift.id,closingOdometer:closingOdo.value,trips:completed.value.map(t=>({...t,tripKm:reviewKm.value[t.id]??t.tripKm}))})}
async function closeShift(){if(!closingOdo.value)return fail('Closing odometer is required.');if(shiftRevenue.value==='')return fail('Total shift revenue is required.');const c=Number(closingOdo.value),s=Number(store.startOdometer);if(!Number.isFinite(c)||c<s)return fail(`Closing odometer must be at least ${s} km.`);if(!Number.isFinite(Number(shiftRevenue.value))||Number(shiftRevenue.value)<0)return fail('Total shift revenue must be non-negative.');seedReview();await refreshMovementPreview();if(movementPreview.value?.reconciliationStatus==='UNAVAILABLE')return fail(`Movement reconciliation unavailable: ${movementPreview.value.reason||'try again'}.`);endStage.value='RECONCILE';error.value='';message.value=''}
function continueReconcile(){if(missing.value.length)return fail('Enter revenue for every listed completed trip.');if(preview.value?.reconciliationStatus==='MISMATCH'){endStage.value='MISMATCH';return}endStage.value='REVIEW'}
function checkMismatch(){if(preview.value?.reconciliationStatus==='MISMATCH')return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`);endStage.value='REVIEW'}
function reviewDone(){if(preview.value?.reconciliationStatus==='MISMATCH')return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`);if(movementPreview.value?.reconciliationStatus!=='RECONCILED')return fail(`Movement reconciliation is ${movementPreview.value?.reconciliationStatus||'not ready'}.`);endStage.value='CONFIRM'}
async function finishEnd(){if(endBusy.value)return;if(!endReady.value)return fail('Complete the required reconciliation before ending the shift.');endBusy.value=true;const trips=completed.value.map(t=>({id:t.id,operator:reviewOperator.value[t.id]??t.operator,tripKm:reviewKm.value[t.id]??t.tripKm??'',revenue:reviewRevenue.value[t.id]??t.revenue??''}));const r=await store.endShift({closingOdometer:closingOdo.value,revenue:shiftRevenue.value,toll:toll.value,parking:parking.value,tollParkingRevenueTreatment:tollTreatment.value,trips});endBusy.value=false;if(!r.ok)return fail(r.reason);endStage.value='ENDED';await targetRefresh();await KfeRideNotificationService.clear().catch(()=>{});notify('Shift ended.')}
function finishEnded(){endOpen.value=false;closingOdo.value='';shiftRevenue.value='';toll.value='';parking.value='';notify('Offline.')}
const actionLabel=computed(()=>active.value?'END TRIP':ready.value?'START TRIP':'GO TO PICKUP')
const swipeToneClass=computed(()=>active.value?'swipe-danger':ready.value?'swipe-success':'swipe-info')
function doAction(){if(active.value)return endTrip();if(ready.value)return startTrip();return goPickup()}
const progress=computed(()=>{const w=track.value?.clientWidth||320;return Math.max(0,Math.min(100,(swipe.value.offset/Math.max(1,w-76))*100))})
function down(e){if(busy.value||!store.isOnline||endOpen.value||fuelOpen.value||cancelOpen.value||pendingFare.value)return;if(e.pointerType==='mouse'&&e.button!==0)return;if(!e.target.closest('.swipe-handle'))return;swipe.value={down:true,start:e.clientX,offset:0};e.currentTarget.setPointerCapture?.(e.pointerId)}
function move(e){if(!swipe.value.down)return;swipe.value.offset=Math.max(0,Math.min((track.value?.clientWidth||320)-76,e.clientX-swipe.value.start))}
async function up(){if(!swipe.value.down)return;const commit=progress.value>=70;swipe.value={down:false,start:0,offset:0};if(commit){try{await doAction()}finally{swipe.value={down:false,start:0,offset:0}}}}
function keyAction(){if(!busy.value)doAction()}
function displayTime(v){const d=new Date(v);return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`}
watch(()=>store.isOnline,()=>syncSurfaces()); watch(()=>store.pendingFareTrip?.id, id=>{if(id){fareTripId.value=id;fareTrip.value=null}}); watch(()=>fareTripId.value, id=>{if(id&&!fareTrip.value){fareTrip.value=store.completedTrips.find(t=>t.id===id)||null}})
onMounted(async()=>{await store.initialize();await targetRefresh();operator.value=store.defaultOperator;if(pendingFare.value)fareTripId.value=pendingFare.value.id;fareTrip.value=null;clock.value=Date.now();timer=setInterval(()=>clock.value=Date.now(),1000);await syncSurfaces()})
onBeforeUnmount(()=>{if(timer)clearInterval(timer);if(traceRunning)MovementTraceService.reset();AndroidOverlay.hide().catch(()=>{})})
</script>

<template>
<div class="work-cockpit premium-work">
  <header class="work-head" aria-label="Work controls">
    <div class="head-actions">
      <button class="icon fuel-trigger" type="button" aria-label="CNG refuelling" title="CNG refuelling" @click="toggleFuel">⛽</button>
      <button class="toggle" :class="{on:store.isOnline}" type="button" :aria-pressed="store.isOnline" @click="store.isOnline?openEnd():openStart()">
        <span>{{store.isOnline?'ONLINE':'OFFLINE'}}</span><i/>
      </button>
    </div>
  </header>

  <main class="cockpit">
    <section v-if="!store.isOnline&&!startOpen&&!fuelOpen&&!endOpen" class="offline-stage">
      <div class="state-line">
        <div><small>CURRENT STATE</small><strong>OFFLINE</strong></div>
        <span class="status-dot" aria-hidden="true"/>
      </div>
      <button class="primary hero-action" @click="openStart">GO ONLINE</button>
    </section>

    <section v-if="!store.isOnline&&startOpen&&!fuelOpen&&!endOpen" class="surface gate-surface">
      <div class="surface-head">
        <div><small>START SHIFT</small><h2>ODOMETER CHECK</h2></div>
        <button class="quiet" type="button" @click="startOpen=false;startOdo='';startAck=false;gapChoice=''">Back</button>
      </div>
      <label>Current odometer<div class="unit"><input v-model="startOdo" type="number" inputmode="numeric" enterkeyhint="done" min="0"><b>km</b></div></label>
      <label class="check"><input v-model="startAck" type="checkbox"> Confirm current vehicle odometer</label>
      <div v-if="gapKm>0" class="gap">
        <div class="gap-head"><small>ODOMETER GAP</small><strong>{{gapKm}} km</strong></div>
        <p>Classify the full gap.</p>
        <div class="choice-grid">
          <button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="gapChoice='PERSONAL'"><span>Personal KM</span><i>Whole gap</i></button>
          <button type="button" :class="{selected:gapChoice==='DEAD'}" @click="gapChoice='DEAD'"><span>Dead KM</span><i>Whole gap</i></button>
        </div>
      </div>
      <button class="primary" :disabled="startBusy" @click="submitStart">{{startBusy?'STARTING…':'CONFIRM & GO ONLINE'}}</button>
    </section>

    <template v-if="store.isOnline&&!fuelOpen&&!endOpen&&!pendingFare">
      <section class="instrument target-instrument">
        <div class="instrument-top"><small>TODAY'S TARGET</small><strong>{{targetValue==null?'—':money(targetValue)}}</strong></div>
        <div class="target-track"><i :style="{width:targetProgress+'%'}"/></div>
        <div class="target-meta"><span>{{targetAchieved?money(targetAchieved)+' achieved':'No revenue recorded yet'}}</span><b>{{targetProgress}}%</b><span>{{targetRemaining==null?'—':money(targetRemaining)+' remaining'}}</span></div>
      </section>

      <section class="instrument timer-instrument">
        <div><small>{{active?'TRIP TIME':'SHIFT TIME'}}</small><strong>{{active?tripTimer:shiftTimer}}</strong></div>
        <span class="live-mark" aria-hidden="true"/>
      </section>

      <section v-if="ready" class="trip-setup">
        <label>Operator
          <select v-model="operator">
            <option v-for="o in store.operators" :key="o">{{o}}</option>
          </select>
        </label>
        <button class="secondary cancel-action" type="button" @click="openCancel">CANCEL TRIP</button>
      </section>

      <div ref="track" class="swipe" :class="[swipeToneClass,{threshold:progress>=70,committing:busy}]" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="swipe={down:false,start:0,offset:0}">
        <div class="swipe-copy">
          <small>{{progress>=70?'RELEASE TO':''}}</small>
          <strong>{{actionLabel}}</strong>
        </div>
        <button class="swipe-handle" type="button" :aria-label="actionLabel" @click.stop="keyAction" :style="{transform:`translateX(${swipe.offset}px)`}">→</button>
      </div>
      <small class="swipe-hint">{{progress>=70?'RELEASE TO '+actionLabel:'GRAB HANDLE  ·  DRAG RIGHT  ·  RELEASE'}}</small>
    </template>

    <section v-if="pendingFare" class="surface overlay mandatory-fare">
      <div class="surface-head"><div><small>TRIP COMPLETED</small><h2>ENTER FARE</h2></div></div>
      <div class="summary"><span>Operator</span><strong>{{pendingFare.operator}}</strong><span>Trip KM</span><strong>{{Number(pendingFare.tripKm||0).toFixed(1)}} km</strong></div>
      <label>Trip fare<div class="unit"><b>₹</b><input v-model="fare" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <button class="primary" :disabled="fareBusy" @click="saveFare">{{fareBusy?'SAVING…':'OK — SAVE FARE'}}</button>
    </section>

    <section v-if="cancelOpen&&!pendingFare" class="surface overlay">
      <div class="surface-head"><div><small>CANCEL TRIP</small><h2>CAPTURE REASON</h2></div><button class="quiet" type="button" @click="cancelOpen=false">Back</button></div>
      <label>Cancellation reason<input v-model="cancelReason" type="text" enterkeyhint="next"></label>
      <label>Cancellation fare <em>optional where applicable</em><div class="unit"><b>₹</b><input v-model="cancelFare" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <button class="primary" :disabled="cancelBusy" @click="saveCancel">{{cancelBusy?'SAVING…':'OK — CONFIRM CANCELLATION'}}</button>
    </section>

    <section v-if="fuelOpen&&!pendingFare" class="surface overlay">
      <div class="surface-head"><div><small>FUEL</small><h2>CNG REFUEL</h2></div><button class="quiet" type="button" @click="toggleFuel">Close</button></div>
      <label>Odometer<div class="unit"><input v-model="fuelOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div></label>
      <label>Price / kg<div class="unit"><b>₹</b><input v-model="fuelPrice" type="number" inputmode="decimal" enterkeyhint="next" min="0" step=".01"></div></label>
      <label>Amount<div class="unit"><b>₹</b><input v-model="fuelAmount" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <div class="calculated"><small>QUANTITY</small><strong>{{fuelQty.valid?fuelQty.quantityKg.toFixed(2)+' kg':'—'}}</strong></div>
      <label class="check"><input v-model="fuelFull" type="checkbox"> Full tank</label>
      <button class="primary" :disabled="fuelBusy" @click="saveFuel">{{fuelBusy?'SAVING…':'OK — SAVE FUEL'}}</button>
    </section>

    <section v-if="endOpen&&!pendingFare" class="surface overlay end">
      <div class="surface-head"><div><small>GOING OFFLINE</small><h2>{{endStage==='CLOSE'?'CLOSE SHIFT':endStage==='RECONCILE'?'RECONCILIATION':endStage==='MISMATCH'?'REVENUE EXCEPTION':endStage==='REVIEW'?'SHIFT REVIEW':endStage==='CONFIRM'?'READY TO END':'SHIFT ENDED'}}</h2></div><button v-if="endStage==='CLOSE'" class="quiet" type="button" @click="cancelEnd">Back</button></div>
      <template v-if="endStage==='CLOSE'">
        <div class="summary"><span>Shift started</span><strong>{{store.startOdometer}} km</strong></div>
        <label>Closing odometer<div class="unit"><input v-model="closingOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div></label>
        <label>Total shift revenue<div class="unit"><b>₹</b><input v-model="shiftRevenue" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
        <div class="optional"><small>OPTIONAL</small><label>Business toll<div class="unit"><b>₹</b><input v-model="toll" type="number" inputmode="numeric" min="0"></div></label><label>Business parking<div class="unit"><b>₹</b><input v-model="parking" type="number" inputmode="numeric" min="0"></div></label><label class="check"><input v-model="tollTreatment" true-value="EXCLUDED" false-value="INCLUDED" type="checkbox"> Exclude toll & parking from trip fare</label></div>
        <button class="primary" @click="closeShift">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='RECONCILE'">
        <div v-if="missing.length" class="exception"><small>ACTION REQUIRED</small><h3>Missing trip revenue</h3><p>Only trips without recorded revenue are shown.</p><div v-for="t in missing" :key="t.id" class="row"><div><strong>{{t.operator}}</strong><small>{{Number(t.tripKm||0).toFixed(1)}} km</small></div><div class="unit"><b>₹</b><input :value="reviewRevenue[t.id]" type="number" inputmode="numeric" min="0" @input="reviewRevenue={...reviewRevenue,[t.id]:$event.target.value}"></div></div></div><div v-else class="allclear">✓ <strong>ALL REVENUE CAPTURED</strong><p>No missing trip revenue exceptions.</p></div><div class="summary"><span>Shift revenue</span><strong>{{money(shiftRevenue)}}</strong><span>Trip revenue</span><strong>{{money(preview?.tripRevenue)}}</strong></div><button class="primary" @click="continueReconcile">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='MISMATCH'"><div class="exception"><small>REVENUE EXCEPTION</small><h3>Shift total and trip fares differ</h3><p>Correct the entries before continuing.</p><div class="summary"><span>Shift revenue</span><strong>{{money(shiftRevenue)}}</strong><span>Trip fares</span><strong>{{money(preview?.tripRevenue)}}</strong><span>Difference</span><strong>{{money(Math.abs(preview?.difference||0))}}</strong></div></div><div class="rows"><div v-for="t in completed" :key="t.id" class="row"><div><strong>{{t.operator}}</strong><small>{{Number(t.tripKm||0).toFixed(1)}} km</small></div><div class="unit"><b>₹</b><input :value="reviewRevenue[t.id]" type="number" inputmode="numeric" min="0" @input="reviewRevenue={...reviewRevenue,[t.id]:$event.target.value}"></div></div></div><button class="primary" @click="checkMismatch">CHECK AGAIN</button></template>
      <template v-else-if="endStage==='REVIEW'"><div class="review-grid"><div><small>TRIPS</small><strong>{{completed.length}}</strong></div><div><small>TOTAL SHIFT KM</small><strong>{{movementPreview?.authoritativeOdometerKm?.toFixed?.(1) || shiftKm.toFixed(1)}} km</strong></div><div><small>TRIP KM</small><strong>{{Number(movementPreview?.businessMilesKm||0).toFixed(1)}} km</strong></div><div><small>DEAD KM</small><strong>{{Number(movementPreview?.deadMilesKm||0).toFixed(1)}} km</strong></div><div><small>UNCLASSIFIED</small><strong>{{Number(movementPreview?.unclassifiedKm||0).toFixed(1)}} km</strong></div><div><small>REVENUE</small><strong>{{money(shiftRevenue)}}</strong></div><div><small>TOLL / PARKING</small><strong>{{money(toll||0)}} / {{money(parking||0)}}</strong></div></div><div class="rows"><div v-for="t in completed" :key="t.id" class="row"><div><strong>{{t.operator}}</strong><small>Optional Trip KM correction</small></div><div class="unit"><input :value="reviewKm[t.id]" type="number" inputmode="decimal" min="0" step=".1" @input="reviewKm={...reviewKm,[t.id]:$event.target.value}" @change="refreshMovementPreview"></div></div></div><p class="muted">Trip KM corrections are optional. The movement totals above are the authoritative reconciliation for this closing odometer.</p><button class="primary" @click="reviewDone">REVIEW COMPLETE</button></template>
      <template v-else-if="endStage==='CONFIRM'"><div class="confirm"><small>SHIFT REVIEW</small><strong>READY TO END</strong><p>{{completed.length}} completed trips · {{shiftKm.toFixed(1)}} km · {{money(shiftRevenue)}} revenue.</p></div><button class="primary" :disabled="endBusy" @click="finishEnd">{{endBusy?'ENDING SHIFT…':'OK — END SHIFT'}}</button></template>
      <template v-else><div class="allclear"><span>✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div><button class="primary" @click="finishEnded">OK</button></template>
    </section>

    <p v-if="error" class="feedback error" role="alert">{{error}}</p>
    <p v-if="message" class="feedback success" role="status">{{message}}</p>
  </main>
</div>
</template>
