<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { PhaseOnePerformanceService } from '../application/performance/phaseOnePerformanceService.js'
import { createCoalescedRefresh } from '../application/performance/performanceRefreshCoordinator.js'
import '../styles/performance.css'

const today = PhaseOnePerformanceService.getTodayDateKey()
const startDate = ref(today)
const endDate = ref(today)
const invalidDateRange = computed(() => !startDate.value || !endDate.value || endDate.value < startDate.value)
const overview = ref(null)
const loading = ref(false)
const error = ref('')
let requestVersion = 0
let unsubscribeCanonicalChanges = null

const relevantStores = new Set(['shifts', 'trips', 'fuel_logs', 'settings'])
const refresh = createCoalescedRefresh(async () => {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const result = await PhaseOnePerformanceService.getOverview({ startDate: startDate.value, endDate: endDate.value })
    if (version === requestVersion) overview.value = result
  } catch (cause) {
    if (version === requestVersion) error.value = cause?.message || 'Performance could not be loaded.'
  } finally {
    if (version === requestVersion) loading.value = false
  }
})
const load = () => refresh.request()

const money = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const costPerKm = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : `${money(value)}/km`

watch([startDate, endDate], () => {
  if (invalidDateRange.value) {
    requestVersion += 1
    overview.value = null
    loading.value = false
    error.value = 'Choose a valid date range: the end date must be on or after the start date.'
    return
  }
  error.value = ''
  void load()
})
onMounted(() => {
  unsubscribeCanonicalChanges = PhaseOnePerformanceService.subscribeDataChanges(({ stores = [] } = {}) => {
    if (!stores.length || stores.some(store => relevantStores.has(store))) void load()
  })
  void load()
})
onUnmounted(() => {
  unsubscribeCanonicalChanges?.()
  refresh.dispose()
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
      <div class="performance-period performance-date-range" aria-label="Choose Performance date range">
        <label>
          <span>From</span>
          <input v-model="startDate" type="date" aria-label="Performance start date" :aria-invalid="invalidDateRange">
        </label>
        <label>
          <span>To</span>
          <input v-model="endDate" type="date" aria-label="Performance end date" :aria-invalid="invalidDateRange">
        </label>
      </div>
    </header>

    <p v-if="error" class="performance-message performance-error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !overview" class="performance-message" role="status">Loading performance…</p>

    <template v-if="overview && !error">
      <p class="performance-period-note">Showing {{ startDate }} to {{ endDate }} (IST). Figures come from saved records only.</p>
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
      <p class="performance-footnote">Income after fuel is recorded shift revenue (including cancellation fees), less recorded fuel spending. Maintenance and EMI costs are not included in Phase 1.</p>
    </template>
  </section>
</template>
