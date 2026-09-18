<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['submit', 'cancel'])
</script>

<template>
  <form class="form-layout" @submit.prevent="emit('submit')">
    <div class="form-header">
      <div>
        <h2 class="form-title">{{ title }}</h2>
        <p v-if="subtitle" class="form-subtitle">{{ subtitle }}</p>
      </div>
      <button v-if="$attrs.onCancel" type="button" class="btn-close" @click="emit('cancel')">✕</button>
    </div>

    <fieldset :disabled="loading" class="form-body">
      <slot />
    </fieldset>

    <div v-if="$slots.actions || $attrs.onSubmit" class="form-actions">
      <slot name="actions">
        <button type="button" class="btn-secondary" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Saving...' : 'Save Record' }}
        </button>
      </slot>
    </div>
  </form>
</template>

