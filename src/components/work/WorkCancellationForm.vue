<script setup>
defineProps({
  cancelReason: { type: String, default: '' },
  cancelFare: { type: String, default: '' },
  cancelBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'focus-numeric', 'update:cancel-reason'])
</script>

<template>
  <form class="form-card state-tone-warning focus-surface" @submit.prevent="emit('action', 'save-cancel')">
    <div class="form-head"><div><span class="eyebrow">CANCELLATION</span><strong>CAPTURE CANCELLATION</strong></div><button class="text-action" type="button" @click="emit('action','back-cancel')">Back</button></div>
    <div class="choice-field">
      <span class="field-label">Cancellation reason</span>
      <div class="choice-row cancellation-reasons">
        <button type="button" :class="{selected:cancelReason==='PASSENGER'}" @click="emit('update:cancel-reason','PASSENGER')">Passenger cancellation</button>
        <button type="button" :class="{selected:cancelReason==='DRIVER'}" @click="emit('update:cancel-reason','DRIVER')">Driver cancellation</button>
      </div>
    </div>
    <label>Cancellation fee (optional)
      <div class="input-unit"><b>₹</b><input :value="cancelFare" type="text" inputmode="none" readonly autocomplete="off" aria-label="Cancellation fee" @focus="emit('focus-numeric','cancel-fare')" @click="emit('focus-numeric','cancel-fare')"></div>
    </label>
    <button type="submit" class="primary-action" :disabled="cancelBusy">{{ cancelBusy ? 'SAVING…' : 'OK — CONFIRM CANCELLATION' }}</button>
  </form>
</template>
