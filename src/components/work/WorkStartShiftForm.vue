<script setup>
const props = defineProps({
  startOdo: { type: String, default: '' },
  startAck: { type: Boolean, default: false },
  startBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'focus-numeric', 'update:start-ack'])
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
    <button type="submit" class="primary-action" :disabled="startBusy">{{ startBusy ? 'STARTING…' : 'CONFIRM & GO ONLINE' }}</button>
  </form>
</template>

