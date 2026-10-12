<script setup>
defineProps({
  fuelOdo: { type: String, default: '' },
  fuelPrice: { type: String, default: '' },
  fuelAmount: { type: String, default: '' },
  fuelPartial: { type: Boolean, default: false },
  fuelQty: { type: Object, default: () => ({ valid: false }) },
  fuelBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'update:fuel-partial'])
</script>

<template>
  <form class="work-fuel-form form-card state-tone-info focus-surface" @submit.prevent="emit('action', 'save-fuel')">
    <div class="fuel-form-close-row">
      <button class="text-action" type="button" aria-label="Close fuel form" @click="emit('action', 'close-fuel')">Close</button>
    </div>
    <label class="check-row">
      <input :checked="fuelPartial" type="checkbox" @change="emit('update:fuel-partial', $event.target.checked)">
      <span>Partial fill</span>
    </label>
    <label>Odometer
      <div class="input-unit">
        <input :value="fuelOdo" type="text" inputmode="none" readonly autocomplete="off" aria-label="Odometer" @focus="emit('action', 'focus-fuel-odo')" @click="emit('action', 'focus-fuel-odo')">
        <b>km</b>
      </div>
    </label>
    <label>Price / kg
      <div class="input-unit">
        <b>₹</b>
        <input :value="fuelPrice" type="text" inputmode="none" readonly autocomplete="off" aria-label="Price / kg" @focus="emit('action', 'focus-fuel-price')" @click="emit('action', 'focus-fuel-price')">
      </div>
    </label>
    <label>Amount
      <div class="input-unit">
        <b>₹</b>
        <input :value="fuelAmount" type="text" inputmode="none" readonly autocomplete="off" aria-label="Amount" @focus="emit('action', 'focus-fuel-amount')" @click="emit('action', 'focus-fuel-amount')">
      </div>
    </label>
    <div class="calculated-value fuel-calculated-value state-tone-info" aria-live="polite">
      <span>Quantity</span>
      <strong>{{ fuelQty.valid ? fuelQty.quantityKg.toFixed(2) + ' kg' : '—' }}</strong>
    </div>
    <button type="button" class="primary-action" :disabled="fuelBusy" @click="emit('action', 'save-fuel')">{{ fuelBusy ? 'SAVING…' : 'OK — SAVE FUEL' }}</button>
  </form>
</template>

<style scoped>
.work-fuel-form{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--kfe-ui-border);border-radius:16px;display:grid;gap:10px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text)}
.work-fuel-form label{display:grid;gap:5px;font-weight:700}
.work-fuel-form .input-unit{display:flex;align-items:center;gap:8px}
.work-fuel-form .input-unit input{width:100%;min-width:0;height:40px;min-height:40px;font-size:16px}
.work-fuel-form .check-row{display:flex;align-items:center;gap:10px}
.work-fuel-form .check-row input{width:22px;height:22px;min-height:22px}
.work-fuel-form .primary-action{min-height:44px;touch-action:manipulation;font:inherit;font-weight:800;background:var(--kfe-ui-accent);color:var(--kfe-ui-on-accent);border:1px solid var(--kfe-ui-accent);border-radius:10px}
.work-fuel-form .text-action{justify-self:end;background:transparent;color:var(--kfe-ui-text);border:0;font:inherit;min-height:32px}
.work-fuel-form .calculated-value{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:10px;background:var(--kfe-ui-surface-2);color:var(--kfe-ui-text)}
.work-fuel-form .calculated-value strong{font-variant-numeric:tabular-nums}
</style>
