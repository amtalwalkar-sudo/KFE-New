<script setup>
import { computed } from 'vue';

const props = defineProps({
  state: { type: String, default: 'normal' },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
});

const emit = defineEmits(['action']);

const stateMeta = {
  normal: { label: 'Ready', icon: '•' },
  loading: { label: 'Loading', icon: '…' },
  saving: { label: 'Saving', icon: '…' },
  success: { label: 'Saved', icon: '✓' },
  offline: { label: 'Offline', icon: '•' },
  error: { label: 'Needs attention', icon: '!' },
  empty: { label: 'Nothing here yet', icon: '—' },
  validation: { label: 'Check your entry', icon: '!' },
};

const meta = computed(() => stateMeta[props.state] || stateMeta.normal);
</script>

<template>
  <section class="kfe-state-panel" :data-state="state" :aria-busy="state === 'loading' || state === 'saving'">
    <div class="kfe-state-icon" aria-hidden="true">{{ meta.icon }}</div>
    <div class="kfe-state-copy">
      <strong>{{ title || meta.label }}</strong>
      <p v-if="message">{{ message }}</p>
      <button v-if="actionLabel" type="button" @click="emit('action')">{{ actionLabel }}</button>
    </div>
  </section>
</template>
