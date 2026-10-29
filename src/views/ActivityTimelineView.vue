<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import '../styles/activity-timeline.css'
import { ActivityTimelineReadService } from '../application/timeline/activityTimelineReadService.js'
import { EventLocationService } from '../application/location/eventLocationService.js'

const period = ref('TODAY')
const snapshot = ref({ rides: [], fuelLogs: [], fuelSummary: null, range: null })
const loading = ref(false)
const error = ref('')
const refreshingLocations = ref(false)
const refreshMessage = ref('')
const pullDistance = ref(0)
let touchStartY = null
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
  if (refreshingLocations.value) return
  refreshingLocations.value = true
  refreshMessage.value = ''
  try {
    const result = await EventLocationService.refreshUnresolvedLocationNames()
    await load()
    if (!result.online) {
      refreshMessage.value = 'Offline — saved coordinates are unchanged. Connect and pull down to try again.'
    } else if (result.updated > 0) {
      refreshMessage.value = `Updated ${result.updated} area name${result.updated === 1 ? '' : 's'}.${result.remaining ? ` ${result.remaining} still unresolved; pull down to try again.` : ' All available area names are resolved.'}`
    } else if (result.remaining === 0) {
      refreshMessage.value = 'No unresolved area names.'
    } else if (result.attempted === 0) {
      refreshMessage.value = `No saved coordinates were ready to resolve. ${result.remaining} remain queued.`
    } else {
      refreshMessage.value = `No new area names found. ${result.remaining} remain queued; pull down to try again later.`
    }
  } catch (cause) {
    refreshMessage.value = cause?.message || 'Area names could not be refreshed. Saved coordinates are unchanged.'
  } finally {
    refreshingLocations.value = false
    pullDistance.value = 0
    touchStartY = null
  }
}
const atTop = () => Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0) <= 0
const handleTouchStart = event => {
  if (refreshingLocations.value || !atTop() || event.touches?.length !== 1) {
    touchStartY = null
    return
  }
  if (event.target?.closest?.('button, select, input, textarea, a')) {
    touchStartY = null
    return
  }
  touchStartY = event.touches[0].clientY
}
const handleTouchMove = event => {
  if (touchStartY == null || refreshingLocations.value || !atTop() || event.touches?.length !== 1) return
  pullDistance.value = Math.max(0, Math.min(96, event.touches[0].clientY - touchStartY))
}
const resetPull = () => {
  touchStartY = null
  pullDistance.value = 0
}
const handleTouchEnd = () => {
  const shouldRefresh = pullDistance.value >= 72 && touchStartY != null
  resetPull()
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
  <section class="activity-timeline-page" aria-labelledby="activity-timeline-title" :aria-busy="refreshingLocations" @touchstart.passive="handleTouchStart" @touchmove.passive="handleTouchMove" @touchend.passive="handleTouchEnd" @touchcancel.passive="resetPull">
    <header class="activity-timeline-heading">
      <div>
        <p class="activity-timeline-eyebrow">READ-ONLY RECORDS</p>
        <h1 id="activity-timeline-title">Timeline</h1>
        <p class="activity-timeline-description">Your rides and CNG refills for the selected period.</p>
      </div>
      <div class="activity-timeline-actions">
        <button class="activity-timeline-refresh" type="button" :disabled="refreshingLocations" aria-label="Refresh area names" @click="refreshLocationNames">
          <span aria-hidden="true" :class="{ 'is-spinning': refreshingLocations }">↻</span>
          {{ refreshingLocations ? 'Refreshing…' : 'Refresh areas' }}
        </button>
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

    <div v-if="pullDistance > 0 || refreshingLocations" class="activity-timeline-pull-status" role="status" aria-live="polite">
      {{ refreshingLocations ? 'Refreshing saved coordinates into area names…' : pullDistance >= 72 ? 'Release to refresh area names' : 'Pull down to refresh area names' }}
    </div>
    <p v-if="refreshMessage" class="activity-timeline-message" role="status">{{ refreshMessage }}</p>
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
            <div><span>Pickup area</span><strong>{{ ride.pickupArea }}</strong><small v-if="ride.pickupArea.startsWith('GPS ') && ride.pickupAreaResolution !== 'RESOLVED'">{{ ride.pickupAreaResolution === 'RETRY_SCHEDULED' ? 'Area lookup will retry' : 'Area lookup pending' }}</small></div>
            <div><span>Drop area</span><strong>{{ ride.dropArea }}</strong><small v-if="ride.dropArea.startsWith('GPS ') && ride.dropAreaResolution !== 'RESOLVED'">{{ ride.dropAreaResolution === 'RETRY_SCHEDULED' ? 'Area lookup will retry' : 'Area lookup pending' }}</small></div>
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
