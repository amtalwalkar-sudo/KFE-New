<script setup>
const props = defineProps({
  startOdo: { type: String, default: '' },
  startAck: { type: Boolean, default: false },
  gapChoice: { type: String, default: '' },
  gapKm: { type: Number, default: 0 },
  startBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'focus-numeric', 'update:start-ack', 'update:gap-choice'])
const submit = () => emit('action', { name: 'submit-start', startOdo: props.startOdo, startAck: props.startAck === true })
</script>

<template>
  <form class="form-card state-tone-warning" @submit.prevent="submit">
    <div class="form-head">
      <div><span class="eyebrow">START SHIFT</span><h2>Confirm shift start</h2></div>
      <button class="text-action" type="button" @click="emit('action', 'back-start')">Back</button>
    </div>
    <label for="start-shift-odometer">Current vehicle odometer</label>
    <div class="input-unit">
      <input id="start-shift-odometer" :value="startOdo" type="text" inputmode="none" readonly autocomplete="off" aria-label="Current vehicle odometer" @focus="emit('focus-numeric', 'start-odo')" @click="emit('focus-numeric', 'start-odo')">
      <b>km</b>
    </div>
    <label class="check-row">
      <input type="checkbox" :checked="startAck" :disabled="!startOdo" aria-label="Confirm current vehicle odometer" @change="emit('update:start-ack', $event.target.checked)">
      <span>I confirm this is the current odometer.</span>
    </label>
    <div v-if="gapKm > 0" class="gap-panel">
      <div><span class="eyebrow">ODOMETER GAP</span><strong>{{ gapKm }} km</strong><p>Classify the full gap.</p></div>
      <div class="choice-row">
        <button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="emit('update:gap-choice', 'PERSONAL')">Personal KM</button>
        <button type="button" :class="{selected:gapChoice==='DEAD'}" @click="emit('update:gap-choice', 'DEAD')">Dead KM</button>
      </div>
    </div>
    <button type="submit" class="primary-action" :disabled="startBusy">{{ startBusy ? 'STARTING…' : 'CONFIRM & GO ONLINE' }}</button>
  </form>
</template>

