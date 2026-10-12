<script setup>
defineProps({
  fuelOdo: { type: String, default: '' },
  fuelPrice: { type: String, default: '' },
  fuelAmount: { type: String, default: '' },
  fuelPartial: { type: Boolean, default: false },
  fuelQty: { type: Object, default: () => ({ valid: false }) },
  fuelBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'focus-numeric', 'update:fuel-partial'])
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
        <input :value="fuelOdo" type="text" inputmode="none" readonly autocomplete="off" aria-label="Odometer" @focus="emit('focus-numeric', 'fuel-odo')" @click="emit('focus-numeric', 'fuel-odo')">
        <b>km</b>
      </div>
    </label>
    <label>Price / kg
      <div class="input-unit">
        <b>₹</b>
        <input :value="fuelPrice" type="text" inputmode="none" readonly autocomplete="off" aria-label="Price / kg" @focus="emit('focus-numeric', 'fuel-price')" @click="emit('focus-numeric', 'fuel-price')">
      </div>
    </label>
    <label>Amount
      <div class="input-unit">
        <b>₹</b>
        <input :value="fuelAmount" type="text" inputmode="none" readonly autocomplete="off" aria-label="Amount" @focus="emit('focus-numeric', 'fuel-amount')" @click="emit('focus-numeric', 'fuel-amount')">
      </div>
    </label>
    <div class="calculated-value fuel-calculated-value state-tone-info" aria-live="polite">
      <span>Quantity</span>
      <strong>{{ fuelQty.valid ? fuelQty.quantityKg.toFixed(2) + ' kg' : '—' }}</strong>
    </div>
    <button type="button" class="primary-action" :disabled="fuelBusy" @click="emit('action', 'save-fuel')">{{ fuelBusy ? 'SAVING…' : 'OK — SAVE FUEL' }}</button>
  </form>
</template>
