<script setup>
const props = defineProps({
  endTitle: { type: String, default: 'Close shift' },
  endStage: { type: String, default: 'CLOSE' },
  endBusy: { type: Boolean, default: false },
  endLargeDistanceKm: { type: Number, default: 0 },
  largeDistanceConfirmedFor: { type: String, default: '' },
  largeDistanceIdentity: { type: String, default: '' },
  startOdo: { type: String, default: '' },
  closingOdo: { type: String, default: '' }
})
const emit = defineEmits(['action', 'focus-numeric', 'update:large-distance-confirmed-for'])
const submit = () => emit('action', props.endStage === 'ENDED' ? 'finish-ended' : 'close-end')
</script>

<template>
  <form class="form-card state-tone-warning end-shift-odometer-only" @submit.prevent="submit">
    <div class="form-head"><div><span class="eyebrow">GOING OFFLINE</span><h2>{{ endTitle }}</h2></div></div>
    <template v-if="endStage !== 'ENDED'">
      <div class="fact-line"><span>Shift started</span><strong>{{ startOdo || '—' }} km</strong></div>
      <label>Closing odometer<div class="input-unit"><input :value="closingOdo" type="text" inputmode="none" readonly autocomplete="off" @focus="emit('focus-numeric','closing-odo')" aria-label="Closing odometer" @click="emit('focus-numeric','closing-odo')"><b>km</b></div></label>
      <div v-if="endLargeDistanceKm > 500" class="exception-panel">
        <strong>LONG SHIFT DISTANCE — CONFIRM</strong>
        <p>This shift covers {{ endLargeDistanceKm.toFixed(1) }} km. Confirm the closing odometer before ending the shift.</p>
        <label class="check-row">
          <input type="checkbox" :checked="largeDistanceConfirmedFor === largeDistanceIdentity" @change="emit('update:large-distance-confirmed-for', $event.target.checked ? largeDistanceIdentity : '')">
          <span>I confirm the closing odometer and total distance are correct.</span>
        </label>
      </div>
      <button type="submit" class="primary-action" :disabled="endBusy || !closingOdo || (endLargeDistanceKm > 500 && largeDistanceConfirmedFor !== largeDistanceIdentity)">{{ endBusy ? 'ENDING SHIFT…' : 'OK — END SHIFT' }}</button>
    </template>
    <template v-else>
      <div class="completion-panel success"><span class="completion-mark" aria-hidden="true">✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div>
      <button type="submit" class="primary-action">OK</button>
    </template>
  </form>
</template>
