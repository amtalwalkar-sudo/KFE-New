<script setup>
import Role from './FuelEntryForm.vue';
</script>
<template><Role v-bind="$attrs" @close="$emit('close')" @saved="$emit('saved',$event)" /></template>
