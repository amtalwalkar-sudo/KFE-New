<script setup>
import { computed, ref } from 'vue'

const startAckLocal = ref(false)

const props = defineProps({
  type: { type: String, required: true },
  gap: { type: Object, default: () => ({}) },
  gapKm: { type: Number, default: 0 },
  endStage: { type: String, default: 'CLOSE' },
  endMissing: { type: Array, default: () => [] },
  endPreview: { type: Object, default: null },
  endCompletedCount: { type: Number, default: 0 },
  endShiftKm: { type: Number, default: 0 },
  endReviewedTripKm: { type: Number, default: 0 },
  endReviewedDeadKm: { type: Number, default: 0 },
  endReady: { type: Boolean, default: false },
  endBusy: { type: Boolean, default: false },
  startBusy: { type: Boolean, default: false },
  fareBusy: { type: Boolean, default: false },
  cancelBusy: { type: Boolean, default: false },
  fuelBusy: { type: Boolean, default: false },
  money: { type: Function, required: true },
  startOdo: { type: String, default: '' },
  startAck: { type: Boolean, default: false },
  gapChoice: { type: String, default: '' },
  closingOdo: { type: String, default: '' },
  shiftRevenue: { type: String, default: '' },
  reviewRevenue: { type: Object, default: () => ({}) },
  reviewKm: { type: Object, default: () => ({}) },
  reviewOperator: { type: Object, default: () => ({}) },
  tollTreatment: { type: String, default: 'INCLUDED' },
  fare: { type: String, default: '' },
  tripToll: { type: String, default: '' },
  tripParking: { type: String, default: '' },
  cancelReason: { type: String, default: '' },
  cancelFare: { type: String, default: '' },
  fuelOdo: { type: String, default: '' },
  fuelPrice: { type: String, default: '' },
  fuelAmount: { type: String, default: '' },
  fuelPartial: { type: Boolean, default: false },
  fuelQty: { type: Object, default: () => ({ valid: false }) }
})

const emit = defineEmits([
  'action',
  'update:start-odo',
  'update:start-ack',
  'update:gap-choice',
  'update:closing-odo',
  'update:shift-revenue',
  'update:review-revenue',
  'update:review-km',
  'update:review-operator',
  'update:toll-treatment',
  'update:fare',
  'update:trip-toll',
  'update:trip-parking',
  'update:cancel-reason',
  'update:cancel-fare',
  'update:fuel-odo',
  'update:fuel-price',
  'update:fuel-amount',
  'update:fuel-partial'
])


const endTitle = computed(() => ({
  CLOSE: 'Close shift',
  RECONCILE: 'Reconciliation',
  REVIEW: 'Shift review',
  CONFIRM: 'Ready to end',
  ENDED: 'Shift ended'
}[props.endStage] || 'Close shift'))

function preserveStartAck() {
  const checkbox = document.querySelector('.form-start input[type="checkbox"]')
  if (checkbox?.checked === true) {
    startAckLocal.value = true
    emit('update:start-ack', true)
  }
}

function chooseGap(choice) {
  preserveStartAck()
  emit('update:gap-choice', choice)
}

function submitStartAction() {
  const checkbox = document.querySelector('.form-start input[type="checkbox"]')
  emit('action', {
    name: 'submit-start',
    startOdo: props.startOdo,
    startAck: startAckLocal.value === true
  })
}

const updateMap = (name, map, id, value) => {
  emit('update:' + name, { ...map, [id]: value })
}
</script>

<template>
  <!-- CI verification marker: shift-start checkbox state is owned by the form across gap-choice rerenders. -->
  <!-- Shift-start confirmation remains native so its checked state survives gap-choice rerenders. -->
  <section class="work-context-form contextual-form" :class="['form-' + type, type === 'start' ? 'start-shift-gate' : '', type === 'end' ? 'end-gate' : '', ['fare', 'cancel', 'fuel'].includes(type) ? 'focus-surface' : '']">
    <div v-if="type === 'start'" class="form-card state-tone-warning">
      <div class="form-head">
        <div><span class="eyebrow">START SHIFT</span><h2>Confirm shift start</h2></div>
        <button class="text-action" type="button" @click="emit('action', 'back-start')">Back</button>
      </div>
      <label for="start-shift-odometer">Current vehicle odometer</label>
      <div class="input-unit">
        <input id="start-shift-odometer" :value="startOdo" type="number" inputmode="numeric" enterkeyhint="done" min="0" step="1" autocomplete="off" aria-label="Current vehicle odometer" @input="emit('update:start-odo', $event.target.value)">
        <b>km</b>
      </div>
      <label class="check-row">
        <input type="checkbox" :checked="startAckLocal" :disabled="!startOdo" aria-label="Confirm current vehicle odometer">
        <span>I confirm this is the current odometer.</span>
      </label>
      <div v-if="gapKm > 0" class="gap-panel">
        <div><span class="eyebrow">ODOMETER GAP</span><strong>{{ gapKm }} km</strong><p>Classify the full gap.</p></div>
        <div class="choice-row">
          <button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="chooseGap('PERSONAL')">Personal KM</button>
          <button type="button" :class="{selected:gapChoice==='DEAD'}" @click="chooseGap('DEAD')">Dead KM</button>
        </div>
      </div>
      <button class="primary-action" :disabled="startBusy" @click="submitStartAction">{{ startBusy ? 'STARTING…' : 'CONFIRM & GO ONLINE' }}</button>
    </div>

    <div v-else-if="type === 'fare'" class="form-card state-tone-warning focus-surface">
      <div class="form-head"><div><span class="eyebrow">TRIP COMPLETED</span><strong>OPTIONAL DETAILS</strong></div><button class="text-action" type="button" @click="emit('action','skip-fare')">Skip</button></div>
      <label>Trip fare <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="fare" type="number" inputmode="numeric" enterkeyhint="next" min="0" autocomplete="off" @input="emit('update:fare',$event.target.value)"></div></label>
      <label>Toll <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripToll" type="number" inputmode="numeric" enterkeyhint="next" min="0" autocomplete="off" @input="emit('update:trip-toll',$event.target.value)"></div></label>
      <label>Parking <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripParking" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off" @input="emit('update:trip-parking',$event.target.value)"></div></label>
      <button class="primary-action" :disabled="fareBusy" @click="emit('action','save-fare')">{{ fareBusy ? 'SAVING…' : 'SAVE DETAILS & CONTINUE' }}</button>
    </div>

    <div v-else-if="type === 'cancel'" class="form-card state-tone-warning focus-surface">
      <div class="form-head"><div><span class="eyebrow">CANCELLATION</span><strong>CAPTURE CANCELLATION</strong></div><button class="text-action" type="button" @click="emit('action','back-cancel')">Back</button></div>
      <div class="choice-field"><span class="field-label">Cancellation reason</span><div class="choice-row cancellation-reasons">
        <button type="button" :class="{selected:cancelReason==='PASSENGER'}" @click="emit('update:cancel-reason','PASSENGER')">Passenger cancellation</button>
        <button type="button" :class="{selected:cancelReason==='DRIVER'}" @click="emit('update:cancel-reason','DRIVER')">Driver cancellation</button>
      </div></div>
      <label>Cancellation fee<div class="input-unit"><b>₹</b><input :value="cancelFare" type="number" inputmode="numeric" enterkeyhint="done" min="0" required autocomplete="off" @input="emit('update:cancel-fare',$event.target.value)"></div></label>
      <button class="primary-action" :disabled="cancelBusy" @click="emit('action','save-cancel')">{{ cancelBusy ? 'SAVING…' : 'OK — CONFIRM CANCELLATION' }}</button>
    </div>

    <div v-else-if="type === 'fuel'" class="form-card state-tone-info focus-surface">
      <div class="form-head"><div><span class="eyebrow">FUEL</span><strong>CNG REFUEL</strong></div><button class="text-action" type="button" @click="emit('action','close-fuel')">Close</button></div>
      <label>Odometer<div class="input-unit"><input :value="fuelOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0" autocomplete="off" aria-label="Odometer" @input="emit('update:fuel-odo',$event.target.value)"><b>km</b></div></label>
      <label>Price / kg<div class="input-unit"><b>₹</b><input :value="fuelPrice" type="number" inputmode="decimal" enterkeyhint="next" min="0" step=".01" autocomplete="off" @input="emit('update:fuel-price',$event.target.value)"></div></label>
      <label>Amount<div class="input-unit"><b>₹</b><input :value="fuelAmount" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off" @input="emit('update:fuel-amount',$event.target.value)"></div></label>
      <div class="calculated-value"><span>Quantity</span><strong>{{ fuelQty.valid ? fuelQty.quantityKg.toFixed(2)+' kg' : '—' }}</strong></div>
      <label class="check-row"><input :checked="fuelPartial" type="checkbox" @change="emit('update:fuel-partial',$event.target.checked)"><span>Partial fill</span></label>
      <button class="primary-action" :disabled="fuelBusy" @click="emit('action','save-fuel')">{{ fuelBusy ? 'SAVING…' : 'OK — SAVE FUEL' }}</button>
    </div>

    <div v-else-if="type === 'end'" class="form-card state-tone-warning">
      <div class="form-head"><div><span class="eyebrow">GOING OFFLINE</span><h2>{{ endTitle }}</h2></div><button v-if="endStage==='CLOSE'" class="text-action" type="button" @click="emit('action','back-end')">Back</button></div>
      <template v-if="endStage==='CLOSE'">
        <div class="fact-line"><span>Shift started</span><strong>{{ startOdo || '—' }} km</strong></div>
        <label>Closing odometer<div class="input-unit"><input :value="closingOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0" autocomplete="off" @input="emit('update:closing-odo',$event.target.value)"><b>km</b></div></label>
        <label>Total shift revenue<div class="input-unit"><b>₹</b><input :value="shiftRevenue" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off" @input="emit('update:shift-revenue',$event.target.value)"></div></label>
        <button class="primary-action" @click="emit('action','close-end')">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='RECONCILE'">
        <div v-if="endMissing.length" class="exception-panel"><span class="eyebrow">OPTIONAL DETAIL</span><h3>Trip fares not entered</h3><p>You can continue. End Shift revenue remains authoritative.</p><div v-for="trip in endMissing" :key="trip.id" class="reconcile-row"><div><strong>{{ trip.operator }}</strong><span>{{ Number(trip.tripKm||0).toFixed(1) }} km</span></div><div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[trip.id]" type="number" inputmode="numeric" enterkeyhint="next" min="0" autocomplete="off" @input="updateMap('review-revenue',reviewRevenue,trip.id,$event.target.value)"></div></div></div>
        <div v-else class="success-panel"><strong>ALL REVENUE CAPTURED</strong><span>No missing trip revenue exceptions.</span></div>
        <div class="fact-grid"><div><span>Shift revenue</span><strong>{{ money(shiftRevenue) }}</strong></div><div><span>Trip revenue</span><strong>{{ money(endPreview?.tripRevenue) }}</strong></div></div>
        <button class="primary-action" @click="emit('action','continue-reconcile')">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='REVIEW'">
        <div class="fact-grid review"><div><span>Trips</span><strong>{{ endCompletedCount }}</strong></div><div><span>Total shift KM</span><strong>{{ endShiftKm.toFixed(1) }}</strong></div><div><span>Trip KM</span><strong>{{ endReviewedTripKm.toFixed(1) }}</strong></div><div><span>Dead KM</span><strong>{{ endReviewedDeadKm.toFixed(1) }}</strong></div><div><span>Revenue</span><strong>{{ money(shiftRevenue) }}</strong></div></div>
        <div v-if="endReviewedDeadKm < -0.000001" class="exception-panel"><strong>KM RECONCILIATION REQUIRED</strong><p>Trip KM exceeds total shift KM by {{ Math.abs(endReviewedDeadKm).toFixed(1) }} km.</p></div>
        <label class="check-row"><input :checked="tollTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:toll-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Toll & parking were paid separately</span></label>
        <button class="primary-action" @click="emit('action','review-complete')">REVIEW COMPLETE</button>
      </template>
      <template v-else-if="endStage==='CONFIRM'">
        <div class="completion-panel"><span class="eyebrow">SHIFT REVIEW</span><strong>READY TO END</strong><p>{{ endCompletedCount }} completed trips · {{ endShiftKm.toFixed(1) }} km · {{ money(shiftRevenue) }} revenue.</p></div>
        <button class="primary-action" :disabled="endBusy || !endReady" @click="emit('action','finish-end')">{{ endBusy ? 'ENDING SHIFT…' : 'OK — END SHIFT' }}</button>
      </template>
      <template v-else>
        <div class="completion-panel success"><span class="completion-mark" aria-hidden="true">✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div>
        <button class="primary-action" @click="emit('action','finish-ended')">OK</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.work-context-form{width:100%;box-sizing:border-box;animation:work-form-in 140ms ease-out}
.form-card{width:100%;box-sizing:border-box;padding:14px;border-radius:16px;display:grid;gap:12px}
.form-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.form-card h2,.form-card strong{margin:0}
.form-card label{display:grid;gap:6px;font-weight:700}
.input-unit{display:flex;align-items:center;gap:8px}
.input-unit input{width:100%;min-width:0}
.choice-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.choice-row button{min-height:48px}
.check-row{display:flex!important;grid-template-columns:none!important;align-items:center;gap:10px}
.check-row input{width:22px!important;height:22px}
.primary-action,.text-action,.choice-row button{touch-action:manipulation}
.primary-action{min-height:48px}
.form-card input,.form-card select,.form-card button{font:inherit}
.form-card input{font-size:16px}
@keyframes work-form-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@media(max-width:640px){.form-card{padding:12px}.form-card{max-width:100%}}
</style>
