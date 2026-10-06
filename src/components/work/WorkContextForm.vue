<script setup>
import { computed, ref } from 'vue'

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



const activeNumericField = ref(null)
const activeNumeric = computed(() => {
  const name = activeNumericField.value
  if (!name) return null
  const map = {
    'start-odo': props.startOdo,
    'fare': props.fare,
    'trip-toll': props.tripToll,
    'trip-parking': props.tripParking,
    'cancel-fare': props.cancelFare,
    'fuel-odo': props.fuelOdo,
    'fuel-price': props.fuelPrice,
    'fuel-amount': props.fuelAmount,
    'closing-odo': props.closingOdo,
    'shift-revenue': props.shiftRevenue
  }
  if (name in map) return { name, value: map[name] == null ? '' : String(map[name]), decimal: name === 'fuel-price' }
  if (name.startsWith('review-revenue:')) {
    const id = name.slice(15)
    return { name, value: props.reviewRevenue[id] == null ? '' : String(props.reviewRevenue[id]), decimal: false }
  }
  if (name.startsWith('review-km:')) {
    const id = name.slice(10)
    return { name, value: props.reviewKm[id] == null ? '' : String(props.reviewKm[id]), decimal: true }
  }
  return null
})
const activeNumericDecimal = computed(() => activeNumeric.value?.decimal === true)
function activateNumeric(name) { activeNumericField.value = name }
function emitNumeric(name, value) {
  const events = {
    'start-odo': 'update:start-odo',
    'fare': 'update:fare',
    'trip-toll': 'update:trip-toll',
    'trip-parking': 'update:trip-parking',
    'cancel-fare': 'update:cancel-fare',
    'fuel-odo': 'update:fuel-odo',
    'fuel-price': 'update:fuel-price',
    'fuel-amount': 'update:fuel-amount',
    'closing-odo': 'update:closing-odo',
    'shift-revenue': 'update:shift-revenue'
  }
  if (events[name]) { emit(events[name], value); return }
  if (name.startsWith('review-revenue:')) {
    const id = name.slice(15)
    emit('update:review-revenue', { ...props.reviewRevenue, [id]: value })
    return
  }
  if (name.startsWith('review-km:')) {
    const id = name.slice(10)
    emit('update:review-km', { ...props.reviewKm, [id]: value })
  }
}
const numericLabels = {
  'start-odo': 'Current odometer',
  fare: 'Trip fare',
  'trip-toll': 'Toll',
  'trip-parking': 'Parking',
  'cancel-fare': 'Cancellation fee',
  'fuel-odo': 'Odometer',
  'fuel-price': 'Price / kg',
  'fuel-amount': 'Amount',
  'closing-odo': 'Closing odometer',
  'shift-revenue': 'Total shift revenue'
}
const numericNext = {
  'fare': 'trip-toll',
  'trip-toll': 'trip-parking',
  'fuel-odo': 'fuel-price',
  'fuel-price': 'fuel-amount',
  'closing-odo': 'shift-revenue'
}
const numericLabel = name => {
  if (numericLabels[name]) return numericLabels[name]
  if (name.startsWith('review-revenue:')) return 'Trip revenue'
  if (name.startsWith('review-km:')) return 'Trip KM'
  return name.replace(/[-:]/g, ' ')
}
const numericPress = token => {
  const field = activeNumeric.value
  if (!field || typeof field !== 'object') {
    activeNumericField.value = null
    return
  }
  let next = field.value
  if (token === 'CLEAR') next = ''
  else if (token === 'BACK') next = next.slice(0, -1)
  else if (token === '.' && (!field?.decimal || next.includes('.'))) return
  else if (token === '.' && next === '') next = '0.'
  else if (token !== 'DONE' && token !== 'NEXT') next = next === '0' ? token : next + token

  if (token === 'DONE') {
    activeNumericField.value = null
    return
  }
  if (token === 'NEXT') {
    const nextName = numericNext[field.name]
    if (!nextName) {
      activeNumericField.value = null
      return
    }
    activeNumericField.value = nextName
    return
  }
  emitNumeric(field.name, next)
}

const endTitle = computed(() => ({
  CLOSE: 'Close shift',
  RECONCILE: 'Reconciliation',
  REVIEW: 'Shift review',
  CONFIRM: 'Ready to end',
  ENDED: 'Shift ended'
}[props.endStage] || 'Close shift'))

function chooseGap(choice) {
  emit('update:gap-choice', choice)
}

function submitForm() {
  if (props.type === 'start') {
    emit('action', { name: 'submit-start', startOdo: props.startOdo, startAck: props.startAck === true })
    return
  }
  const action = props.type === 'fare' ? 'save-fare'
    : props.type === 'cancel' ? 'save-cancel'
    : props.type === 'fuel' ? 'save-fuel'
    : props.endStage === 'CLOSE' ? 'close-end'
    : props.endStage === 'RECONCILE' ? 'continue-reconcile'
    : props.endStage === 'REVIEW' ? 'review-complete'
    : props.endStage === 'CONFIRM' ? 'finish-end'
    : 'finish-ended'
  emit('action', action)
}

const updateMap = (name, map, id, value) => {
  emit('update:' + name, { ...map, [id]: value })
}
</script>

<template>
  <section class="work-context-form contextual-form" :class="['form-' + type, type === 'start' ? 'start-shift-gate' : '', type === 'end' ? 'end-gate' : '', ['fare', 'cancel', 'fuel'].includes(type) ? 'focus-surface' : '']">
    <form v-if="type === 'start'" class="form-card state-tone-warning" @submit.prevent="submitForm">
      <div class="form-head">
        <div><span class="eyebrow">START SHIFT</span><h2>Confirm shift start</h2></div>
        <button class="text-action" type="button" @click="emit('action', 'back-start')">Back</button>
      </div>
      <label for="start-shift-odometer">Current vehicle odometer</label>
      <div class="input-unit">
        <input id="start-shift-odometer" :value="startOdo" type="text" inputmode="none" readonly autocomplete="off" aria-label="Current vehicle odometer" @focus="activateNumeric('start-odo')" @click="activateNumeric('start-odo')">
        <b>km</b>
      </div>
      <label class="check-row">
        <input type="checkbox" :checked="startAck" :disabled="!startOdo" aria-label="Confirm current vehicle odometer" @change="emit('update:start-ack', $event.target.checked)">
        <span>I confirm this is the current odometer.</span>
      </label>
      <div v-if="gapKm > 0" class="gap-panel">
        <div><span class="eyebrow">ODOMETER GAP</span><strong>{{ gapKm }} km</strong><p>Classify the full gap.</p></div>
        <div class="choice-row">
          <button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="chooseGap('PERSONAL')">Personal KM</button>
          <button type="button" :class="{selected:gapChoice==='DEAD'}" @click="chooseGap('DEAD')">Dead KM</button>
        </div>
      </div>
      <button type="submit" class="primary-action" :disabled="startBusy">{{ startBusy ? 'STARTING…' : 'CONFIRM & GO ONLINE' }}</button>
    </form>

    <form v-else-if="type === 'fare'" class="form-card state-tone-warning focus-surface" @submit.prevent="submitForm">
      <div class="form-head"><div><span class="eyebrow">TRIP COMPLETED</span><strong>OPTIONAL DETAILS</strong></div><button class="text-action" type="button" @click="emit('action','skip-fare')">Skip</button></div>
      <label>Trip fare <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="fare" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('fare')" aria-label="Trip fare" @click="activateNumeric('fare')"></div></label>
      <label>Toll <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripToll" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('trip-toll')" aria-label="Toll" @click="activateNumeric('trip-toll')"></div></label>
      <label>Parking <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripParking" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('trip-parking')" aria-label="Parking" @click="activateNumeric('trip-parking')"></div></label>
      <button type="submit" class="primary-action" :disabled="fareBusy">{{ fareBusy ? 'SAVING…' : 'SAVE DETAILS & CONTINUE' }}</button>
    </form>

    <form v-else-if="type === 'cancel'" class="form-card state-tone-warning focus-surface" @submit.prevent="submitForm">
      <div class="form-head"><div><span class="eyebrow">CANCELLATION</span><strong>CAPTURE CANCELLATION</strong></div><button class="text-action" type="button" @click="emit('action','back-cancel')">Back</button></div>
      <div class="choice-field"><span class="field-label">Cancellation reason</span><div class="choice-row cancellation-reasons">
        <button type="button" :class="{selected:cancelReason==='PASSENGER'}" @click="emit('update:cancel-reason','PASSENGER')">Passenger cancellation</button>
        <button type="button" :class="{selected:cancelReason==='DRIVER'}" @click="emit('update:cancel-reason','DRIVER')">Driver cancellation</button>
      </div></div>
      <label>Cancellation fee<div class="input-unit"><b>₹</b><input :value="cancelFare" type="text" inputmode="none" readonly required autocomplete="off" @focus="activateNumeric('cancel-fare')" aria-label="Cancellation fee" @click="activateNumeric('cancel-fare')"></div></label>
      <button type="submit" class="primary-action" :disabled="cancelBusy">{{ cancelBusy ? 'SAVING…' : 'OK — CONFIRM CANCELLATION' }}</button>
    </form>

    <form v-else-if="type === 'fuel'" class="form-card state-tone-info focus-surface" @submit.prevent="submitForm">
      <div class="form-head"><div><span class="eyebrow">FUEL</span><strong>CNG REFUEL</strong></div><button class="text-action" type="button" @click="emit('action','close-fuel')">Close</button></div>
      <label>Odometer<div class="input-unit"><input :value="fuelOdo" type="text" inputmode="none" readonly autocomplete="off" aria-label="Odometer" @focus="activateNumeric('fuel-odo')" @click="activateNumeric('fuel-odo')"><b>km</b></div></label>
      <label>Price / kg<div class="input-unit"><b>₹</b><input :value="fuelPrice" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('fuel-price')" aria-label="Price / kg" @click="activateNumeric('fuel-price')"></div></label>
      <label>Amount<div class="input-unit"><b>₹</b><input :value="fuelAmount" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('fuel-amount')" aria-label="Amount" @click="activateNumeric('fuel-amount')"></div></label>
      <div class="calculated-value"><span>Quantity</span><strong>{{ fuelQty.valid ? fuelQty.quantityKg.toFixed(2)+' kg' : '—' }}</strong></div>
      <label class="check-row"><input :checked="fuelPartial" type="checkbox" @change="emit('update:fuel-partial',$event.target.checked)"><span>Partial fill</span></label>
      <button type="submit" class="primary-action" :disabled="fuelBusy">{{ fuelBusy ? 'SAVING…' : 'OK — SAVE FUEL' }}</button>
    </form>

    <form v-else-if="type === 'end'" class="form-card state-tone-warning" @submit.prevent="submitForm">
      <div class="form-head"><div><span class="eyebrow">GOING OFFLINE</span><h2>{{ endTitle }}</h2></div><button v-if="endStage==='CLOSE'" class="text-action" type="button" @click="emit('action','back-end')">Back</button></div>
      <template v-if="endStage==='CLOSE'">
        <div class="fact-line"><span>Shift started</span><strong>{{ startOdo || '—' }} km</strong></div>
        <label>Closing odometer<div class="input-unit"><input :value="closingOdo" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('closing-odo')" aria-label="Closing odometer" @click="activateNumeric('closing-odo')"><b>km</b></div></label>
        <label>Total shift revenue<div class="input-unit"><b>₹</b><input :value="shiftRevenue" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('shift-revenue')" aria-label="Total shift revenue" @click="activateNumeric('shift-revenue')"></div></label>
        <button type="submit" class="primary-action">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='RECONCILE'">
        <div v-if="endMissing.length" class="exception-panel"><span class="eyebrow">OPTIONAL DETAIL</span><h3>Trip fares not entered</h3><p>You can continue. End Shift revenue remains authoritative.</p><div v-for="trip in endMissing" :key="trip.id" class="reconcile-row"><div><strong>{{ trip.operator }}</strong><span>{{ Number(trip.tripKm||0).toFixed(1) }} km</span></div><div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[trip.id]" type="text" inputmode="none" readonly autocomplete="off" @focus="activateNumeric('review-revenue:' + trip.id)" aria-label="Trip revenue" @click="activateNumeric('review-revenue:' + trip.id)"></div></div></div>
        <div v-else class="success-panel"><strong>ALL REVENUE CAPTURED</strong><span>No missing trip revenue exceptions.</span></div>
        <div class="fact-grid"><div><span>Shift revenue</span><strong>{{ money(shiftRevenue) }}</strong></div><div><span>Trip revenue</span><strong>{{ money(endPreview?.tripRevenue) }}</strong></div></div>
        <button type="submit" class="primary-action">CONTINUE</button>
      </template>
      <template v-else-if="endStage==='REVIEW'">
        <div class="fact-grid review"><div><span>Trips</span><strong>{{ endCompletedCount }}</strong></div><div><span>Total shift KM</span><strong>{{ endShiftKm.toFixed(1) }}</strong></div><div><span>Trip KM</span><strong>{{ endReviewedTripKm.toFixed(1) }}</strong></div><div><span>Dead KM</span><strong>{{ endReviewedDeadKm.toFixed(1) }}</strong></div><div><span>Revenue</span><strong>{{ money(shiftRevenue) }}</strong></div></div>
        <div v-if="endReviewedDeadKm < -0.000001" class="exception-panel"><strong>KM RECONCILIATION REQUIRED</strong><p>Trip KM exceeds total shift KM by {{ Math.abs(endReviewedDeadKm).toFixed(1) }} km.</p></div>
        <label class="check-row"><input :checked="tollTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:toll-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Toll & parking were paid separately</span></label>
        <button type="submit" class="primary-action">REVIEW COMPLETE</button>
      </template>
      <template v-else-if="endStage==='CONFIRM'">
        <div class="completion-panel"><span class="eyebrow">SHIFT REVIEW</span><strong>READY TO END</strong><p>{{ endCompletedCount }} completed trips · {{ endShiftKm.toFixed(1) }} km · {{ money(shiftRevenue) }} revenue.</p></div>
        <button type="submit" class="primary-action" :disabled="endBusy || !endReady">{{ endBusy ? 'ENDING SHIFT…' : 'OK — END SHIFT' }}</button>
      </template>
      <template v-else>
        <div class="completion-panel success"><span class="completion-mark" aria-hidden="true">✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div>
        <button type="submit" class="primary-action">OK</button>
      </template>
    </form>

      <div v-if="activeNumeric" class="kfe-work-number-pad" aria-label="KFE intelligent numeric keypad">
        <div class="kfe-work-number-pad__display">
          <span>{{ numericLabel(activeNumeric.name) }}</span>
          <strong>{{ activeNumeric.value || '0' }}</strong>
        </div>
        <div class="kfe-work-number-pad__grid">
          <button v-for="key in ['1','2','3','4','5','6','7','8','9','CLEAR','0','BACK']" :key="key" type="button" @click="numericPress(key)">{{ key === 'CLEAR' ? 'CLR' : key === 'BACK' ? '⌫' : key }}</button>
        </div>
        <div class="kfe-work-number-pad__actions">
          <button v-if="activeNumericDecimal" type="button" @click="numericPress('.')">.</button>
          <span v-else></span>
          <button v-if="numericNext[activeNumeric.name]" type="button" @click="numericPress('NEXT')">NEXT →</button>
          <button type="button" class="done" @click="numericPress('DONE')">DONE</button>
        </div>
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
.form-card input{font-size:16px}.form-fare .form-card{padding:8px;gap:6px}.form-fare .form-card label{gap:2px}.form-fare .form-card .primary-action{min-height:42px}
@keyframes work-form-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@media(max-width:640px){.form-card{padding:12px}.form-card{max-width:100%}}

.kfe-work-number-pad{margin-top:4px;padding:8px;border:1px solid var(--kfe-ui-border);border-radius:16px;background:var(--kfe-ui-surface-2);box-shadow:0 8px 24px color-mix(in srgb,var(--kfe-ui-text) 10%,transparent)}
.kfe-work-number-pad__display{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:4px 6px 7px}.kfe-work-number-pad__display span{font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--kfe-muted-text)}.kfe-work-number-pad__display strong{font-size:1.35rem;font-variant-numeric:tabular-nums}
.kfe-work-number-pad__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.kfe-work-number-pad__grid button,.kfe-work-number-pad__actions button{min-height:40px;border:1px solid var(--kfe-ui-border);border-radius:10px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text);font-size:1rem;font-weight:900}
.kfe-work-number-pad__grid button:nth-child(10){font-size:.68rem}.kfe-work-number-pad__actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:5px}.kfe-work-number-pad__actions button{font-size:.78rem}.kfe-work-number-pad__actions .done{background:var(--kfe-ui-accent);color:var(--kfe-on-accent);border-color:var(--kfe-ui-accent)}
@media(max-width:600px){.kfe-work-number-pad{padding:7px}.kfe-work-number-pad__grid button,.kfe-work-number-pad__actions button{min-height:38px}}
</style>
