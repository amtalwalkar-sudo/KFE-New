<script setup>
const props = defineProps({
  saving: { type: Boolean, default: false },
  saved: { type: Boolean, default: false },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  saveLabel: { type: String, default: 'Save' },
});

const emit = defineEmits(['save', 'retry']);
</script>

<template>
  <div class="kfe-form-actions">
    <p v-if="error" class="kfe-form-save-error" role="alert">{{ error }}</p>
    <p v-else-if="saved" class="kfe-form-save-success" role="status">Saved</p>

    <button
      v-if="error"
      class="kfe-button kfe-button-secondary"
      type="button"
      @click="emit('retry')"
    >
      Retry
    </button>

    <button
      class="kfe-button kfe-button-primary"
      type="submit"
      :disabled="disabled || saving"
      :aria-busy="saving ? 'true' : 'false'"
      @click="emit('save')"
    >
      {{ saving ? 'Saving…' : saved ? 'Saved' : saveLabel }}
    </button>
  </div>
</template>
