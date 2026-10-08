<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Save' },
  showActions: { type: Boolean, default: true },
  autoOpenFirst: { type: Boolean, default: false },
  errors: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['submit', 'cancel', 'field-change'])

const fields = computed(() => props.fields ?? [])
const fieldRefs = ref({})

function setFieldRef(key, el) {
  if (el) fieldRefs.value[key] = el
}

function optionValue(option) {
  return option && typeof option === 'object' && 'value' in option ? option.value : option
}

function optionLabel(option) {
  return option && typeof option === 'object' && 'label' in option ? option.label : option
}

function keyboardFor(field) {
  if (field.type === 'number') {
    return field.step && Number(field.step) % 1 !== 0 ? 'decimal' : 'numeric'
  }
  const key = String(field.key || '').toLowerCase()
  if (key.includes('phone')) return 'tel'
  if (key.includes('email')) return 'email'
  return undefined
}

function valueFor(field) {
  const value = props.modelValue?.[field.key]
  return value !== undefined ? value : (field.defaultValue ?? '')
}

function hydrate() {
  for (const field of fields.value) {
    const el = fieldRefs.value[field.key]
    if (!el || document.activeElement === el) continue

    const value = valueFor(field)
    if (field.type === 'checkbox') el.checked = !!value
    else el.value = value ?? ''
  }
}

function readField(field) {
  const el = fieldRefs.value[field.key]
  if (!el) return valueFor(field)

  if (field.type === 'checkbox') return !!el.checked

  const raw = String(el.value ?? '').trim()
  if (field.type === 'number') return raw === '' ? '' : Number(raw)
  return el.value
}

function fieldChanged(field) {
  const value = readField(field)
  emit('field-change', { key: field.key, value })
}

function submit() {
  const values = {}
  for (const field of fields.value) values[field.key] = readField(field)
  emit('submit', values)
}

function focusNext(field) {
  const index = fields.value.findIndex(item => item.key === field.key)
  const next = fields.value.slice(index + 1).find(item => item.type !== 'checkbox')
  if (!next) return false
  nextTick(() => {
    const el = fieldRefs.value[next.key]
    if (el && !el.disabled) {
      el.focus()
      if (typeof el.select === 'function' && el.type === 'text') el.select()
    }
  })
  return true
}

function enterHint(field) {
  if (field.type === 'textarea') return 'enter'
  const index = fields.value.findIndex(item => item.key === field.key)
  const hasNext = fields.value.slice(index + 1).some(item => item.type !== 'checkbox')
  return hasNext ? 'next' : 'done'
}

function onEnter(field, event) {
  if (field.type === 'textarea' || event.isComposing) return
  event.preventDefault()
  if (!focusNext(field)) submit()
}

function onInput(field) {
  fieldChanged(field)
}

function onChange(field) {
  fieldChanged(field)
}

watch(() => props.modelValue, hydrate, { deep: true })
watch(() => props.fields, hydrate, { deep: true })

onMounted(async () => {
  await nextTick()
  hydrate()
  if (props.autoOpenFirst) {
    const first = fields.value.find(field => field.type !== 'checkbox')
    if (first) nextTick(() => fieldRefs.value[first.key]?.focus())
  }
})
</script>

<template>
<form class="admin-native-form kfe-contextual-form" novalidate @submit.prevent="submit">
  <div class="form-grid">
    <label
      v-for="field in fields"
      :key="field.key"
      class="form-field"
      :class="{ invalid: !!errors[field.key] }"
    >
      <span class="field-label">
        {{ field.label }}<strong v-if="field.required" aria-hidden="true"> *</strong>
      </span>

      <select
        v-if="field.type === 'select'"
        :ref="el => setFieldRef(field.key, el)"
        :disabled="busy"
        :required="field.required"
        :aria-label="field.label"
        @change="onChange(field)"
        @keydown.enter="onEnter(field, $event)"
      >
        <option value="">Select…</option>
        <option
          v-for="option in field.options || []"
          :key="optionValue(option)"
          :value="optionValue(option)"
        >
          {{ optionLabel(option) }}
        </option>
      </select>

      <input
        v-else-if="field.type === 'date' || field.type === 'datetime-local' || field.type === 'month'"
        :ref="el => setFieldRef(field.key, el)"
        :type="field.type"
        :disabled="busy"
        :required="field.required"
        :aria-label="field.label"
        :enterkeyhint="enterHint(field)"
        @change="onChange(field)"
        @keydown.enter="onEnter(field, $event)"
      >

      <textarea
        v-else-if="field.type === 'textarea'"
        :ref="el => setFieldRef(field.key, el)"
        :disabled="busy"
        :required="field.required"
        :aria-label="field.label"
        :placeholder="field.placeholder"
        enterkeyhint="enter"
        @input="onInput(field)"
      ></textarea>

      <input
        v-else-if="field.type === 'checkbox'"
        :ref="el => setFieldRef(field.key, el)"
        type="checkbox"
        :disabled="busy"
        :required="field.required"
        @change="onChange(field)"
      >

      <input
        v-else
        :ref="el => setFieldRef(field.key, el)"
        :type="field.type === 'number' ? 'number' : 'text'"
        :inputmode="keyboardFor(field)"
        :enterkeyhint="enterHint(field)"
        :aria-label="field.label"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :required="field.required"
        :disabled="busy"
        :placeholder="field.placeholder"
        :autocomplete="field.type === 'number' ? 'off' : 'on'"
        autocapitalize="off"
        @input="onInput(field)"
        @keydown.enter="onEnter(field, $event)"
      >

      <small v-if="errors[field.key]" class="form-error" role="alert">
        {{ errors[field.key] }}
      </small>
    </label>
  </div>

  <div v-if="showActions" class="form-actions">
    <button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">Cancel</button>
    <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Saving…' : submitLabel }}</button>
  </div>
</form>
</template>

<style scoped>
.admin-native-form{display:grid;gap:1rem;max-width:760px;margin-inline:auto}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.form-field{display:grid;gap:.4rem;min-width:0}
.field-label{font-weight:750;font-size:.8rem}
.form-field input,.form-field select,.form-field textarea{min-height:52px;width:100%;box-sizing:border-box;padding:.65rem .7rem;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm)}
.form-field textarea{min-height:100px;resize:vertical}
.form-field.invalid input,.form-field.invalid select,.form-field.invalid textarea{border-color:var(--kfe-danger)}
.form-error{color:var(--kfe-danger);font-size:.72rem}
.form-actions{display:flex;justify-content:flex-end;gap:.75rem;padding-top:.25rem;border-top:1px solid var(--kfe-border)}
.form-actions button{border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);padding:9px 14px;font-weight:800;cursor:pointer}
.form-actions .secondary{background:var(--kfe-surface);color:var(--kfe-text)}
.form-actions .primary{background:var(--kfe-text);color:var(--kfe-on-accent);border-color:var(--kfe-text)}
@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-actions button{flex:1}}
</style>
