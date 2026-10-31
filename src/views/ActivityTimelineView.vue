<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import '../styles/activity-timeline.css'
import { ActivityTimelineReadService } from '../application/timeline/activityTimelineReadService.js'
import { EventLocationService } from '../application/location/eventLocationService.js'
import { resolveLocationNameDetailed } from '../application/location/locationNameService.js'

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
    const result = await ActivityTimelineReadService.getTimeline({ period: period.value })
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    refreshMessage.value = 'Offline — saved GPS snapshots are retained. Pull down again when online.'
    return
  }
  refreshing.value = true
  try {
    const rideIds = snapshot.value.rides.map(ride => ride.id).filter(Boolean)
    const visibleRideById = new Map(snapshot.value.rides.map(ride => [ride.id, ride]))
    const locations = (await EventLocationService.forEntities('TRIP', rideIds)).filter(location => {
      const ride = visibleRideById.get(location.entityId)
      if (!ride) return false
      if (location.eventType === 'PICKUP_START') return true
      return ride.status === 'COMPLETED' && location.eventType === 'TRIP_END'
    })
    let resolvedCount = 0
    let lowAccuracyCount = 0
    let attemptedCount = 0
    for (const location of locations) {
      const hasCoordinates = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      if (!hasCoordinates(location.latitude) || !hasCoordinates(location.longitude)
        || Math.abs(Number(location.latitude)) > 90 || Math.abs(Number(location.longitude)) > 180) continue
      attemptedCount += 1
      const resolution = await resolveLocationNameDetailed(location, undefined, { forceRefresh: true })
      if (resolution?.placeName) resolvedCount += 1
      else if (resolution?.state === 'LOW_ACCURACY') lowAccuracyCount += 1
    }
    await load()
    refreshMessage.value = attemptedCount === 0
      ? 'No valid pickup or completed drop GPS snapshots are available to resolve yet.'
      : resolvedCount > 0
        ? `Resolved ${resolvedCount} of ${attemptedCount} area names. ${lowAccuracyCount ? `${lowAccuracyCount} low-accuracy snapshots remain Location unavailable.` : ''} Saved ride GPS snapshots remain unchanged.`
        : lowAccuracyCount > 0
          ? `${lowAccuracyCount} GPS snapshots are too imprecise to label safely. Those areas remain Location unavailable; the saved snapshots are retained.`
          : 'No area names could be resolved. Saved GPS snapshots are retained; pull down again when online.'
  } catch (cause) {
    refreshMessage.value = cause?.message || 'Area names could not be refreshed. Saved GPS snapshots are retained.'
  } finally {
    refreshing.value = false
  }
}
const atTop = () => typeof window === 'undefined'
  || Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0) <= 0
const resetPull = () => { pullStartY = null; pullStartedAtTop = false }
const onTouchStart = event => {
  if (refreshing.value || !atTop() || event.touches?.length !== 1
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
watch(period, () => { void load() })
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
      <div>
        <p class="activity-timeline-eyebrow">READ-ONLY RECORDS</p>
        <h1 id="activity-timeline-title">Timeline</h1>
        <p class="activity-timeline-description">Your rides and CNG refills for the selected period.</p>
      </div>
      <div class="activity-timeline-actions">
        <label class="activity-timeline-filter">
        <span>Period</span>
        <select v-model="period" aria-label="Timeline period">
          <option value="TODAY">Today</option>
          <option value="WEEK">This week</option>
          <option value="MONTH">This month</option>
        </select>
        </label>
      </div>
    </header>

    <p class="activity-timeline-description activity-timeline-refresh-hint">Pull down from the top to refresh area names when online.</p>
    <p v-if="refreshing" class="activity-timeline-message" role="status">Refreshing area names…</p>
    <p v-else-if="refreshMessage" class="activity-timeline-message" role="status">{{ refreshMessage }}</p>
    <p v-if="error" class="activity-timeline-message activity-timeline-error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !snapshot.range" class="activity-timeline-message" role="status">Loading timeline…</p>

    <section class="activity-timeline-section" aria-labelledby="timeline-rides-heading">
      <div class="activity-timeline-section-heading">
        <h2 id="timeline-rides-heading">Rides</h2>
        <span>{{ snapshot.rides.length }} records</span>
      </div>
      <div v-if="!loading && !error && snapshot.rides.length === 0" class="activity-timeline-empty">No rides recorded for this period.</div>
      <ol v-else-if="!error" class="activity-timeline-list">
        <li v-for="ride in snapshot.rides" :key="ride.id" class="activity-timeline-record">
          <div class="activity-timeline-record-top">
            <strong>{{ ride.timeLabel }} · {{ dateTime(ride.timeAt) }}</strong>
            <span class="activity-timeline-status" :class="{ 'is-cancelled': ride.status === 'CANCELLED' }">{{ ride.statusLabel }}</span>
          </div>
          <div class="activity-timeline-record-grid">
            <div><span>Duration</span><strong>{{ duration(ride.durationMs) }}</strong></div>
            <div><span>{{ ride.fareLabel }}</span><strong>{{ fareText(ride) }}</strong></div>
            <div><span>Pickup area</span><strong>{{ ride.pickupArea }}</strong></div>
            <div><span>Drop area</span><strong>{{ ride.dropArea }}</strong></div>
          </div>
        </li>
      </ol>
    </section>

    <section class="activity-timeline-section" aria-labelledby="timeline-fuel-heading">
      <div class="activity-timeline-section-heading">
        <h2 id="timeline-fuel-heading">Fuel</h2>
        <span>{{ snapshot.fuelLogs.length }} records</span>
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
          <div class="activity-timeline-record-grid">
            <div><span>Amount paid</span><strong>{{ money(fuel.amount) }}</strong></div>
            <div><span>Quantity</span><strong>{{ fuel.quantityKg == null ? 'Unavailable' : `${fuel.quantityKg.toFixed(2)} kg` }}</strong></div>
            <div><span>Odometer</span><strong>{{ fuel.odometer == null ? 'Unavailable' : `${fuel.odometer.toLocaleString('en-IN')} km` }}</strong></div>
          </div>
        </li>
      </ol>
    </section>
  </section>
</template>
