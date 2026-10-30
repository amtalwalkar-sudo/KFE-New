<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { PhaseOnePerformanceService } from '../application/performance/phaseOnePerformanceService.js'
import '../styles/performance.css'

const period = ref('DAY')
const overview = ref(null)
const loading = ref(false)
const error = ref('')
let requestVersion = 0

const money = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const costPerKm = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : `${money(value)}/km`
const load = async ({ force = false } = {}) => {
  // Canonical change notifications can arrive during the initial snapshot read.
  // Do not supersede a valid in-flight load with a duplicate read; the active
  // request already reads a transactionally consistent canonical snapshot.
  if (loading.value && !force) return
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const result = await PhaseOnePerformanceService.getOverview(period.value)
    if (version === requestVersion) overview.value = result
  } catch (cause) {
    if (version === requestVersion) error.value = cause?.message || 'Performance could not be loaded.'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
watch(period, () => { void load({ force: true }) })
onMounted(() => {
  // Read a consistent snapshot on entry. Avoid starting a second IndexedDB
  // snapshot from cross-tab change notifications while the same view is alive;
  // leaving and re-entering Performance refreshes from canonical data.
  void load()
})
onUnmounted(() => {
  requestVersion += 1
})
</script>

<template>
  <section class="performance-page" aria-labelledby="performance-title">
    <header class="performance-heading">
      <div>
        <p class="performance-eyebrow">READ-ONLY SUMMARY</p>
        <h1 id="performance-title">Performance</h1>
        <p class="performance-description">Your recorded rides, revenue and fuel performance.</p>
      </div>
      <label class="performance-period">
        <span>Period</span>
        <select v-model="period" aria-label="Performance period">
          <option value="DAY">Today</option>
          <option value="WEEK">This week</option>
          <option value="MONTH">This month</option>
        </select>
      </label>
    </header>

    <p v-if="error" class="performance-message performance-error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !overview" class="performance-message" role="status">Loading performance…</p>

    <template v-if="overview && !error">
      <p class="performance-period-note">Reporting dates use IST (Asia/Kolkata). Figures come from saved records only.</p>
      <section class="performance-metric-grid" aria-label="Performance metrics">
        <article class="performance-metric">
          <span>Fare income</span>
          <strong>{{ money(overview.fareIncome) }}</strong>
          <small>Recorded shift revenue less cancellation fees</small>
        </article>
        <article class="performance-metric">
          <span>Completed rides</span>
          <strong>{{ overview.completedRides.toLocaleString('en-IN') }}</strong>
          <small>Completed rides in this period</small>
        </article>
        <article class="performance-metric">
          <span>Cancellation fees</span>
          <strong>{{ money(overview.cancellationFees) }}</strong>
          <small>Blank fees count as ₹0</small>
        </article>
        <article class="performance-metric">
          <span>Fuel spending</span>
          <strong>{{ money(overview.fuelSpending) }}</strong>
          <small>Saved fuel entries in this period</small>
        </article>
        <article class="performance-metric">
          <span>Fuel cost per km</span>
          <strong>{{ costPerKm(overview.fuelCostPerKm) }}</strong>
          <small>{{ overview.fuelCostPerKmSource === 'FULL_TANK_INTERVAL' ? 'From consecutive full-tank odometer readings' : 'Unavailable until two valid full-tank readings exist' }}</small>
        </article>
        <article class="performance-metric performance-metric-highlight">
          <span>Income after fuel</span>
          <strong>{{ money(overview.incomeAfterFuel) }}</strong>
          <small>Fare income + cancellation fees − fuel spending</small>
        </article>
      </section>
      <p class="performance-footnote">Income after fuel is recorded shift revenue (including cancellation fees), less recorded fuel spending. Other costs are not included.</p>
    </template>
  </section>
</template>
