<script setup>
import { computed, nextTick, onMounted } from 'vue'
import { FormDraftService } from '../../application/forms/formDraftService.js'
const props = defineProps({
  fields: { type: Array, required: true }, modelValue: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false }, submitLabel: { type: String, default: 'Save record' },
  showActions: { type: Boolean, default: true }, autoOpenFirst: { type: Boolean, default: false },
  errors: { type: Object, default: () => ({}) }, draftIdentity: { type: Object, default: null }
})
const emit = defineEmits(['submit', 'cancel', 'field-change', 'draft-restored', 'draft-error'])
let draftWriteQueue = Promise.resolve()
let restoringDraft = false
const fields = computed(() => (props.fields || []).filter(f => f && !f.hidden))
const sections = computed(() => {
  const groups = []
  for (const field of fields.value) {
    const name = field.section || 'Details'
    let group = groups.find(g => g.name === name)
    if (!group) groups.push(group = { name, fields: [] })
    group.fields.push(field)
  }
  return groups
})
const requiredCount = computed(() => fields.value.filter(f => f.required).length)
const editableFields = computed(() => fields.value.filter(f => f.type !== 'checkbox'))
const enterKeyHint = field => {
  if (field.type === 'textarea') return 'enter'
  const index = editableFields.value.findIndex(item => item.key === field.key)
  return index >= 0 && index < editableFields.value.length - 1 ? 'next' : 'done'
}
const value = field => props.modelValue?.[field.key] ?? field.defaultValue ?? ''
const options = field => (field.options || []).map(o => typeof o === 'object' ? o : ({ value: o, label: o }))
function normalizeValue(field, raw) {
  if (field.type === 'checkbox') return !!raw
  if (field.type === 'number') return raw === '' || raw == null ? '' : Number(raw)
  return raw ?? ''
}
function changed(field, raw) {
  // Keep the exact text while the user is typing; normalize numeric values only at submit.
  const nextValue = field.type === 'checkbox' ? !!raw : (raw ?? '')
  emit('field-change', { key: field.key, value: nextValue })
  if (restoringDraft || !props.draftIdentity) return
  const values = { ...collect(), [field.key]: nextValue }
  draftWriteQueue = draftWriteQueue.then(() => FormDraftService.save(props.draftIdentity, values))
    .catch(error => { emit('draft-error', error); return null })
}
async function restoreDraft() {
  if (!props.draftIdentity) return
  try {
    const record = await FormDraftService.get(props.draftIdentity)
    if (!record?.values) return
    restoringDraft = true
    for (const field of fields.value) {
      if (record.values[field.key] !== undefined) emit('field-change', { key: field.key, value: normalizeValue(field, record.values[field.key]) })
    }
    await nextTick()
    emit('draft-restored', structuredClone(record.values))
  } catch (error) { emit('draft-error', error) }
  finally { restoringDraft = false }
}
async function submitForm() {
  await draftWriteQueue
  await nextTick()
  emit('submit', collect())
}
async function cancelForm() {
  if (props.draftIdentity) {
    const confirmed = typeof confirm === 'function' && confirm('Discard this unfinished form?')
    if (!confirmed) return
    try { await draftWriteQueue; await FormDraftService.clear(props.draftIdentity, { confirmedDiscard: true }) }
    catch (error) { emit('draft-error', error); return }
  }
  emit('cancel')
}
function collect(overrides = {}) {
  const result = {}
  for (const field of props.fields || []) {
    if (field.hidden) {
      const old = props.modelValue?.[field.key]
      if (old !== undefined && old !== null && old !== '') result[field.key] = old
      else if (field.defaultValue !== undefined) result[field.key] = field.defaultValue
    } else {
      const raw = Object.prototype.hasOwnProperty.call(overrides, field.key) ? overrides[field.key] : value(field)
      result[field.key] = normalizeValue(field, raw)
    }
  }
  return result
}
function inputType(field) {
  if (field.type === 'date' || field.type === 'month' || field.type === 'number' || field.type === 'select') return field.type
  if (field.inputMode === 'tel') return 'tel'
  return 'text'
}
onMounted(async () => {
  await restoreDraft()
  if (props.autoOpenFirst) {
    await nextTick()
    document.querySelector('.admin-source-form')?.querySelector('input:not([type="checkbox"]),select,textarea')?.focus()
  }
})
</script>

<template>
  <form class="admin-source-form" data-form-type="admin-source-record" aria-label="Admin source record entry" novalidate @submit.prevent="submitForm">
    <header class="source-form-heading">
      <div><span class="source-kicker">BUSINESS RECORD</span><h2>Record details</h2></div>
      <span v-if="requiredCount" class="source-required"><b>*</b> Required</span>
      <p>Enter source facts only. Calculated values are handled by KFE.</p>
    </header>
    <section v-for="(section, index) in sections" :key="section.name" class="source-form-section">
      <div class="source-section-heading"><span class="source-section-index">{{ String(index + 1).padStart(2, '0') }}</span><div><h3>{{ section.name }}</h3><p>{{ section.fields.length }} {{ section.fields.length === 1 ? 'field' : 'fields' }}</p></div></div>
      <div class="source-field-grid">
        <label v-for="field in section.fields" :key="field.key" class="source-field" :class="{ 'source-field-wide': field.wide || field.type === 'textarea', 'source-field-invalid': errors[field.key] }">
          <span class="source-field-label">{{ field.label }} <b v-if="field.required">*</b></span>
          <small v-if="field.help" class="source-field-help">{{ field.help }}</small>
          <select v-if="field.type === 'select'" :value="value(field)"  :required="field.required" :disabled="busy" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `admin-error-${field.key}` : undefined" @change="changed(field, $event.target.value)">
            <option value="">Choose {{ field.label.toLowerCase() }}</option>
            <option v-for="option in options(field)" :key="String(option.value)" :value="option.value">{{ option.label }}</option>
          </select>
          <textarea v-else-if="field.type === 'textarea'" :value="value(field)" :required="field.required" :disabled="busy" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `admin-error-${field.key}` : undefined" :placeholder="field.placeholder || 'Add details (optional)'" rows="3" @input="changed(field, $event.target.value)"></textarea>
          <span v-else-if="field.type === 'checkbox'" class="source-toggle"><input type="checkbox" :checked="!!value(field)" :disabled="busy" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `admin-error-${field.key}` : undefined" @change="changed(field, $event.target.checked)"><span>{{ field.toggleLabel || field.label }}</span></span>
          <input v-else :value="value(field)" :type="inputType(field)" :inputmode="field.type === 'number' ? (field.step && Number(field.step) % 1 !== 0 ? 'decimal' : 'numeric') : field.inputMode" :min="field.min" :max="field.max" :step="field.step" :required="field.required" :disabled="busy" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `admin-error-${field.key}` : undefined" :placeholder="field.placeholder || (field.type === 'number' ? '0' : '')" :autocomplete="field.type === 'number' ? 'off' : 'on'" :enterkeyhint="enterKeyHint(field)" @input="changed(field, $event.target.value)">
          <small v-if="errors[field.key]" :id="`admin-error-${field.key}`" class="source-field-error" role="alert">{{ Array.isArray(errors[field.key]) ? errors[field.key].join(' ') : errors[field.key] }}</small>
        </label>
      </div>
    </section>
    <footer v-if="showActions" class="source-form-actions">
      <button type="button" class="source-cancel" :disabled="busy" @click="cancelForm">Cancel</button>
      <button type="submit" class="source-save" :disabled="busy">{{ busy ? 'Saving…' : submitLabel }} <span aria-hidden="true">→</span></button>
    </footer>
  </form>
</template>

<style scoped>
.admin-source-form{display:grid;gap:1rem;width:100%;max-width:820px;margin-inline:auto;color:var(--kfe-text)}
.source-form-heading{display:grid;grid-template-columns:1fr auto;gap:.35rem .8rem;padding:.2rem .1rem .85rem;border-bottom:1px solid var(--kfe-border)}
.source-kicker{font-size:.66rem;letter-spacing:.14em;font-weight:900;color:var(--kfe-text-muted)}
.source-form-heading h2{font-size:1.12rem;line-height:1.25;margin:.25rem 0 0;font-weight:900}
.source-form-heading p{grid-column:1/-1;font-size:.82rem;line-height:1.45;color:var(--kfe-text-muted);margin:0}
.source-required{font-size:.74rem;color:var(--kfe-text-muted);align-self:center}.source-required b,.source-field-label b{color:var(--kfe-danger)}
.source-form-section{min-width:0;border:1px solid var(--kfe-border);background:var(--kfe-surface);border-radius:18px;padding:1rem}
.source-section-heading{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
.source-section-index{display:grid;place-items:center;width:37px;height:37px;border-radius:12px;background:var(--kfe-surface-raised,var(--kfe-bg));font-size:.74rem;font-weight:900;color:var(--kfe-text-muted)}
.source-section-heading h3{font-size:.91rem;font-weight:850;margin:0}.source-section-heading p{font-size:.72rem;color:var(--kfe-text-muted);margin:.15rem 0 0}
.source-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem .85rem}
.source-field{display:grid;align-content:start;gap:.4rem;min-width:0}.source-field-wide{grid-column:1/-1}
.source-field-label{font-size:.79rem;line-height:1.35;font-weight:800}.source-field-help{font-size:.72rem;line-height:1.4;color:var(--kfe-text-muted)}
.source-field input:not([type=checkbox]),.source-field select,.source-field textarea{box-sizing:border-box;width:100%;min-width:0;min-height:52px;border:1px solid var(--kfe-border-strong);border-radius:12px;background:var(--kfe-surface-raised,var(--kfe-bg));color:var(--kfe-text);padding:.72rem .8rem;font:inherit;font-size:.93rem;outline:none}
.source-field textarea{min-height:92px;resize:vertical}.source-field input:focus,.source-field select:focus,.source-field textarea:focus{border-color:var(--kfe-accent,var(--kfe-text));box-shadow:0 0 0 3px color-mix(in srgb,var(--kfe-accent,var(--kfe-text)) 17%,transparent)}
.source-field-invalid input,.source-field-invalid select,.source-field-invalid textarea{border-color:var(--kfe-danger)}.source-field-error{color:var(--kfe-danger);font-size:.73rem;font-weight:700}
.source-toggle{display:flex;align-items:center;gap:.7rem;min-height:52px;font-size:.86rem;font-weight:750}.source-toggle input{width:22px;height:22px;accent-color:var(--kfe-accent,var(--kfe-text))}
.source-form-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1.3fr;gap:.7rem;padding:.8rem 0 max(.4rem,env(safe-area-inset-bottom));background:var(--kfe-bg);border-top:1px solid var(--kfe-border);z-index:2}
.source-form-actions button{min-height:50px;border-radius:13px;padding:.7rem 1rem;font:inherit;font-weight:850;cursor:pointer}.source-cancel{background:var(--kfe-surface);border:1px solid var(--kfe-border-strong);color:var(--kfe-text)}.source-save{display:flex;align-items:center;justify-content:center;gap:.6rem;background:var(--kfe-text);border:1px solid var(--kfe-text);color:var(--kfe-on-accent,#fff)}.source-form-actions button:disabled{opacity:.55}
@media(max-width:600px){.source-form-section{padding:.8rem}.source-field-grid{grid-template-columns:minmax(0,1fr)}.source-field-wide{grid-column:auto}.source-form-actions{grid-template-columns:1fr 1.2fr}}
@media(prefers-reduced-motion:reduce){.admin-source-form *{transition:none!important}}
</style>
