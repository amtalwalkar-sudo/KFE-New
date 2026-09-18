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
    :class="['base-btn', `btn-${variant}`, `btn-${size}`, { 'is-loading': loading }]"
    @click="emit('click', $event)"
  >
    <span v-if="loading" class="spinner"></span>
    <span :class="{ 'v-hidden': loading }"><slot /></span>
  </button>
</template>

