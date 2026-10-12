<script setup>
const props = defineProps({
  endTitle: { type: String, default: 'Close shift' },
  endStage: { type: String, default: 'CLOSE' },
  endMissing: { type: Array, default: () => [] },
  endPreview: { type: Object, default: null },
  endCompletedCount: { type: Number, default: 0 },
  endShiftKm: { type: Number, default: 0 },
  endReviewedTripKm: { type: Number, default: 0 },
  endReviewedDeadKm: { type: Number, default: 0 },
  endReady: { type: Boolean, default: false },
  endBusy: { type: Boolean, default: false },
  startOdo: { type: String, default: '' },
  closingOdo: { type: String, default: '' },
  shiftRevenue: { type: String, default: '' },
  reviewRevenue: { type: Object, default: () => ({}) },
  reviewKm: { type: Object, default: () => ({}) },
  reviewOperator: { type: Object, default: () => ({}) },
  tollTreatment: { type: String, default: 'INCLUDED' },
  parkingTreatment: { type: String, default: 'INCLUDED' },
  toll: { type: String, default: '' },
  parking: { type: String, default: '' },
  tripTollTotal: { type: Number, default: 0 },
  tripParkingTotal: { type: Number, default: 0 },
  money: { type: Function, required: true },
})
const emit = defineEmits(['action', 'focus-numeric', 'update:toll-treatment', 'update:parking-treatment'])
const submit = () => {
  const action = props.endStage === 'CLOSE' ? 'close-end'
    : props.endStage === 'RECONCILE' ? 'continue-reconcile'
    : props.endStage === 'REVIEW' ? 'review-complete'
    : props.endStage === 'CONFIRM' ? 'finish-end'
    : 'finish-ended'
  emit('action', action)
}
</script>

<template>
  <form class="form-card state-tone-warning" @submit.prevent="submit">
    <div class="form-head"><div><span class="eyebrow">GOING OFFLINE</span><h2>{{ endTitle }}</h2></div><button v-if="endStage==='CLOSE'" class="text-action" type="button" @click="emit('action','back-end')">Back</button></div>
    <template v-if="endStage==='CLOSE'">
      <div class="fact-line"><span>Shift started</span><strong>{{ startOdo || '—' }} km</strong></div>
      <label>Closing odometer<div class="input-unit"><input :value="closingOdo" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','closing-odo')" aria-label="Closing odometer" @click="emit('focus-numeric','closing-odo')"><b>km</b></div></label>
      <label>Total shift revenue<div class="input-unit"><b>₹</b><input :value="shiftRevenue" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','shift-revenue')" aria-label="Total shift revenue" @click="emit('focus-numeric','shift-revenue')"></div></label>
      <button type="submit" class="primary-action">CONTINUE</button>
    </template>
    <template v-else-if="endStage==='RECONCILE'">
      <div v-if="endMissing.length" class="exception-panel"><span class="eyebrow">OPTIONAL DETAIL</span><h3>Trip fares not entered</h3><p>You can continue. End Shift revenue remains authoritative.</p><div v-for="trip in endMissing" :key="trip.id" class="reconcile-row"><div><strong>{{ trip.operator }}</strong><span>{{ Number(trip.tripKm||0).toFixed(1) }} km</span></div><div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[trip.id]" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','review-revenue:' + trip.id)" aria-label="Trip revenue" @click="emit('focus-numeric','review-revenue:' + trip.id)"></div></div></div>
      <div v-else class="success-panel"><strong>ALL REVENUE CAPTURED</strong><span>No missing trip revenue exceptions.</span></div>
      <div class="fact-grid"><div><span>Shift revenue</span><strong>{{ money(shiftRevenue) }}</strong></div><div><span>Trip revenue</span><strong>{{ money(endPreview?.tripRevenue) }}</strong></div></div>
      <button type="submit" class="primary-action">CONTINUE</button>
    </template>
    <template v-else-if="endStage==='REVIEW'">
      <div class="fact-grid review"><div><span>Trips</span><strong>{{ endCompletedCount }}</strong></div><div><span>Total shift KM</span><strong>{{ endShiftKm.toFixed(1) }}</strong></div><div><span>Trip KM</span><strong>{{ endReviewedTripKm.toFixed(1) }}</strong></div><div><span>Dead KM</span><strong>{{ endReviewedDeadKm.toFixed(1) }}</strong></div><div><span>Revenue</span><strong>{{ money(shiftRevenue) }}</strong></div></div>
      <div v-if="endReviewedDeadKm < -0.000001" class="exception-panel"><strong>KM RECONCILIATION REQUIRED</strong><p>Trip KM exceeds total shift KM by {{ Math.abs(endReviewedDeadKm).toFixed(1) }} km.</p></div>
      <div class="expense-row">
        <div class="expense-trip-total"><span>Trip toll already recorded</span><strong>{{ money(tripTollTotal) }}</strong></div>
        <div class="expense-shift-capture">
          <label>Additional shift toll <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="toll" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','shift-toll')" aria-label="Additional shift toll" @click="emit('focus-numeric','shift-toll')"></div></label>
          <label class="check-row"><input :checked="tollTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:toll-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Additional toll paid separately</span></label>
        </div>
      </div>
      <div class="expense-row">
        <div class="expense-trip-total"><span>Trip parking already recorded</span><strong>{{ money(tripParkingTotal) }}</strong></div>
        <div class="expense-shift-capture">
          <label>Additional shift parking <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="parking" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','shift-parking')" aria-label="Additional shift parking" @click="emit('focus-numeric','shift-parking')"></div></label>
          <label class="check-row"><input :checked="parkingTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:parking-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Additional parking paid separately</span></label>
        </div>
      </div>
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
</template>
