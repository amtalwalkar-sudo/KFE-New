<script setup>
import { ref } from 'vue'
defineProps({
  fare: { type: String, default: '' },
  fareBusy: { type: Boolean, default: false },
  tripToll: { type: String, default: '' },
  tripParking: { type: String, default: '' },
  showSaveAction: { type: Boolean, default: true },
})
const emit = defineEmits(['action', 'focus-numeric', 'dismiss-numeric'])
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
    </div>
    <div v-if="parkingDetailsOpen" class="fare-optional-field">
      <label>Parking <span class="optional-label">optional</span><div class="input-unit"><b>₹</b><input :value="tripParking" type="text" inputmode="none" readonly autocomplete="off" aria-label="Parking" @focus="emit('focus-numeric','trip-parking')" @click="emit('focus-numeric','trip-parking')"></div></label>
    </div>
    <button v-if="showSaveAction" type="submit" class="primary-action" :disabled="fareBusy">{{ fareBusy ? 'SAVING…' : 'OK — SAVE TRIP' }}</button>
  </form>
</template>
