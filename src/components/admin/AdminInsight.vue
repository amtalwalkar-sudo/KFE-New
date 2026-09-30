<template><section class="kfe-admin-section"><h2>INSIGHT</h2><article class="kfe-admin-card"><strong>{{insight?.title||'Operational insight'}}</strong><p>{{insight?.message||'Administrative interpretation remains limited to authoritative records.'}}</p></article></section></template>
<script setup>defineProps({insight:{type:Object,default:()=>({})}})</script>
