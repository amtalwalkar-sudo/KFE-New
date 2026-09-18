<script setup>
defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: () => `input-${Math.random().toString(36).substring(2, 9)}` }
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div :class="['base-input-group', { 'has-error': error }]">
    <label v-if="label" :for="id" class="input-label">
      {{ label }} <span v-if="required" class="required-star">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      class="input-field"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <span v-if="error" class="input-error-msg">{{ error }}</span>
  </div>
</template>

<style scoped>
.base-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}
.input-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-main, #334155);
}
.required-star {
  color: #dc2626;
}
.input-field {
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-color, #cbd5e1);
  font-size: 0.78rem;
  background: var(--bg-surface, #fff);
  color: var(--text-main, #0f172a);
  outline: none;
}
.input-field:focus {
  border-color: var(--color-primary, #2563eb);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.has-error .input-field {
  border-color: #dc2626;
}
.input-error-msg {
  font-size: 0.65rem;
  color: #dc2626;
}
.base-input-group{gap:7px!important}.input-label{font-size:.74rem!important;font-weight:850!important;color:var(--kfe-ui-text)!important}.required-star{color:var(--kfe-danger)!important}.input-field{min-height:48px!important;padding:10px 12px!important;border-radius:10px!important;border:1px solid var(--kfe-ui-border)!important;background:var(--kfe-ui-surface-2)!important;color:var(--kfe-ui-text)!important;font-size:16px!important}.input-field:focus{border-color:var(--kfe-ui-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--kfe-ui-accent) 14%,transparent)!important;background:var(--kfe-ui-surface)!important}.has-error .input-field{border-color:var(--kfe-danger)!important}.input-error-msg{color:var(--kfe-danger)!important}
</style>