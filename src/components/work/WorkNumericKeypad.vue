<script setup>
import { nextTick } from 'vue'

const props = defineProps({
  activeNumeric: { type: Object, default: null },
  type: { type: String, required: true },
  fareBusy: { type: Boolean, default: false }
})
const emit = defineEmits(['update-value', 'focus-field', 'dismiss', 'suppress-focus', 'submit'])

const numericNext = {
  fare: 'trip-toll',
  'trip-toll': 'trip-parking',
  'fuel-odo': 'fuel-price',
  'fuel-price': 'fuel-amount'
}
const finalFields = new Set(['fare', 'trip-parking', 'cancel-fare'])
const numericLabels = {
  'start-odo': 'Current odometer',
  fare: 'Trip fare',
  'trip-toll': 'Toll',
  'trip-parking': 'Parking',
  'cancel-fare': 'Cancellation fee',
  'fuel-odo': 'Odometer',
  'fuel-price': 'Price / kg',
  'fuel-amount': 'Amount',
  'closing-odo': 'Closing odometer'
}
const numericLabel = name => {
  if (numericLabels[name]) return numericLabels[name]
  if (name.startsWith('review-revenue:')) return 'Trip revenue'
  if (name.startsWith('review-km:')) return 'Trip KM'
  return name.replace(/[-:]/g, ' ')
}

async function press(token) {
  const field = props.activeNumeric
  if (!field || typeof field !== 'object') {
    emit('dismiss')
    return
  }

  let next = field.value
  if (token === 'CLEAR') next = ''
  else if (token === 'BACK') next = next.slice(0, -1)
  else if (token === '.' && (!field.decimal || next.includes('.'))) return
  else if (token === '.' && next === '') next = '0.'
  else if (token !== 'DONE' && token !== 'NEXT') next = next === '0' ? token : next + token

  if (token === 'NEXT') {
    const nextName = numericNext[field.name]
    if (nextName) emit('focus-field', nextName)
    else emit('dismiss')
    return
  }
  if (token === 'DONE') {
    if (typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    emit('suppress-focus')
    emit('dismiss')
    await nextTick()
    if (finalFields.has(field.name)) emit('submit')
    return
  }
  emit('update-value', { name: field.name, value: next })
}
</script>

<template>
  <div v-if="activeNumeric" class="kfe-work-number-pad" aria-label="KFE intelligent numeric keypad">
    <div class="kfe-work-number-pad__display">
      <span>{{ numericLabel(activeNumeric.name) }}</span>
      <strong>{{ activeNumeric.value || '0' }}</strong>
    </div>
    <div class="kfe-work-number-pad__grid">
      <button v-for="key in ['1','2','3','4','5','6','7','8','9','CLEAR','0','BACK']" :key="key" type="button" @click="press(key)">{{ key === 'CLEAR' ? 'CLR' : key === 'BACK' ? '⌫' : key }}</button>
    </div>
    <div class="kfe-work-number-pad__actions" :class="{ 'fare-keypad-actions': type === 'fare' }">
      <button v-if="activeNumeric.decimal" type="button" class="decimal-key" @click="press('.')">.</button>
      <span v-else-if="type !== 'fare'"></span>
      <template v-if="type === 'fare'">
        <button type="button" class="done fare-save-action" :disabled="fareBusy" @click="emit('submit')">{{ fareBusy ? 'SAVING…' : 'OK' }}</button>
      </template>
      <template v-else>
        <button v-if="numericNext[activeNumeric.name]" type="button" @click="press('NEXT')">NEXT →</button>
        <button type="button" class="done" @click="press('DONE')">DONE</button>
      </template>
    </div>
  </div>
</template>
