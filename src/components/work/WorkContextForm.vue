<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import WorkFuelForm from './WorkFuelForm.vue'
import WorkStartShiftForm from './WorkStartShiftForm.vue'
import WorkFareForm from './WorkFareForm.vue'
import WorkCancellationForm from './WorkCancellationForm.vue'
import WorkEndShiftForm from './WorkEndShiftForm.vue'

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
  parkingTreatment: { type: String, default: 'INCLUDED' },
  tripTollTreatment: { type: String, default: 'INCLUDED' },
  tripParkingTreatment: { type: String, default: 'INCLUDED' },
  toll: { type: String, default: '' },
  parking: { type: String, default: '' },
  tripTollTotal: { type: Number, default: 0 },
  tripParkingTotal: { type: Number, default: 0 },
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
  'update:parking-treatment',
  'update:trip-toll-treatment',
  'update:trip-parking-treatment',
  'update:toll',
  'update:parking',
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
const numericPad = ref(null)
const suppressNumericFocus = ref(false)
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
    'shift-revenue': props.shiftRevenue,
    'shift-toll': props.toll,
    'shift-parking': props.parking
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
onMounted(() => {
  // The fare keypad is rendered in-flow and the compact fare layout is sized
  // to fit the viewport. Do not auto-scroll the whole page on form open.
  if (props.type === 'fare') activeNumericField.value = 'fare'
})
function activateNumeric(name) {
  if (suppressNumericFocus.value) {
    suppressNumericFocus.value = false
    return
  }
  activeNumericField.value = name
  // Keep the page position stable. The keypad remains in document flow and
  // compact viewport styles reserve the fixed swipe/navigation zones.
}
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
    'shift-revenue': 'update:shift-revenue',
    'shift-toll': 'update:toll',
    'shift-parking': 'update:parking'
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
  'shift-revenue': 'Total shift revenue',
  'shift-toll': 'Additional toll',
  'shift-parking': 'Additional parking'
}
const numericNext = {
  'fare': 'trip-toll',
  'trip-toll': 'trip-parking',
  'fuel-odo': 'fuel-price',
  'fuel-price': 'fuel-amount',
  'closing-odo': 'shift-revenue',
  'shift-toll': 'shift-parking'
}
const numericLabel = name => {
  if (numericLabels[name]) return numericLabels[name]
  if (name.startsWith('review-revenue:')) return 'Trip revenue'
  if (name.startsWith('review-km:')) return 'Trip KM'
  return name.replace(/[-:]/g, ' ')
}
const numericPress = async token => {
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

  if (token === 'NEXT') {
    const nextName = numericNext[field.name]
    if (nextName) {
      activeNumericField.value = nextName
      return
    }
    activeNumericField.value = null
    return
  }
  if (token === 'DONE') {
    const finalFields = new Set(['fare', 'trip-parking', 'cancel-fare', 'shift-revenue', 'shift-parking'])
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    suppressNumericFocus.value = true
    activeNumericField.value = null
    await nextTick()
    if (finalFields.has(field.name)) submitForm()
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
    <WorkStartShiftForm v-if="type === 'start'" :start-odo="startOdo" :start-ack="startAck" :gap-choice="gapChoice" :gap-km="gapKm" :start-busy="startBusy" @action="emit('action', $event)" @focus-numeric="activateNumeric" @update:start-ack="emit('update:start-ack', $event)" @update:gap-choice="emit('update:gap-choice', $event)" />

    <WorkFareForm v-else-if="type === 'fare'" :fare="fare" :fare-busy="fareBusy" :trip-toll="tripToll" :trip-parking="tripParking" :trip-toll-treatment="tripTollTreatment" :trip-parking-treatment="tripParkingTreatment" :show-save-action="!activeNumeric" @action="emit('action', $event)" @focus-numeric="activateNumeric" @dismiss-numeric="activeNumericField = null" @update:trip-toll-treatment="emit('update:trip-toll-treatment', $event)" @update:trip-parking-treatment="emit('update:trip-parking-treatment', $event)" />

    <WorkCancellationForm v-else-if="type === 'cancel'" :cancel-reason="cancelReason" :cancel-fare="cancelFare" :cancel-busy="cancelBusy" @action="emit('action', $event)" @focus-numeric="activateNumeric" @update:cancel-reason="emit('update:cancel-reason', $event)" />

    <WorkFuelForm v-else-if="type === 'fuel'" :fuel-odo="fuelOdo" :fuel-price="fuelPrice" :fuel-amount="fuelAmount" :fuel-partial="fuelPartial" :fuel-qty="fuelQty" :fuel-busy="fuelBusy" @action="emit('action', $event)" @focus-numeric="activateNumeric" @update:fuel-partial="emit('update:fuel-partial', $event)" />

    <WorkEndShiftForm v-else-if="type === 'end'" :end-title="endTitle" :end-stage="endStage" :end-missing="endMissing" :end-preview="endPreview" :end-completed-count="endCompletedCount" :end-shift-km="endShiftKm" :end-reviewed-trip-km="endReviewedTripKm" :end-reviewed-dead-km="endReviewedDeadKm" :end-ready="endReady" :end-busy="endBusy" :start-odo="startOdo" :closing-odo="closingOdo" :shift-revenue="shiftRevenue" :review-revenue="reviewRevenue" :review-km="reviewKm" :review-operator="reviewOperator" :toll-treatment="tollTreatment" :parking-treatment="parkingTreatment" :toll="toll" :parking="parking" :trip-toll-total="tripTollTotal" :trip-parking-total="tripParkingTotal" :money="money" @action="emit('action', $event)" @focus-numeric="activateNumeric" @update:toll-treatment="emit('update:toll-treatment', $event)" @update:parking-treatment="emit('update:parking-treatment', $event)" />

      <div v-if="activeNumeric" ref="numericPad" class="kfe-work-number-pad" aria-label="KFE intelligent numeric keypad">
        <div class="kfe-work-number-pad__display">
          <span>{{ numericLabel(activeNumeric.name) }}</span>
          <strong>{{ activeNumeric.value || '0' }}</strong>
        </div>
        <div class="kfe-work-number-pad__grid">
          <button v-for="key in ['1','2','3','4','5','6','7','8','9','CLEAR','0','BACK']" :key="key" type="button" @click="numericPress(key)">{{ key === 'CLEAR' ? 'CLR' : key === 'BACK' ? '⌫' : key }}</button>
        </div>
        <div class="kfe-work-number-pad__actions" :class="{ 'fare-keypad-actions': type === 'fare' }">
          <button v-if="activeNumericDecimal" type="button" class="decimal-key" @click="numericPress('.')">.</button>
          <span v-else-if="type !== 'fare'"></span>
          <template v-if="type === 'fare'">
            <button type="button" class="done fare-save-action" :disabled="fareBusy" @click="submitForm">{{ fareBusy ? 'SAVING…' : 'OK' }}</button>
          </template>
          <template v-else>
            <button v-if="numericNext[activeNumeric.name]" type="button" @click="numericPress('NEXT')">NEXT →</button>
            <button type="button" class="done" @click="numericPress('DONE')">DONE</button>
          </template>
        </div>
      </div>
  </section>
</template>

<style scoped>
.work-context-form{width:100%;box-sizing:border-box;animation:work-form-in 140ms ease-out}
.kfe-work-number-pad{margin-top:4px;padding:8px;border:1px solid var(--kfe-ui-border);border-radius:16px;background:var(--kfe-ui-surface-2);box-shadow:0 8px 24px color-mix(in srgb,var(--kfe-ui-text) 10%,transparent)}
.kfe-work-number-pad__display{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:4px 6px 7px}.kfe-work-number-pad__display span{font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--kfe-muted-text)}.kfe-work-number-pad__display strong{font-size:1.35rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;min-width:0}
.kfe-work-number-pad__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.kfe-work-number-pad__grid button,.kfe-work-number-pad__actions button{min-height:40px;border:1px solid var(--kfe-ui-border);border-radius:10px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text);font-size:1rem;font-weight:900}
.kfe-work-number-pad__grid button:nth-child(10){font-size:.68rem}.kfe-work-number-pad__actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:5px}.kfe-work-number-pad__actions button{font-size:.78rem}.kfe-work-number-pad__actions .done{background:var(--kfe-ui-accent);color:var(--kfe-on-accent);border-color:var(--kfe-ui-accent)}.kfe-work-number-pad__actions.fare-keypad-actions{grid-template-columns:minmax(0,1fr) auto}.kfe-work-number-pad__actions .fare-save-action{grid-column:auto;min-height:36px;font-size:.82rem;white-space:normal;line-height:1.15}
.form-fare .kfe-work-number-pad{padding:5px;border-radius:12px;box-shadow:none}
.form-fare .kfe-work-number-pad__display{padding:1px 5px 3px}
.form-fare .kfe-work-number-pad__display strong{font-size:1.05rem}
.form-fare .kfe-work-number-pad__grid{gap:3px}
.form-fare .kfe-work-number-pad__grid button{min-height:31px;border-radius:7px;font-size:.9rem}
.form-fare .kfe-work-number-pad__actions{gap:4px;margin-top:4px}
.form-fare .kfe-work-number-pad__actions button{min-height:32px;border-radius:7px}
@media(max-width:600px){.kfe-work-number-pad{padding:7px}.kfe-work-number-pad__grid button,.kfe-work-number-pad__actions button{min-height:38px}.form-fare .kfe-work-number-pad{padding:5px}.form-fare .kfe-work-number-pad__grid button{min-height:31px}.form-fare .kfe-work-number-pad__actions button{min-height:32px}}
@keyframes work-form-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
</style>
