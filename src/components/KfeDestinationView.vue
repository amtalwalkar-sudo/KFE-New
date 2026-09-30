<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  eyebrow: { type: String, default: 'KFE 2.0' },
})
</script>

<template>
  <section class="ui-destination" :aria-labelledby="`destination-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`">
    <p class="ui-eyebrow">{{ eyebrow }}</p>
    <h1 :id="`destination-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`">{{ title }}</h1>
    <p class="ui-destination-subtitle">{{ subtitle }}</p>
    <slot />
  </section>
</template>

<style scoped>
.ui-destination{display:grid;align-content:start;gap:8px;width:100%;min-height:100%;box-sizing:border-box}
.ui-eyebrow{margin:0;color:var(--kfe-ui-muted);font-size:.76rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.ui-destination h1{margin:0}
.ui-destination-subtitle{margin:0 0 12px;color:var(--kfe-ui-muted);line-height:1.45}
</style>
