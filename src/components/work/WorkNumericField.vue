<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  decimal: { type: Boolean, default: false },
  nextFieldId: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
  prefix: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'done'])
const open = ref(false)
const inputRef = ref(null)

function activate() {
  if (props.disabled) return
  open.value = true
  nextTick(() => inputRef.value?.focus({ preventScroll: true }))
}
function close() { open.value = false }
function append(digit) {
  if (props.disabled) return
  const current = String(props.modelValue ?? '')
  if (digit === '.' && !props.decimal) return
  if (digit === '.' && current.includes('.')) return
  if (digit === '.' && current === '') { emit('update:modelValue', '0.'); return }
  if (current === '0' && digit !== '.') { emit('update:modelValue', digit); return }
  emit('update:modelValue', current + digit)
}
function backspace() {
  const current = String(props.modelValue ?? '')
  emit('update:modelValue', current.slice(0, -1))
}
function clearValue() { emit('update:modelValue', '') }
function nextField() {
  close()
  if (!props.nextFieldId) return
  nextTick(() => document.getElementById(props.nextFieldId)?.focus({ preventScroll: true }))
}
function done() { close(); emit('done') }
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); close() }
}
onBeforeUnmount(() => { open.value = false })
</script>

<template>
  <div class="work-numeric-field">
    <div class="work-numeric-input-wrap">
      <span v-if="prefix" class="work-numeric-prefix" aria-hidden="true">{{ prefix }}</span>
      <input
        ref="inputRef"
        :value="modelValue"
        type="text"
        inputmode="none"
        readonly
        :disabled="disabled"
        :aria-label="ariaLabel || label"
        :aria-expanded="open"
        :aria-haspopup="open ? 'dialog' : undefined"
        autocomplete="off"
        @click="activate"
        @focus="activate"
        @keydown="onKeydown"
      >
      <span v-if="suffix" class="work-numeric-suffix">{{ suffix }}</span>
    </div>

    <div v-if="open" class="work-numeric-keypad" role="dialog" :aria-label="(label || ariaLabel || 'Number') + ' keypad'">
      <div class="work-numeric-keypad-head">
        <span>{{ label || ariaLabel || 'Number' }}</span>
        <strong>{{ modelValue === '' || modelValue == null ? '—' : modelValue }}<small v-if="suffix"> {{ suffix }}</small></strong>
        <button type="button" class="work-numeric-close" aria-label="Close keypad" @click="close">×</button>
      </div>
      <div class="work-numeric-grid">
        <button type="button" @click="append('1')">1</button><button type="button" @click="append('2')">2</button><button type="button" @click="append('3')">3</button>
        <button type="button" @click="append('4')">4</button><button type="button" @click="append('5')">5</button><button type="button" @click="append('6')">6</button>
        <button type="button" @click="append('7')">7</button><button type="button" @click="append('8')">8</button><button type="button" @click="append('9')">9</button>
        <button type="button" class="key-secondary" @click="clearValue">CLR</button><button type="button" @click="append('0')">0</button><button type="button" class="key-secondary" @click="backspace" aria-label="Backspace">⌫</button>
      </div>
      <div class="work-numeric-actions">
        <button v-if="decimal" type="button" class="key-secondary" @click="append('.')">.</button><span v-else></span>
        <button v-if="nextFieldId" type="button" class="key-next" @click="nextField">NEXT →</button>
        <button type="button" class="key-done" @click="done">DONE</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-numeric-field{position:relative;width:100%;min-width:0}
.work-numeric-input-wrap{position:relative;display:flex;align-items:center;width:100%}
.work-numeric-input-wrap input{width:100%;min-width:0}
.work-numeric-prefix{position:absolute;left:12px;z-index:1;font-weight:850;pointer-events:none}
.work-numeric-input-wrap input:has(+ .work-numeric-suffix){padding-right:48px}
.work-numeric-input-wrap:has(.work-numeric-prefix) input{padding-left:34px}
.work-numeric-suffix{position:absolute;right:12px;color:var(--kfe-muted-text);font-weight:800;pointer-events:none}
.work-numeric-keypad{position:fixed;z-index:1200;left:10px;right:10px;bottom:calc(var(--kfe-shell-nav,76px) + env(safe-area-inset-bottom,0px) + 8px);margin:auto;width:min(100% - 20px,520px);padding:10px;border:1px solid var(--kfe-ui-border);border-radius:18px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text);box-shadow:0 18px 48px color-mix(in srgb,var(--kfe-ui-text) 24%,transparent)}
.work-numeric-keypad-head{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:2px 2px 8px;font-size:.72rem;font-weight:850;color:var(--kfe-muted-text)}
.work-numeric-keypad-head strong{font-size:1rem;color:var(--kfe-ui-text);font-variant-numeric:tabular-nums}
.work-numeric-keypad-head small{font-size:.7rem}
.work-numeric-close{min-width:40px!important;min-height:40px!important;padding:0;border:1px solid var(--kfe-ui-border);border-radius:10px;background:transparent;color:var(--kfe-ui-text);font-size:1.4rem}
.work-numeric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.work-numeric-grid button,.work-numeric-actions button{min-height:46px;border:1px solid var(--kfe-ui-border);border-radius:11px;background:var(--kfe-ui-surface-2);color:var(--kfe-ui-text);font-size:1.05rem;font-weight:900}
.work-numeric-grid .key-secondary,.work-numeric-actions .key-secondary{font-size:.72rem}
.work-numeric-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px}
.work-numeric-actions .key-next{background:var(--kfe-ui-surface-2)}
.work-numeric-actions .key-done{background:var(--kfe-ui-accent);color:var(--kfe-on-accent)}
@media(max-width:480px){.work-numeric-keypad{left:8px;right:8px;width:auto;padding:8px}.work-numeric-grid{gap:5px}.work-numeric-grid button,.work-numeric-actions button{min-height:43px}}
</style>
