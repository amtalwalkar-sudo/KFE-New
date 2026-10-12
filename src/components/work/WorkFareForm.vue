<script setup>
import { ref } from 'vue'
defineProps({
  fare: { type: String, default: '' },
  fareBusy: { type: Boolean, default: false },
  tripToll: { type: String, default: '' },
  tripParking: { type: String, default: '' },
  tripTollTreatment: { type: String, default: 'INCLUDED' },
  tripParkingTreatment: { type: String, default: 'INCLUDED' },
  showSaveAction: { type: Boolean, default: true },
})
const emit = defineEmits(['action', 'focus-numeric', 'dismiss-numeric', 'update:trip-toll-treatment', 'update:trip-parking-treatment'])
const tollDetailsOpen = ref(false)
const parkingDetailsOpen = ref(false)
const toggleOptional = kind => {
  const isToll = kind === 'toll'
  const opening = !(isToll ? tollDetailsOpen.value : parkingDetailsOpen.value)
  if (isToll) tollDetailsOpen.value = opening
  else parkingDetailsOpen.value = opening
  emit('dismiss-numeric')
}
</script>

<template>
  <form class="form-card state-tone-warning focus-surface" @submit.prevent="emit('action', 'save-fare')">
    <div class="form-head fare-form-head"><span class="eyebrow">TRIP COMPLETED</span><button class="text-action" type="button" @click="emit('action','skip-fare')">Skip</button></div>
    <label class="fare-main-field">Trip fare
      <div class="input-unit"><b>₹</b><input :value="fare" type="text" inputmode="none" readonly autocomplete="off" aria-label="Trip fare" @focus="emit('focus-numeric','fare')" @click="emit('focus-numeric','fare')"></div>
    </label>
    <div class="fare-optional-actions">
      <button type="button" class="optional-toggle" :aria-expanded="tollDetailsOpen" @click="toggleOptional('toll')">{{ tollDetailsOpen ? '− Toll' : '+ Toll' }}</button>
      <button type="button" class="optional-toggle" :aria-expanded="parkingDetailsOpen" @click="toggleOptional('parking')">{{ parkingDetailsOpen ? '− Parking' : '+ Parking' }}</button>
    </div>
    <div v-if="tollDetailsOpen" class="fare-optional-field">
      <label>Toll <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripToll" type="text" inputmode="none" readonly autocomplete="off" aria-label="Toll" @focus="emit('focus-numeric','trip-toll')" @click="emit('focus-numeric','trip-toll')"></div></label>
      <label class="check-row"><input aria-label="Toll was paid separately" :checked="tripTollTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:trip-toll-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Toll paid separately</span></label>
    </div>
    <div v-if="parkingDetailsOpen" class="fare-optional-field">
      <label>Parking <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripParking" type="text" inputmode="none" readonly autocomplete="off" aria-label="Parking" @focus="emit('focus-numeric','trip-parking')" @click="emit('focus-numeric','trip-parking')"></div></label>
      <label class="check-row"><input aria-label="Parking was paid separately" :checked="tripParkingTreatment==='EXCLUDED'" type="checkbox" @change="emit('update:trip-parking-treatment',$event.target.checked ? 'EXCLUDED' : 'INCLUDED')"><span>Parking paid separately</span></label>
    </div>
    <button v-if="showSaveAction" type="submit" class="primary-action" :disabled="fareBusy">{{ fareBusy ? 'SAVING…' : 'OK — SAVE TRIP' }}</button>
  </form>
</template>

<style scoped>
.fare-optional-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fare-optional-actions .optional-toggle{min-height:38px;border:1px dashed var(--kfe-ui-border);border-radius:10px;background:var(--kfe-ui-surface-2);color:var(--kfe-ui-text);font-weight:800}
.fare-optional-field{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:end;gap:8px;padding:6px 0;border-top:1px solid var(--kfe-ui-border)}
.fare-optional-field .check-row{font-size:.67rem;line-height:1.1}
.fare-optional-field .check-row input{width:18px!important;height:18px;min-height:18px!important}
@media(max-width:380px){.fare-optional-field{grid-template-columns:minmax(0,1fr);align-items:stretch}.fare-optional-field .check-row{min-height:36px}}
</style>
