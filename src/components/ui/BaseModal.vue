<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' }
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-card" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
          <button type="button" class="modal-close-btn" @click="emit('close')">✕</button>
        </header>

        <div class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.actions" class="modal-footer">
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

