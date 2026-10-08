<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Save record' },
  showActions: { type: Boolean, default: true },
  autoOpenFirst: { type: Boolean, default: false },
  errors: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['submit', 'cancel', 'field-change'])
const fieldRefs = ref({})
const fields = computed(() => (props.fields ?? []).filter(Boolean))
const groups = computed(() => {
  const result = []
  for (const field of fields.value) {
    const title = field.section || 'Record details'
    let group = result.find(item => item.title === title)
    if (!group) { group = { title, fields: [] }; result.push(group) }
    group.fields.push(field)
  }
  return result
})
const requiredCount = computed(() => fields.value.filter(field => field.required).length)

function setFieldRef(key, el) {
  if (el) fieldRefs.value[key] = el
  else delete fieldRefs.value[key]
}
function optionValue(option) {
  return option && typeof option === 'object' && 'value' in option ? option.value : option
}
function optionLabel(option) {
  return option && typeof option === 'object' && 'label' in option ? option.label : option
}
function keyboardFor(field) {
  if (field.type === 'number') return field.step && Number(field.step) % 1 !== 0 ? 'decimal' : 'numeric'
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
  emit('field-change', { key: field.key, value: readField(field) })
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
  return fields.value.slice(index + 1).some(item => item.type !== 'checkbox') ? 'next' : 'done'
}
function onEnter(field, event) {
  if (field.type === 'textarea' || event.isComposing) return
  event.preventDefault()
  if (!focusNext(field)) submit()
}
function onInput(field) { fieldChanged(field) }
function onChange(field) { fieldChanged(field) }

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
<form class="admin-record-form kfe-contextual-form" data-form-type="admin-record" novalidate @submit.prevent="submit">
  <header class="record-form-intro">
    <span class="form-eyebrow">SOURCE RECORD</span>
    <span class="form-guidance">Enter only known business facts. KFE calculates derived values.</span>
    <span class="form-required" v-if="requiredCount"><strong>*</strong> Required fields</span>
  </header>

  <section v-for="group in groups" :key="group.title" class="record-form-section">
    <div class="section-heading">
      <span class="section-marker" aria-hidden="true"></span>
      <h3>{{ group.title }}</h3>
      <span class="section-count">{{ group.fields.length }}</span>
    </div>
    <div class="record-field-grid">
      <label
        v-for="field in group.fields"
        :key="field.key"
        class="record-field"
        :class="[{ invalid: !!errors[field.key] }, 'field-' + field.type, { 'field-wide': field.type === 'textarea' || field.wide }]"
      >
        <span class="record-field-label">
          {{ field.label }}<strong v-if="field.required" aria-hidden="true"> *</strong>
        </span>
        <span v-if="field.help" class="record-field-help">{{ field.help }}</span>

        <select
          v-if="field.type === 'select'"
          :ref="el => setFieldRef(field.key, el)"
          :disabled="busy"
          :required="field.required"
          :aria-label="field.label"
          @change="onChange(field)"
          @keydown.enter="onEnter(field, $event)"
        >
          <option value="">Choose {{ field.label.toLowerCase() }}…</option>
          <option v-for="option in field.options || []" :key="optionValue(option)" :value="optionValue(option)">
            {{ optionLabel(option) }}
          </option>
        </select>

        <input
          v-else-if="['date', 'datetime-local', 'month'].includes(field.type)"
          :ref="el => setFieldRef(field.key, el)"
          :type="field.type"
          :disabled="busy"
          :required="field.required"
          :aria-label="field.label"
          :enterkeyhint="enterHint(field)"
          @input="onInput(field)"
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

        <span v-else-if="field.type === 'checkbox'" class="record-switch-row">
          <input
            :ref="el => setFieldRef(field.key, el)"
            type="checkbox"
            :disabled="busy"
            :required="field.required"
            @change="onChange(field)"
          >
          <span class="record-switch" aria-hidden="true"></span>
          <span class="record-switch-copy">{{ field.toggleLabel || (valueFor(field) ? 'Enabled' : 'Disabled') }}</span>
        </span>

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

        <small v-if="errors[field.key]" class="record-field-error" role="alert">{{ errors[field.key] }}</small>
      </label>
    </div>
  </section>

  <footer v-if="showActions" class="record-form-actions">
    <button type="button" class="record-cancel" :disabled="busy" @click="emit('cancel')">Cancel</button>
    <button type="submit" class="record-save" :disabled="busy">
      <span v-if="!busy" aria-hidden="true">✓</span>{{ busy ? 'Saving…' : submitLabel }}
    </button>
  </footer>
</form>
</template>

<style scoped>
.admin-record-form{display:grid;gap:1rem;width:100%;max-width:820px;margin-inline:auto;color:var(--kfe-text)}
.record-form-intro{display:grid;grid-template-columns:1fr auto;gap:.35rem .8rem;align-items:center;padding:.2rem .15rem .8rem;border-bottom:1px solid var(--kfe-border)}
.form-eyebrow{font-size:.67rem;letter-spacing:.13em;font-weight:900;color:var(--kfe-text-muted)}
.form-guidance{grid-column:1/-1;font-size:.82rem;line-height:1.45;color:var(--kfe-text-muted)}
.form-required{grid-column:2;grid-row:1;font-size:.72rem;color:var(--kfe-text-muted);white-space:nowrap}
.form-required strong,.record-field-label strong{color:var(--kfe-danger)}
.record-form-section{min-width:0;border:1px solid var(--kfe-border);background:var(--kfe-surface);border-radius:18px;padding:1rem;box-shadow:0 5px 18px rgb(0 0 0 / .035)}
.section-heading{display:flex;align-items:center;gap:.6rem;margin-bottom:.85rem}
.section-marker{width:7px;height:22px;border-radius:9px;background:var(--kfe-accent,var(--kfe-text));flex:none}
.section-heading h3{font-size:.9rem;font-weight:850;margin:0;letter-spacing:.01em}
.section-count{margin-left:auto;display:grid;place-items:center;min-width:25px;height:25px;padding:0 .35rem;border-radius:999px;background:var(--kfe-surface-raised,var(--kfe-bg));color:var(--kfe-text-muted);font-size:.7rem;font-weight:800}
.record-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem}
.record-field{display:grid;align-content:start;gap:.42rem;min-width:0}
.record-field-label{font-size:.79rem;line-height:1.3;font-weight:800}
.record-field-help{font-size:.73rem;color:var(--kfe-text-muted);line-height:1.4}
.record-field input:not([type=checkbox]),.record-field select,.record-field textarea{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:52px;border:1px solid var(--kfe-border-strong);border-radius:12px;background:var(--kfe-surface-raised,var(--kfe-bg));color:var(--kfe-text);padding:.72rem .8rem;font:inherit;font-size:.93rem;outline:none;transition:border-color .15s,box-shadow .15s}
.record-field textarea{min-height:104px;resize:vertical}
.record-field input:focus,.record-field select:focus,.record-field textarea:focus{border-color:var(--kfe-accent,var(--kfe-text));box-shadow:0 0 0 3px color-mix(in srgb,var(--kfe-accent,var(--kfe-text)) 17%,transparent)}
.record-field.invalid input,.record-field.invalid select,.record-field.invalid textarea{border-color:var(--kfe-danger)}
.record-field-error{font-size:.73rem;color:var(--kfe-danger);font-weight:650}
.field-wide{grid-column:1/-1}
.record-switch-row{display:flex;align-items:center;gap:.65rem;min-height:52px;cursor:pointer}
.record-switch-row input{position:absolute;opacity:0;width:1px;height:1px}
.record-switch{position:relative;width:45px;height:27px;border-radius:999px;background:var(--kfe-border-strong);transition:background .15s;flex:none}
.record-switch:after{content:'';position:absolute;width:21px;height:21px;top:3px;left:3px;border-radius:50%;background:white;box-shadow:0 1px 4px rgb(0 0 0 / .2);transition:transform .15s}
.record-switch-row input:checked+.record-switch{background:var(--kfe-accent,var(--kfe-text))}
.record-switch-row input:checked+.record-switch:after{transform:translateX(18px)}
.record-switch-row input:focus-visible+.record-switch{outline:3px solid var(--kfe-accent,var(--kfe-text));outline-offset:3px}
.record-switch-copy{font-size:.86rem;font-weight:750}
.record-form-actions{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:.65rem;padding:.8rem 0 max(.4rem,env(safe-area-inset-bottom));background:var(--kfe-bg);border-top:1px solid var(--kfe-border);z-index:2}
.record-form-actions button{min-height:50px;border-radius:13px;padding:.75rem 1.1rem;font:inherit;font-weight:850;cursor:pointer}
.record-cancel{background:var(--kfe-surface);border:1px solid var(--kfe-border-strong);color:var(--kfe-text)}
.record-save{display:flex;align-items:center;justify-content:center;gap:.45rem;background:var(--kfe-text);border:1px solid var(--kfe-text);color:var(--kfe-on-accent,#fff);min-width:145px}
.record-form-actions button:disabled{opacity:.55;cursor:wait}
@media(max-width:600px){.record-form-section{padding:.8rem;border-radius:15px}.record-field-grid{grid-template-columns:minmax(0,1fr)}.field-wide{grid-column:auto}.record-form-intro{grid-template-columns:1fr}.form-required{grid-column:1;grid-row:auto}.record-form-actions{display:grid;grid-template-columns:1fr 1.25fr}.record-form-actions button{padding-inline:.7rem}}
@media(prefers-reduced-motion:reduce){.admin-record-form *{transition:none!important}}
</style>
