<script setup>
import { useToast } from '@/composables/useToast.js'

const { toasts, removeToast } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast-item', `toast-${toast.type}`]"
        >
          <span class="toast-message">{{ toast.message }}</span>
          <button type="button" class="toast-close" @click="removeToast(toast.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 200;
  max-width: 320px;
  width: 100%;
}
.toast-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.toast-info { background: #2563eb; }
.toast-success { background: #16a34a; }
.toast-error { background: #dc2626; }
.toast-warning { background: #d97706; }

.toast-close {
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 0.8rem;
  cursor: pointer;
  margin-left: 0.5rem;
  opacity: 0.8;
}
.toast-close:hover { opacity: 1; }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}
.toast-container{right:12px!important;bottom:calc(86px + env(safe-area-inset-bottom))!important;max-width:380px!important}.toast-item{min-height:48px!important;padding:10px 12px!important;border-radius:10px!important;border:1px solid var(--kfe-ui-border)!important;box-shadow:0 8px 24px color-mix(in srgb,var(--kfe-ui-text) 14%,transparent)!important;font-weight:800!important}.toast-info{background:var(--kfe-ui-surface)!important;color:var(--kfe-ui-text)!important;border-left:4px solid var(--kfe-info)!important}.toast-success{background:var(--kfe-ui-surface)!important;color:var(--kfe-ui-text)!important;border-left:4px solid var(--kfe-success)!important}.toast-error{background:var(--kfe-ui-surface)!important;color:var(--kfe-ui-text)!important;border-left:4px solid var(--kfe-danger)!important}.toast-warning{background:var(--kfe-ui-surface)!important;color:var(--kfe-ui-text)!important;border-left:4px solid var(--kfe-warning)!important}.toast-close{color:var(--kfe-muted-text)!important;min-height:40px!important;min-width:40px!important}
</style>