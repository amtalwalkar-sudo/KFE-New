<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="['kfe-ui-button', `is-${variant}`, `is-${size}`, { 'is-loading': loading }]"
    @click="emit('click', $event)"
  >
    <span v-if="loading" class="kfe-ui-button-spinner" aria-hidden="true"></span>
    <span :class="{ 'kfe-visually-hidden': loading }"><slot /></span>
  </button>
</template>
