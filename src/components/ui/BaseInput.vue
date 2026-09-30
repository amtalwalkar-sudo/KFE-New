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

