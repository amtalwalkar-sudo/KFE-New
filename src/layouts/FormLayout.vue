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

<style scoped>
.form-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--bg-surface, #ffffff);
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-color, #e2e8f0);
}
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.form-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}
.form-subtitle {
  margin: 0.1rem 0 0 0;
  font-size: 0.68rem;
  color: var(--text-muted, #64748b);
}
.btn-close {
  background: transparent;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text-muted, #64748b);
}
.form-body {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color, #f1f5f9);
}
.btn-primary, .btn-secondary {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary {
  background: var(--color-primary, #2563eb);
  color: #fff;
  border: none;
}
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-main, #0f172a);
}
.form-layout{gap:14px!important;background:var(--kfe-ui-surface)!important;padding:16px!important;border-radius:14px!important;border:1px solid var(--kfe-ui-border)!important;box-shadow:var(--kfe-ui-shadow)!important}.form-title{font-size:1.05rem!important;font-weight:900!important;color:var(--kfe-ui-text)!important}.form-subtitle{font-size:.7rem!important;color:var(--kfe-muted-text)!important}.form-actions{gap:8px!important;border-color:var(--kfe-ui-border)!important;padding-top:12px!important}.btn-primary,.btn-secondary{min-height:46px!important;padding:10px 14px!important;border-radius:10px!important;font-weight:850!important}.btn-primary{background:var(--kfe-ui-accent)!important}.btn-secondary{background:var(--kfe-ui-surface)!important;border-color:var(--kfe-ui-border)!important;color:var(--kfe-ui-text)!important}
</style>