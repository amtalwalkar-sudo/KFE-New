<script setup>
defineProps({
  movementLabel: { type: String, default: 'LIVE KM' },
  movementKm: { type: Number, required: true },
  movementStatus: { type: String, default: '' },
  timerLabel: { type: String, required: true },
  timerValue: { type: String, required: true },
  revenueValue: { type: String, required: true }
})
</script>

<template>
  <section class="operational-state state-tone-info work-persistent-metrics" aria-label="Live distance and workflow timer">
    <div class="work-live-metrics">
      <div class="live-km-readout" aria-live="polite">
        <span>{{ movementLabel || 'LIVE KM' }}</span>
        <strong>{{ movementKm.toFixed(1) }} km</strong>
        <small>{{ movementStatus }}</small>
      </div>
      <div class="trip-timer-block">
        <span class="timer-label">{{ timerLabel }}</span>
        <strong class="trip-timer" aria-live="polite">{{ timerValue }}</strong>
      </div>
      <div class="live-revenue-readout" aria-live="polite">
        <span>REVENUE</span>
        <strong>{{ revenueValue }}</strong>
        <small>Saved fares</small>
      </div>
    </div>
  </section>
</template>
