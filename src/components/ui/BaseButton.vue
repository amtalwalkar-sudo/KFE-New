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

<style scoped>
.base-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-family: inherit;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
  border: 1px solid transparent;
}
.base-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-primary { background: var(--color-primary, #2563eb); color: #fff; }
.btn-secondary { background: var(--bg-surface, #fff); border-color: var(--border-color, #cbd5e1); color: var(--text-main, #0f172a); }
.btn-danger { background: #dc2626; color: #fff; }
.btn-ghost { background: transparent; color: var(--text-muted, #64748b); }

.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
.btn-md { padding: 0.4rem 0.8rem; font-size: 0.75rem; }
.btn-lg { padding: 0.6rem 1.2rem; font-size: 0.85rem; }

.spinner {
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.v-hidden { opacity: 0; }
.base-button{min-height:48px!important;padding:10px 15px!important;border-radius:10px!important;border:1px solid var(--kfe-ui-border)!important;font-weight:850!important;letter-spacing:.005em}.base-button.primary{background:var(--kfe-ui-accent)!important;border-color:var(--kfe-ui-accent)!important;color:#fff!important}.base-button.secondary{background:var(--kfe-ui-surface)!important;color:var(--kfe-ui-text)!important}.base-button.danger{background:color-mix(in srgb,var(--kfe-danger) 10%,var(--kfe-ui-surface))!important;color:var(--kfe-danger)!important;border-color:color-mix(in srgb,var(--kfe-danger) 35%,var(--kfe-ui-border))!important}.base-button:focus-visible{outline:3px solid color-mix(in srgb,var(--kfe-ui-accent) 55%,transparent)!important;outline-offset:2px!important}
</style>