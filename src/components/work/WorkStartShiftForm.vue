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

<style scoped>
.gap-panel{display:grid;gap:10px;padding:12px;border:1px solid var(--kfe-ui-border);border-radius:12px;background:var(--kfe-ui-surface-2);color:var(--kfe-ui-text)}
.gap-panel .eyebrow{color:var(--kfe-ui-muted-strong)}
.gap-panel strong{color:var(--kfe-ui-text);font-size:1.15rem}
.gap-panel p{margin:4px 0 0;color:var(--kfe-muted-text)}
.gap-panel .choice-row button{background:var(--kfe-ui-surface);color:var(--kfe-ui-text);border:1px solid var(--kfe-ui-input-border);border-radius:10px;font-weight:800}
.gap-panel .choice-row button.selected{background:var(--kfe-ui-accent);color:var(--kfe-ui-on-accent);border-color:var(--kfe-ui-accent)}
.gap-panel .choice-row button:focus-visible{outline:3px solid var(--kfe-ui-focus);outline-offset:2px}
</style>
