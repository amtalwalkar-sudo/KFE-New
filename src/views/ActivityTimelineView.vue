<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import '../styles/activity-timeline.css'
import { ActivityTimelineReadService, timelineTodayDateKey } from '../application/timeline/activityTimelineReadService.js'
import { EventLocationService } from '../application/location/eventLocationService.js'
import { EventLocalityService } from '../application/location/eventLocalityService.js'
const today = timelineTodayDateKey()
const startDate = ref(today)
const endDate = ref(today)
const invalidDateRange = computed(() => !startDate.value || !endDate.value || endDate.value < startDate.value)

const period = ref('TODAY')
const snapshot = ref({ rides: [], fuelLogs: [], fuelSummary: null, range: null })
const loading = ref(false)
const error = ref('')
const refreshMessage = ref('')
const refreshing = ref(false)
let pullStartY = null
let pullStartedAtTop = false
let requestVersion = 0
let unsubscribe = null

const money = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const costPerKm = value => value == null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : `${money(value)}/km`
const dateTime = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(value))
}
const duration = value => {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Unavailable'
  const totalMinutes = Math.floor(Number(value) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
const rideIncome = computed(() => snapshot.value.rides.reduce((sum, ride) => sum + (ride.fareState === 'recorded' && ride.fareValue != null ? Number(ride.fareValue) : 0), 0))
const recordedRideIncomeCount = computed(() => snapshot.value.rides.filter(ride => ride.fareState === 'recorded' && ride.fareValue != null).length)
const fareText = ride => {
  if (ride.fareState === 'skipped') return 'Fare skipped'
  if (ride.fareState === 'pending') return 'Fare pending'
  if (ride.fareState === 'unavailable') return 'Not recorded'
  return money(ride.fareValue)
}
const load = async () => {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    if (invalidDateRange.value) throw new Error('Choose a valid date range: the end date must be on or after the start date.')
    const result = await ActivityTimelineReadService.getTimeline({ startDate: startDate.value, endDate: endDate.value })
    if (version === requestVersion) snapshot.value = result
  } catch (cause) {
    if (version === requestVersion) error.value = cause?.message || 'Timeline could not be loaded.'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
const refreshLocationNames = async () => {
  if (refreshing.value) return
  refreshMessage.value = ''
  refreshing.value = true
  try {
    // Manual refresh is intentionally independent of the selected Timeline
    // display period: every eligible event snapshot from the last seven days
    // is considered, including TRIP_START and TRIP_CANCELLED.
    const snapshots = await EventLocationService.allSnapshots()
    const results = await EventLocalityService.resolveSnapshots(snapshots)
    const resolvedCount = results.filter(result => result?.state === 'RESOLVED' && !result.cacheHit).length
    const attemptedCount = results.filter(result => !['NOT_ELIGIBLE', 'OFFLINE'].includes(result?.state) && !result?.cacheHit).length
    await load()
    refreshMessage.value = results.some(result => result?.state === 'OFFLINE')
      ? 'Offline — saved GPS snapshots are retained. Pull down again when online.'
      : attemptedCount === 0
        ? 'No unresolved GPS snapshots from the last seven days are ready for locality lookup.'
        : resolvedCount > 0
        ? `Saved ${resolvedCount} new locality name${resolvedCount === 1 ? '' : 's'} permanently. Other unresolved snapshots remain available for another manual refresh.`
        : 'No new locality names could be verified. GPS coordinates remain unchanged; try again with a reliable connection.'
  } catch (cause) {
    refreshMessage.value = cause?.message || 'Area names could not be refreshed. Saved GPS snapshots are retained.'
  } finally {
    refreshing.value = false
  }
}
const scrollableParent = element => {
  let node = element instanceof Element ? element : element?.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return document.scrollingElement || document.documentElement
}
const atTop = target => {
  if (typeof window === 'undefined') return true
  const scroller = scrollableParent(target)
  return (scroller?.scrollTop ?? window.scrollY ?? 0) <= 0
}
const resetPull = () => { pullStartY = null; pullStartedAtTop = false }
const onTouchStart = event => {
  if (refreshing.value || !atTop(event.target) || event.touches?.length !== 1
    || event.target?.closest?.('button, select, input, textarea, a')) {
    resetPull()
    return
  }
  pullStartY = event.touches[0].clientY
  pullStartedAtTop = true
}
const onTouchEnd = event => {
  const endY = event.changedTouches?.[0]?.clientY
  const shouldRefresh = pullStartedAtTop && pullStartY != null && Number.isFinite(endY) && endY - pullStartY >= 80
  pullStartY = null
  pullStartedAtTop = false
  if (shouldRefresh) void refreshLocationNames()
}
watch([startDate, endDate], () => {
  if (invalidDateRange.value) {
    requestVersion += 1
    snapshot.value = { rides: [], fuelLogs: [], fuelSummary: null, range: null }
    loading.value = false
    error.value = 'Choose a valid date range: the end date must be on or after the start date.'
    return
  }
  error.value = ''
  void load()
})
onMounted(() => {
  void load()
  unsubscribe = ActivityTimelineReadService.subscribeDataChanges(() => { void load() })
})
onUnmounted(() => {
  requestVersion += 1
  if (typeof unsubscribe === 'function') unsubscribe()
})
</script>

<template>
  <section class="activity-timeline-page" aria-labelledby="activity-timeline-title" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd" @touchcancel.passive="resetPull">
    <header class="activity-timeline-heading">
      <div class="activity-timeline-title-group">
        <h1 id="activity-timeline-title">Timeline</h1>
        <p class="activity-timeline-description">{{ startDate === endDate ? startDate : `${startDate} — ${endDate}` }} <span>· IST</span></p>
      </div>
      <span class="activity-timeline-screen-reader-only">Showing {{ startDate }} to {{ endDate }} (IST)</span>
      <div class="activity-timeline-actions activity-timeline-date-range" aria-label="Choose Timeline date range">
        <label class="activity-timeline-filter">
          <span>From</span>
          <input v-model="startDate" type="date" aria-label="Timeline start date" :aria-invalid="invalidDateRange">
        </label>
        <label class="activity-timeline-filter">
          <span>To</span>
          <input v-model="endDate" type="date" aria-label="Timeline end date" :aria-invalid="invalidDateRange">
        </label>
      </div>
    </header>

    <p class="activity-timeline-refresh-hint" title="Pull down to resolve unsaved GPS locality names from the last seven days when online">Pull down to update area names</p>
    <div class="activity-timeline-overview" aria-label="Period overview">
      <article class="activity-timeline-overview-card">
        <span>Rides</span>
        <strong>{{ snapshot.rides.length }}</strong>
      </article>
      <article class="activity-timeline-overview-card">
        <span>Recorded ride income <small>({{ recordedRideIncomeCount }})</small></span>
        <strong>{{ money(rideIncome) }} total</strong>
      </article>
    </div>
    <p v-if="refreshing" class="activity-timeline-message" role="status">Refreshing area names…</p>
    <p v-else-if="refreshMessage" class="activity-timeline-message" role="status">{{ refreshMessage }}</p>
    <p v-if="error" class="activity-timeline-message activity-timeline-error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !snapshot.range" class="activity-timeline-message" role="status">Loading timeline…</p>

    <section class="activity-timeline-section" aria-labelledby="timeline-rides-heading">
      <div class="activity-timeline-section-heading">
        <h2 id="timeline-rides-heading">Rides</h2>
        <span>{{ snapshot.rides.length }}</span>
      </div>
      <div v-if="!loading && !error && snapshot.rides.length === 0" class="activity-timeline-empty">No rides recorded for this period.</div>
      <ol v-else-if="!error" class="activity-timeline-list">
        <li v-for="ride in snapshot.rides" :key="ride.id" class="activity-timeline-record">
          <div class="activity-timeline-record-top">
            <strong>{{ ride.timeLabel }} · {{ dateTime(ride.timeAt) }}</strong>
            <span class="activity-timeline-status" :class="{ 'is-cancelled': ride.status === 'CANCELLED' }">{{ ride.statusLabel }}</span>
          </div>
          <div class="activity-timeline-ride-highlight">
            <strong class="activity-timeline-ride-fare">{{ fareText(ride) }}</strong>
            <span class="activity-timeline-ride-label">{{ ride.fareLabel }}</span><span class="activity-timeline-ride-duration">· {{ duration(ride.durationMs) }}</span>
          </div>
          <div class="activity-timeline-ride-areas">
            <div><span>Pickup</span><strong>{{ ride.pickupArea }}</strong></div>
            <div><span>Drop</span><strong>{{ ride.dropArea }}</strong></div>
          </div>
        </li>
      </ol>
    </section>

    <section class="activity-timeline-section" aria-labelledby="timeline-fuel-heading">
      <div class="activity-timeline-section-heading">
        <h2 id="timeline-fuel-heading">Fuel</h2>
        <span>{{ snapshot.fuelLogs.length }}</span>
      </div>
      <div class="activity-timeline-summary" aria-label="Fuel summary">
        <article class="activity-timeline-metric">
          <span>Average fuel cost/km</span>
          <strong>{{ costPerKm(snapshot.fuelSummary?.averageCostPerKm) }}</strong>
        </article>
        <article class="activity-timeline-metric">
          <span>Total amount refilled</span>
          <strong>{{ money(snapshot.fuelSummary?.totalFuelAmount) }}</strong>
        </article>
      </div>
      <p class="activity-timeline-footnote">Cost/km uses consecutive recorded full-tank odometer readings. Partial refills count toward total fuel spending but do not create a mileage interval.</p>
      <div v-if="!loading && !error && snapshot.fuelLogs.length === 0" class="activity-timeline-empty">No fuel records recorded for this period.</div>
      <ol v-else-if="!error" class="activity-timeline-list">
        <li v-for="fuel in snapshot.fuelLogs" :key="fuel.id" class="activity-timeline-record">
          <div class="activity-timeline-record-top">
            <strong>{{ dateTime(fuel.timeAt) }}</strong>
            <span class="activity-timeline-status">{{ fuel.isFullTank ? 'Full tank' : 'Partial fill' }}</span>
          </div>
          <div class="activity-timeline-fuel-details">
            <div><span>Paid</span><strong>{{ money(fuel.amount) }}</strong></div>
            <div><span>Quantity</span><strong>{{ fuel.quantityKg == null ? '—' : `${fuel.quantityKg.toFixed(2)} kg` }}</strong></div>
            <div><span>Odometer</span><strong>{{ fuel.odometer == null ? '—' : `${fuel.odometer.toLocaleString('en-IN')} km` }}</strong></div>
          </div>
        </li>
      </ol>
    </section>
  </section>
</template>
