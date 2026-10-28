<script setup>
defineProps({
  showBack: { type: Boolean, default: false },
  title: { type: String, default: 'Admin' },
})
defineEmits(['back'])
</script>

<template>
  <section class="admin-page" aria-label="Admin">
    <header class="admin-shell-bar" aria-label="Admin navigation">
      <button v-if="showBack" type="button" class="back-button" @click="$emit('back')">‹ <span>Back</span></button>
      <span v-else class="admin-shell-mark" aria-hidden="true">KFE</span>
      <div class="admin-shell-context">
        <span>ADMINISTRATION</span>
        <strong>{{ title }}</strong>
      </div>
    </header>
    <slot />
  </section>
</template>
