<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { PhaseOnePerformanceService } from '../application/performance/phaseOnePerformanceService.js'
import '../styles/performance.css'

const period = ref('DAY')
const overview = ref(null)
const loading = ref(false)
const error = ref('')
let requestVersion = 0
let unsubscribe = null

const money = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const costPerKm = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : `${money(value)}/km`
const sourceLabel = source => source === 'FULL_TANK_INTERVAL'
  ? 'Based on qualified full-tank intervals'
  : source === 'OBSERVED_PERIOD'
    ? 'Indicative: period fuel spending ÷ recorded vehicle KM'
    : 'Unavailable until sufficient valid fuel and mileage records exist'

const load = async () => {
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
watch(period, () => { void load() })
onMounted(() => {
  void load()
  unsubscribe = PhaseOnePerformanceService.subscribeDataChanges(() => { void load() })
})
onUnmounted(() => {
  requestVersion += 1
  if (typeof unsubscribe === 'function') unsubscribe()
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
          <small>{{ sourceLabel(overview.fuelCostPerKmSource) }}</small>
        </article>
        <article class="performance-metric performance-metric-highlight">
          <span>Income after fuel</span>
          <strong>{{ money(overview.incomeAfterFuel) }}</strong>
          <small>Fare income + cancellation fees − fuel spending</small>
        </article>
      </section>
      <section class="performance-provisions" aria-labelledby="performance-provisions-title">
        <h2 id="performance-provisions-title">Cumulative provision balances</h2>
        <p class="performance-period-note">Signed balances as of {{ new Date(overview.provisionBalances.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) }}. Negative means payments exceed provision accrued; the balance is not clamped to zero.</p>
        <div class="performance-metric-grid" aria-label="Cumulative provision balances">
          <article class="performance-metric">
            <span>EMI provision balance</span>
            <strong>{{ overview.provisionBalances.emi.available ? money(overview.provisionBalances.emi.balance) : 'Unavailable' }}</strong>
            <small>{{ overview.provisionBalances.emi.available ? 'Accumulated EMI provision less actual EMI payments' : 'No complete active loan calculation is available' }}</small>
          </article>
          <article class="performance-metric">
            <span>Maintenance provision balance</span>
            <strong>{{ overview.provisionBalances.maintenance.available ? money(overview.provisionBalances.maintenance.balance) : 'Unavailable' }}</strong>
            <small>{{ overview.provisionBalances.maintenance.available ? 'Accumulated maintenance provision less actual maintenance payments' : 'A valid maintenance-rate history is required' }}</small>
          </article>
        </div>
      </section>
      <p class="performance-footnote">Income after fuel is an operating summary, not net profit; Maintenance, EMI and other costs are not included in Phase 1 income-after-fuel. Signed provision balances are shown separately and are not subtracted a second time.</p>
    </template>
  </section>
</template>
