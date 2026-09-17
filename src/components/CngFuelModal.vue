<script setup>
import { ref, watch, onUnmounted } from 'vue'
const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close', 'save'])
const odometer = ref(''), amount = ref(''), kg = ref(''), isFullTank = ref(true)
const MAX_CNG_KG = 15
watch(() => props.isOpen, newVal => { document.body.style.overflow = newVal ? 'hidden' : ''; document.body.style.position = newVal ? 'fixed' : ''; document.body.style.width = newVal ? '100%' : '' }, { immediate: true })
onUnmounted(() => { document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = '' })
const handleSave = () => {
  if (!odometer.value || !amount.value) return alert('Please fill in Odometer and Amount')
  const enteredKg = kg.value ? Number(kg.value) : 0
  if (enteredKg > MAX_CNG_KG) return alert(`CNG quantity cannot exceed ${MAX_CNG_KG} kg (tank capacity).`)
  emit('save', { odometer: Number(odometer.value), amount: Number(amount.value), kg: enteredKg, isFullTank: isFullTank.value })
  odometer.value = ''; amount.value = ''; kg.value = ''; isFullTank.value = true
}
</script>
<template>
  <Teleport to="body"><div v-if="isOpen" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px" @click.self="emit('close')">
    <div style="background:white;border-radius:12px;width:100%;max-width:450px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between"><h3 style="margin:0">⛽ Add CNG Fuel Log</h3><button @click="emit('close')">✕</button></div>
      <div style="padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
        <label>Odometer Reading (km) *<input v-model="odometer" type="number" style="width:100%"></label>
        <label>Amount Paid (₹) *<input v-model="amount" type="number" style="width:100%"></label>
        <label>CNG Quantity (kg) - Optional<input v-model="kg" type="number" min="0" max="15" step="0.01" style="width:100%"><small>Maximum tank capacity: 15 kg</small></label>
        <label style="display:flex;gap:8px;align-items:center"><input v-model="isFullTank" type="checkbox"> Full tank (default)</label>
        <small v-if="!isFullTank">Partial fill is recorded but excluded from fuel cost/km calculations.</small>
      </div>
      <div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px"><button style="flex:1" @click="emit('close')">Cancel</button><button style="flex:1" @click="handleSave">Save Fuel Log</button></div>
    </div>
  </div></Teleport>
</template>
