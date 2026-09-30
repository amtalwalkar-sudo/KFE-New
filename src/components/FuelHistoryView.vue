<script setup>
import { computed } from 'vue';
const props=defineProps({records:{type:Array,default:()=>[]}});
const emit=defineEmits(['back','undo']);
const ordered=computed(()=>[...props.records].filter(r=>!r.is_deleted).sort((a,b)=>String(b.recorded_at||b.created_at||'').localeCompare(String(a.recorded_at||a.created_at||''))));
</script>
<template>
<section class="kfe-module-view" aria-labelledby="fuel-history-title">
<button class="kfe-secondary-action kfe-back-action" type="button" @click="emit('back')">‹ Fuel</button>
<p class="kfe-eyebrow">Money · Fuel</p><h1 id="fuel-history-title">Fuel history</h1>
<p class="kfe-destination-subtitle">Authoritative saved CNG refills. Historical corrections are made from Timeline.</p>
<div v-if="!ordered.length" class="kfe-placeholder"><h2>No fuel records</h2><p>Saved refills will appear here.</p></div>
<div v-else class="kfe-module-sections"><article v-for="r in ordered" :key="r.id" class="kfe-detail-card">
<div class="kfe-detail-card__top"><div><span class="kfe-card-label">{{r.fuel_type||'CNG'}} · {{new Date(r.recorded_at||r.created_at).toLocaleString()}}</span><strong>{{Number(r.quantity_kg||0).toFixed(3)}} kg</strong></div><span class="kfe-state-badge">Saved</span></div>
<dl class="kfe-detail-list"><div><dt>Odometer</dt><dd>{{r.odometer}}</dd></div><div><dt>Price / kg</dt><dd>₹{{Number(r.price_per_kg||0).toFixed(2)}}</dd></div><div><dt>Amount paid</dt><dd>₹{{(Number(r.amount_paise||0)/100).toFixed(2)}}</dd></div><div v-if="r.location_name"><dt>Location</dt><dd>{{r.location_name}}</dd></div></dl>
<div class="kfe-form-actions"><button class="kfe-secondary-action" type="button" @click="emit('undo',r.id)">Undo / remove</button></div>
</article></div>
</section>
</template>
