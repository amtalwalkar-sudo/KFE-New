<script setup>
import Role from './AuthoritativeRecordFormRole.vue';
</script>
<template><Role v-bind="$attrs" @close="$emit('close')" @saved="$emit('saved',$event)" /></template>
