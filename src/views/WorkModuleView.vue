<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { MovementTraceService } from '../infrastructure/location/movementTraceService.js'
import { KfeRideNotificationService } from '../infrastructure/android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../infrastructure/android/kfeOverlay.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'

const store = useShiftTripStore()
const fuel = useFuelStore()
const nativeAndroid = Capacitor.getPlatform() === 'android'

const startOdo = ref('')
const startAck = ref(false)
const gapChoice = ref('')
const startBusy = ref(false)
const startOpen = ref(false)

const operator = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

const fareTripId = ref(null)
const fare = ref('')
const fareBusy = ref(false)
const fareInput = ref(null)

const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelFare = ref('')
const cancelBusy = ref(false)

const fuelOpen = ref(false)
const fuelOdo = ref('')
const fuelPrice = ref('')
const fuelAmount = ref('')
const fuelFull = ref(true)
const fuelBusy = ref(false)

const endOpen = ref(false)
const endStage = ref('CLOSE')
const closingOdo = ref('')
const shiftRevenue = ref('')
const toll = ref('')
const parking = ref('')
const tollTreatment = ref('INCLUDED')
const endBusy = ref(false)
const reviewRevenue = ref({})
const reviewKm = ref({})
const reviewOperator = ref({})

const target = ref(null)
const targetAchieved = ref(0)
const clock = ref(Date.now())
const track = ref(null)
const swipe = ref({ down: false, start: 0, offset: 0 })
const swipePointerId = ref(null)

let timer = null
let traceRunning = false
let notificationListener = null

const money = value => Number.isFinite(Number(value))
  ? '₹' + Math.round(Number(value)).toLocaleString('en-IN')
  : '—'

const notify = text => {
  message.value = text
  error.value = ''
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 2400)
}
const fail = text => { error.value = text; message.value = '' }

const gap = computed(() => store.calculateGap(startOdo.value))
const gapKm = computed(() => Number(gap.value?.gapKm || 0))
const targetValue = computed(() => target.value?.target == null ? null : Number(target.value.target))
const targetProgress = computed(() => targetValue.value > 0
  ? Math.min(100, Math.round(targetAchieved.value / targetValue.value * 100))
  : 0)

const completed = computed(() => store.completedTrips.filter(t => t.status === 'COMPLETED'))
const pendingFare = computed(() => {
  if (fareTripId.value) {
    if (store.trip?.id === fareTripId.value) return store.trip
    return completed.value.find(t => t.id === fareTripId.value) || null
  }
  return completed.value.find(t => t.revenue === '' || t.revenue === null || t.revenue === undefined) || null
})

const cockpit = computed(() => deriveWorkCockpitState({
  shift: store.shift,
  trip: store.trip,
  trips: store.registeredTrips,
  pendingFareId: pendingFare.value?.id || '',
  notificationPhase: KfeRideNotificationService.getState()?.phase || '',
  target: targetValue.value == null ? '—' : money(targetValue.value),
  targetProgress: targetProgress.value,
  liveKm: '0.0 km',
  revenue: '₹0'
}))

const ready = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.PICKUP)
const active = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.RIDE_STARTED)
const goingPickup = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.PICKUP && !ready.value)
const actionLabel = computed(() => {
  if (cockpit.value.action === 'END_RIDE') return 'END TRIP'
  if (cockpit.value.action === 'START_RIDE') return 'START TRIP'
  return 'GO TO PICKUP'
})
const tripTimer = computed(() => {
  const started = cockpit.value.tripStartAt
  if (!started) return '00:00:00'
  const seconds = Math.max(0, Math.floor((clock.value - started) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})

const preview = computed(() => endOpen.value ? WorkService.reconcileShiftRevenue({
  shiftRevenue: shiftRevenue.value,
  trips: completed.value.map(t => ({
    ...t,
    revenue: reviewRevenue.value[t.id] ?? t.revenue,
    tripKm: reviewKm.value[t.id] ?? t.tripKm,
    operator: reviewOperator.value[t.id] ?? t.operator
  })),
  toll: toll.value,
  parking: parking.value,
  tollParkingRevenueTreatment: tollTreatment.value
}) : null)

const missing = computed(() => completed.value.filter(t => reviewRevenue.value[t.id] === '' || reviewRevenue.value[t.id] == null))
const endReady = computed(() =>
  Boolean(closingOdo.value) &&
  shiftRevenue.value !== '' &&
  preview.value?.reconciliationStatus !== 'UNAVAILABLE' &&
  preview.value?.reconciliationStatus !== 'MISMATCH'
)
const shiftKm = computed(() => Math.max(
  0,
  Number(closingOdo.value || store.lastKnownOdometer || store.startOdometer || 0) - Number(store.startOdometer || 0)
))
const fuelQty = computed(() => fuel.calculateQuantity(fuelPrice.value, fuelAmount.value))

async function targetRefresh() {
  try {
    const snapshot = await PerformanceService.getDailyTargetSnapshot()
    target.value = snapshot.target
    targetAchieved.value = Number(snapshot.achieved || 0)
  } catch (_) {
    target.value = null
    targetAchieved.value = 0
  }
}

async function syncOverlay() {
  if (!store.isOnline || document.visibilityState === 'visible') {
    await AndroidOverlay.hide().catch(() => {})
    return
  }

  let revenue = '₹0'
  let liveKm = '0.0 km'
  let trips = []
  try {
    trips = await WorkService.getTripsForShift(store.shift.id)
    const total = trips.reduce((sum, item) => {
      const value = Number(item?.revenue)
      return Number.isFinite(value) && value >= 0 ? sum + value : sum
    }, 0)
    revenue = money(total)
  } catch (_) {}

  if (store.trip?.id) {
    try {
      const distance = await WorkService.getTripGpsDistanceKm(store.trip.id)
      if (Number.isFinite(Number(distance))) liveKm = Number(distance).toFixed(1) + ' km'
    } catch (_) {}
  }

  const state = deriveWorkCockpitState({
    shift: store.shift,
    trip: store.trip,
    trips,
    pendingFareId: pendingFare.value?.id || '',
    notificationPhase: KfeRideNotificationService.getState()?.phase || '',
    target: targetValue.value == null ? '—' : money(targetValue.value),
    targetProgress: targetProgress.value,
    liveKm,
    revenue
  })

  await AndroidOverlay.update({
    shift: store.shift ? { id: store.shift.id } : null,
    trip: store.trip ? {
      id: store.trip.id,
      status: store.trip.status,
      tripStage: store.trip.tripStage
    } : null,
    target: state.target,
    targetProgress: state.targetProgress,
    rides: String(trips.length),
    liveKm: state.liveKm,
    revenue: state.revenue,
    tripStartAt: state.tripStartAt,
    overlayAction: state.action,
    overlayTripId: state.tripId
  }).catch(() => {})
}

async function openStart() {
  fuelOpen.value = false
  endOpen.value = false
  startOpen.value = true
  startOdo.value = store.lastKnownOdometer == null ? '' : String(store.lastKnownOdometer)
  startAck.value = false
  gapChoice.value = ''
  error.value = ''
  message.value = ''
  await nextTick()
  document.querySelector('.start-shift-gate input[type="number"]')?.focus()
}

async function submitStart() {
  if (startBusy.value) return
  if (!startOdo.value) return fail('Current odometer is required.')
  if (!startAck.value) return fail('Confirm the current odometer reading before continuing.')
  if (!gap.value.valid) return fail(gap.value.reason || 'Enter a valid odometer.')
  if (gapKm.value && !gapChoice.value) return fail('Choose Personal KM or Dead KM for the full odometer gap.')

  startBusy.value = true
  try {
    const result = await store.startShift(startOdo.value, gapKm.value ? { category: gapChoice.value } : null)
    if (!result?.ok) return fail(result?.reason || 'Could not start the shift.')
    startOpen.value = false
    startOdo.value = ''
    startAck.value = false
    gapChoice.value = ''
    await targetRefresh()
    await KfeRideNotificationService.goOnline().catch(() => {})
    await AndroidOverlay.prepare().catch(() => {})
    await syncOverlay()
    notify('Online — shift started.')
  } catch (e) {
    fail(e?.message || 'Could not start the shift.')
  } finally {
    startBusy.value = false
  }
}

async function goPickup() {
  if (busy.value || !store.isOnline || store.isTripActive) return
  busy.value = true
  try {
    try {
      traceRunning = MovementTraceService.start({
        entityType: 'SHIFT',
        entityId: store.shift?.id,
        eventType: 'DEAD_MOVEMENT_TRACE',
        profile: 'DEAD_LEG'
      })
    } catch (_) { traceRunning = false }

    const result = await store.beginPickup(operator.value || store.defaultOperator)
    if (!result?.ok) {
      if (traceRunning) MovementTraceService.reset()
      traceRunning = false
      return fail(result?.reason || 'Could not start pickup.')
    }
    await KfeRideNotificationService.beginPickup(store.trip?.id || '').catch(() => {})
    await syncOverlay()
    notify('Going to pickup.')
  } finally {
    busy.value = false
  }
}

async function startTrip() {
  if (busy.value || !ready.value) return
  busy.value = true
  try {
    if (traceRunning) {
      MovementTraceService.reset()
      traceRunning = false
    }
    const result = await store.startRide()
    if (!result?.ok) return fail(result?.reason || 'Trip could not be started.')
    await KfeRideNotificationService.startRide().catch(() => {})
    await syncOverlay()
    notify('Trip active.')
  } finally {
    busy.value = false
  }
}

async function endTrip() {
  if (busy.value || !active.value) return
  busy.value = true
  try {
    const tripId = store.trip.id
    if (!await store.endTrip()) return fail('Trip could not be prepared for fare.')
    fareTripId.value = tripId
    fare.value = ''
    await KfeRideNotificationService.completeRide().catch(() => {})
    await syncOverlay()
    notify('Trip ended — enter fare.')
  } finally {
    busy.value = false
  }
}

async function saveFare() {
  if (fareBusy.value || !pendingFare.value) return
  if (fare.value === '') return fail('Trip fare is required.')
  if (!Number.isFinite(Number(fare.value)) || Number(fare.value) < 0) return fail('Trip fare must be a non-negative number.')

  fareBusy.value = true
  try {
    const tripId = pendingFare.value.id
    const recorded = await WorkService.recordFareForActiveTrip({ id: tripId, revenue: Number(fare.value) })
    if (!recorded?.ok) return fail(recorded?.reason || 'Trip fare could not be saved.')

    const completedTrip = await WorkService.completeTrip({ id: tripId })
    if (!completedTrip) return fail('Trip could not be completed after fare save.')

    await store.refresh()
    fareTripId.value = null
    fare.value = ''
    await AndroidOverlay.fareSaved().catch(() => {})
    await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await targetRefresh()
    await syncOverlay()
    notify('Fare saved.')
  } finally {
    fareBusy.value = false
  }
}

async function openCancel() {
  cancelOpen.value = true
  cancelReason.value = ''
  cancelFare.value = ''
  error.value = ''
  message.value = ''
}

async function saveCancel() {
  if (cancelBusy.value) return
  if (!cancelReason.value.trim()) return fail('Cancellation reason is required.')
  if (cancelFare.value !== '' && (!Number.isFinite(Number(cancelFare.value)) || Number(cancelFare.value) < 0)) return fail('Cancellation fare must be a non-negative number.')

  cancelBusy.value = true
  try {
    const result = await store.cancelTrip({
      reason: cancelReason.value.trim(),
      revenue: cancelFare.value
    })
    if (!result?.ok) return fail(result?.reason || 'Cancellation could not be saved.')
    cancelOpen.value = false
    await AndroidOverlay.cancelSaved().catch(() => {})
    await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await syncOverlay()
    notify('Trip cancelled.')
  } finally {
    cancelBusy.value = false
  }
}

async function toggleFuel() {
  fuelOpen.value = !fuelOpen.value
  if (!fuelOpen.value) return
  endOpen.value = false
  fuelOdo.value = ''
  fuelPrice.value = ''
  fuelAmount.value = ''
  fuelFull.value = true
  error.value = ''
  message.value = ''
  await nextTick()
  document.querySelector('.focus-surface input[type="number"]')?.focus()
}

async function saveFuel() {
  if (fuelBusy.value) return
  fuelBusy.value = true
  try {
    const result = await WorkService.recordFuel({
      odometer: fuelOdo.value,
      pricePerKg: fuelPrice.value,
      amount: fuelAmount.value,
      isFullTank: fuelFull.value
    })
    if (!result?.ok) return fail(result.reason)
    fuelOpen.value = false
    notify('Fuel saved.')
  } finally {
    fuelBusy.value = false
  }
}

function seedReview() {
  const revenue = {}
  const km = {}
  const operators = {}
  completed.value.forEach(t => {
    revenue[t.id] = t.revenue ?? ''
    km[t.id] = t.tripKm ?? ''
    operators[t.id] = t.operator ?? store.defaultOperator
  })
  reviewRevenue.value = revenue
  reviewKm.value = km
  reviewOperator.value = operators
}

function openEnd() {
  if (store.isTripActive) return fail('End the active Trip before going Offline.')
  fuelOpen.value = false
  endOpen.value = true
  endStage.value = 'CLOSE'
  closingOdo.value = ''
  shiftRevenue.value = ''
  toll.value = ''
  parking.value = ''
  tollTreatment.value = 'INCLUDED'
  seedReview()
  error.value = ''
  message.value = ''
}

function cancelEnd() {
  endOpen.value = false
  notify('Still Online — End Shift cancelled.')
}

function closeShift() {
  if (!closingOdo.value) return fail('Closing odometer is required.')
  if (shiftRevenue.value === '') return fail('Total shift revenue is required.')
  const closing = Number(closingOdo.value)
  const starting = Number(store.startOdometer)
  if (!Number.isFinite(closing) || closing < starting) return fail(`Closing odometer must be at least ${starting} km.`)
  if (!Number.isFinite(Number(shiftRevenue.value)) || Number(shiftRevenue.value) < 0) return fail('Total shift revenue must be non-negative.')
  seedReview()
  endStage.value = 'RECONCILE'
}

function continueReconcile() {
  if (missing.value.length) return fail('Enter revenue for every listed completed trip.')
  if (preview.value?.reconciliationStatus === 'MISMATCH') {
    endStage.value = 'MISMATCH'
    return
  }
  endStage.value = 'REVIEW'
}

function checkMismatch() {
  if (preview.value?.reconciliationStatus === 'MISMATCH') return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`)
  endStage.value = 'REVIEW'
}

function reviewDone() {
  if (preview.value?.reconciliationStatus === 'MISMATCH') return fail(`Trip fares differ from shift revenue by ${money(Math.abs(preview.value.difference))}.`)
  endStage.value = 'CONFIRM'
}

async function finishEnd() {
  if (endBusy.value || !endReady.value) return
  endBusy.value = true
  try {
    const trips = completed.value.map(t => ({
      id: t.id,
      operator: reviewOperator.value[t.id] ?? t.operator,
      tripKm: reviewKm.value[t.id] ?? t.tripKm ?? '',
      revenue: reviewRevenue.value[t.id] ?? t.revenue ?? ''
    }))
    const result = await store.endShift({
      closingOdometer: closingOdo.value,
      revenue: shiftRevenue.value,
      toll: toll.value,
      parking: parking.value,
      tollParkingRevenueTreatment: tollTreatment.value,
      trips
    })
    if (!result?.ok) return fail(result.reason)
    endStage.value = 'ENDED'
    await KfeRideNotificationService.clear().catch(() => {})
    notify('Shift ended.')
  } finally {
    endBusy.value = false
  }
}

function finishEnded() {
  endOpen.value = false
  closingOdo.value = ''
  shiftRevenue.value = ''
  notify('Offline.')
}

const swipeProgress = computed(() => {
  const width = track.value?.clientWidth || 320
  return Math.max(0, Math.min(100, swipe.value.offset / Math.max(1, width - 76) * 100))
})

function down(event) {
  if (busy.value || !store.isOnline || endOpen.value || fuelOpen.value || cancelOpen.value || pendingFare.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!event.target.closest('.swipe-handle')) return
  swipePointerId.value = event.pointerId
  swipe.value = { down: true, start: event.clientX, offset: 0 }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function move(event) {
  if (!swipe.value.down || swipePointerId.value !== event.pointerId) return
  const max = Math.max(0, (track.value?.clientWidth || 320) - 76)
  swipe.value.offset = Math.max(0, Math.min(max, event.clientX - swipe.value.start))
}

async function up(event) {
  if (!swipe.value.down) return
  if (event?.pointerId != null && swipePointerId.value !== event.pointerId) return
  const commit = swipeProgress.value >= 70
  swipe.value = { down: false, start: 0, offset: 0 }
  swipePointerId.value = null
  if (commit) await doAction()
}

async function doAction() {
  if (active.value) return endTrip()
  if (ready.value) return startTrip()
  return goPickup()
}

function keyAction() {
  if (!busy.value) void doAction()
}

function watchPendingFare() {
  if (!fareTripId.value && pendingFare.value) fareTripId.value = pendingFare.value.id
}

const handleNativeAction = async event => {
  const stage = String(event?.stage || '')
  if (stage === 'GO_TO_PICKUP') return goPickup()
  if (stage === 'START_RIDE') return startTrip()
  if (stage === 'END_RIDE') return endTrip()

  if (stage === 'CANCEL_RIDE') {
    try {
      const payload = event?.input ? JSON.parse(String(event.input)) : {}
      cancelReason.value = payload.reason === 'PASSENGER' ? 'PASSENGER' : 'DRIVER'
      cancelFare.value = payload.revenue === '' || payload.revenue == null ? '' : String(payload.revenue)
      await saveCancel()
    } catch (e) {
      fail(e?.message || 'Cancellation failed.')
    }
    return
  }

  if (stage === 'ENTER_FARE' && event?.input != null) {
    const tripId = String(event.tripId || fareTripId.value || pendingFare.value?.id || '')
    if (!tripId) return
    fareTripId.value = tripId
    fare.value = String(event.input)
    await saveFare()
  }
}

onMounted(async () => {
  await store.initialize()
  await targetRefresh()
  operator.value = store.defaultOperator

  const notificationState = KfeRideNotificationService.getState()
  if (notificationState?.phase === 'ENTER_FARE' && notificationState?.tripId === store.trip?.id) {
    fareTripId.value = store.trip.id
  }
  if (pendingFare.value) fareTripId.value = pendingFare.value.id

  clock.value = Date.now()
  timer = setInterval(() => { clock.value = Date.now() }, 1000)

  notificationListener = await KfeRideNotificationService.addListener(
    'rideNotificationAction',
    event => { void handleNativeAction(event) }
  )

  const pending = await KfeRideNotificationService.consumePendingAction()
  if (pending) {
    await handleNativeAction(pending)
    await KfeRideNotificationService.clearPendingAction()
  }

  await KfeRideNotificationService.resume().catch(() => {})
  await syncOverlay()
})

watch(() => store.completedTrips.map(t => t.id + ':' + (t.revenue ?? '')).join('|'), watchPendingFare)
watch(() => store.isOnline, () => { void syncOverlay() })
watch(() => store.trip?.tripStage, () => { void syncOverlay() })
watch(pendingFare, async value => {
  if (value && !endOpen.value && !nativeAndroid) {
    await nextTick()
    fareInput.value?.focus()
    fareInput.value?.select?.()
  }
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (traceRunning) MovementTraceService.reset()
  notificationListener?.remove?.()
  void AndroidOverlay.hide().catch(() => {})
})
</script>

<template>
<div class="work-canonical">
  <header class="work-header">
    <div class="identity"><strong>KFE WORK</strong></div>
    <div class="header-controls">
      <button class="icon-action" type="button" aria-label="CNG refuelling" title="CNG refuelling" @click="toggleFuel">⛽</button>
      <button class="shift-toggle" :class="{ online: store.isOnline }" type="button" :aria-pressed="store.isOnline" @click="store.isOnline ? openEnd() : openStart()">
        <span>{{ store.isOnline ? 'ONLINE' : 'OFFLINE' }}</span><i aria-hidden="true"/>
      </button>
    </div>
  </header>

  <main class="work-main">
    <section v-if="!store.isOnline && startOpen && !fuelOpen && !endOpen" class="state-gate start-shift-gate state-tone-warning">
      <div class="gate-head"><div><span class="eyebrow">START SHIFT</span><h2>Odometer check</h2></div><button class="text-action" type="button" @click="startOpen=false">Back</button></div>
      <label>Current odometer<div class="input-unit"><input v-model="startOdo" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off"><b>km</b></div></label>
      <label class="check-row"><input v-model="startAck" type="checkbox"><span>I confirm this is the current vehicle odometer.</span></label>
      <div v-if="gapKm>0" class="gap-panel">
        <div><span class="eyebrow">ODOMETER GAP</span><strong>{{ gapKm }} km</strong><p>Classify the full gap.</p></div>
        <div class="choice-row"><button type="button" :class="{selected:gapChoice==='PERSONAL'}" @click="gapChoice='PERSONAL'">Personal KM</button><button type="button" :class="{selected:gapChoice==='DEAD'}" @click="gapChoice='DEAD'">Dead KM</button></div>
      </div>
      <button class="primary-action" :disabled="startBusy" @click="submitStart">{{ startBusy ? 'STARTING…' : 'CONFIRM & GO ONLINE' }}</button>
    </section>

    <section v-if="endOpen" class="state-gate end-gate state-tone-warning">
      <div class="gate-head"><div><span class="eyebrow">GOING OFFLINE</span><h2>{{ endStage==='CLOSE'?'Close shift':endStage==='RECONCILE'?'Reconciliation':endStage==='MISMATCH'?'Revenue exception':endStage==='REVIEW'?'Shift review':endStage==='CONFIRM'?'Ready to end':'Shift ended' }}</h2></div><button v-if="endStage==='CLOSE'" class="text-action" type="button" @click="cancelEnd">Back</button></div>

      <template v-if="endStage==='CLOSE'">
        <div class="fact-line"><span>Shift started</span><strong>{{ store.startOdometer }} km</strong></div>
        <label>Closing odometer<div class="input-unit"><input v-model="closingOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div></label>
        <label>Total shift revenue<div class="input-unit"><b>₹</b><input v-model="shiftRevenue" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
        <button class="primary-action" @click="closeShift">CONTINUE</button>
      </template>

      <template v-else-if="endStage==='RECONCILE'">
        <div v-if="missing.length" class="exception-panel"><span class="eyebrow">ACTION REQUIRED</span><h3>Missing trip revenue</h3><p>Complete the listed fares before continuing.</p><div v-for="trip in missing" :key="trip.id" class="reconcile-row"><div><strong>{{ trip.operator }}</strong><span>{{ Number(trip.tripKm||0).toFixed(1) }} km</span></div><div class="input-unit compact"><b>₹</b><input :value="reviewRevenue[trip.id]" type="number" inputmode="numeric" min="0" @input="reviewRevenue={...reviewRevenue,[trip.id]:$event.target.value}"></div></div></div>
        <div v-else class="success-panel"><strong>ALL REVENUE CAPTURED</strong><span>No missing trip revenue exceptions.</span></div>
        <div class="fact-grid"><div><span>Shift revenue</span><strong>{{ money(shiftRevenue) }}</strong></div><div><span>Trip revenue</span><strong>{{ money(preview?.tripRevenue) }}</strong></div></div>
        <button class="primary-action" @click="continueReconcile">CONTINUE</button>
      </template>

      <template v-else-if="endStage==='MISMATCH'">
        <div class="exception-panel"><span class="eyebrow">REVENUE EXCEPTION</span><h3>Shift total and trip fares differ</h3><p>Correct the entries before continuing.</p><div class="fact-grid"><div><span>Trip fares</span><strong>{{ money(preview?.tripRevenue) }}</strong></div><div><span>Difference</span><strong>{{ money(Math.abs(preview?.difference||0)) }}</strong></div></div></div>
        <label>Correct total shift revenue<div class="input-unit"><b>₹</b><input v-model="shiftRevenue" type="number" inputmode="numeric" min="0"></div></label>
        <button class="primary-action" @click="checkMismatch">CHECK AGAIN</button>
      </template>

      <template v-else-if="endStage==='REVIEW'">
        <div class="fact-grid review"><div><span>Trips</span><strong>{{ completed.length }}</strong></div><div><span>Total shift KM</span><strong>{{ shiftKm.toFixed(1) }}</strong></div><div><span>Trip KM</span><strong>{{ completed.reduce((s,t)=>s+Number(reviewKm[t.id]??t.tripKm??0),0).toFixed(1) }}</strong></div><div><span>Dead KM</span><strong>{{ Math.max(0,shiftKm-completed.reduce((s,t)=>s+Number(reviewKm[t.id]??t.tripKm??0),0)).toFixed(1) }}</strong></div><div><span>Revenue</span><strong>{{ money(shiftRevenue) }}</strong></div></div>
        <div class="review-costs"><span class="eyebrow">BUSINESS COSTS</span><label>Business toll<div class="input-unit"><b>₹</b><input v-model="toll" type="number" inputmode="numeric" min="0"></div></label><label>Business parking<div class="input-unit"><b>₹</b><input v-model="parking" type="number" inputmode="numeric" min="0"></div></label><label class="check-row"><input v-model="tollTreatment" true-value="EXCLUDED" false-value="INCLUDED" type="checkbox"><span>Exclude toll & parking from trip fare</span></label></div>
        <button class="primary-action" @click="reviewDone">REVIEW COMPLETE</button>
      </template>

      <template v-else-if="endStage==='CONFIRM'">
        <div class="completion-panel"><span class="eyebrow">SHIFT REVIEW</span><strong>READY TO END</strong><p>{{ completed.length }} completed trips · {{ shiftKm.toFixed(1) }} km · {{ money(shiftRevenue) }} revenue.</p></div>
        <div class="fact-grid two"><div><span>Business toll</span><strong>{{ money(toll||0) }}</strong></div><div><span>Business parking</span><strong>{{ money(parking||0) }}</strong></div></div>
        <button class="primary-action" :disabled="endBusy" @click="finishEnd">{{ endBusy ? 'ENDING SHIFT…' : 'OK — END SHIFT' }}</button>
      </template>

      <template v-else>
        <div class="completion-panel success"><span class="completion-mark" aria-hidden="true">✓</span><strong>SHIFT ENDED</strong><p>Your shift has been saved. You are now offline.</p></div>
        <button class="primary-action" @click="finishEnded">OK</button>
      </template>
    </section>

    <section v-if="!store.isOnline && !startOpen && !fuelOpen && !endOpen" class="offline-state state-tone-neutral">
      <div class="state-mark" aria-hidden="true">○</div><span class="eyebrow">CURRENT STATE</span><strong>OFFLINE</strong><p>Shift is not active.</p><button class="primary-action" @click="openStart">START SHIFT</button>
    </section>

    <template v-if="store.isOnline && !fuelOpen && !endOpen && !pendingFare && !cancelOpen">
      <section class="instrument target-instrument">
        <div><span class="eyebrow">TODAY'S TARGET</span><strong>{{ targetValue==null ? '—' : money(targetValue) }}</strong></div>
        <div class="target-meta"><span>PROGRESS</span><strong>{{ targetProgress }}%</strong></div>
        <div class="progress-track"><i :style="{width:targetProgress+'%'}"/></div>
      </section>

      <section v-if="cockpit.state===WORK_COCKPIT_STATES.READY" class="operational-state state-tone-info">
        <strong>READY FOR NEXT PICKUP</strong>
        <label class="operator-compact"><span>Operator</span><select v-model="operator"><option v-for="item in store.operators" :key="item">{{ item }}</option></select></label>
      </section>

      <section v-else-if="cockpit.state===WORK_COCKPIT_STATES.PICKUP" class="operational-state state-tone-info">
        <span class="eyebrow">GOING TO PICKUP</span><strong>{{ store.trip?.operator || 'TRIP' }}</strong><p>Pickup movement is active. GPS remains background telemetry.</p><button class="secondary-action cancel-trip-tab" type="button" @click="openCancel">CANCEL TRIP</button>
      </section>

      <section v-else class="operational-state trip-timer-state state-tone-success">
        <span class="eyebrow">TRIP ACTIVE</span><strong>{{ store.trip?.operator || 'TRIP' }}</strong>
        <div class="trip-timer-block"><span class="timer-label">TRIP TIME</span><strong class="trip-timer" aria-live="polite">{{ tripTimer }}</strong></div>
      </section>

      <section class="action-instrument">
        <div class="action-heading"><strong>{{ actionLabel }}</strong><details class="swipe-help"><summary aria-label="Swipe help">?</summary><span>Swipe the handle right to {{ actionLabel.toLowerCase() }}.</span></details></div>
        <div ref="track" class="swipe trip-swipe" :class="{threshold:swipeProgress>=70,committing:busy,'semantic-go':cockpit.action==='GO_TO_PICKUP','semantic-start':cockpit.action==='START_RIDE','semantic-end':cockpit.action==='END_RIDE'}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="swipe-copy"><span>{{ swipeProgress>=70 ? 'RELEASE' : 'SWIPE' }}</span><strong>{{ actionLabel }}</strong></div>
          <button class="swipe-handle" type="button" :aria-label="actionLabel" @pointerup.stop="keyAction" @click="keyAction">→</button>
        </div>
      </section>
    </template>

    <section v-if="pendingFare && !endOpen" class="focus-surface state-tone-warning">
      <div class="focus-head"><div><span class="eyebrow">ENTER FARE</span><strong>TRIP COMPLETED</strong></div></div>
      <div class="fact-grid two"><div><span>Operator</span><strong>{{ pendingFare.operator }}</strong></div><div><span>Trip KM</span><strong>{{ Number(pendingFare.tripKm||0).toFixed(1) }} km</strong></div></div>
      <label>Trip fare<div class="input-unit"><b>₹</b><input ref="fareInput" v-model="fare" type="number" inputmode="numeric" enterkeyhint="done" min="0" autocomplete="off"></div></label>
      <button class="primary-action" :disabled="fareBusy" @click="saveFare">{{ fareBusy ? 'SAVING…' : 'OK — SAVE FARE' }}</button>
    </section>

    <section v-if="cancelOpen" class="focus-surface state-tone-warning">
      <div class="gate-head"><div><span class="eyebrow">CANCELLATION</span><strong>CAPTURE CANCELLATION</strong></div><button class="text-action" type="button" @click="cancelOpen=false">Back</button></div>
      <div class="choice-field"><span class="field-label">Cancellation reason</span><div class="choice-row cancellation-reasons"><button type="button" :class="{selected:cancelReason==='PASSENGER'}" @click="cancelReason='PASSENGER'">Passenger cancellation</button><button type="button" :class="{selected:cancelReason==='DRIVER'}" @click="cancelReason='DRIVER'">Driver cancellation</button></div></div>
      <label>Cancellation fare <span class="optional-label">optional where applicable</span><div class="input-unit"><b>₹</b><input v-model="cancelFare" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <button class="primary-action" :disabled="cancelBusy" @click="saveCancel">{{ cancelBusy ? 'SAVING…' : 'OK — CONFIRM CANCELLATION' }}</button>
    </section>

    <section v-if="fuelOpen" class="focus-surface state-tone-info">
      <div class="gate-head"><div><span class="eyebrow">FUEL</span><strong>CNG REFUEL</strong></div><button class="text-action" type="button" @click="toggleFuel">Close</button></div>
      <label>Odometer<div class="input-unit"><input v-model="fuelOdo" type="number" inputmode="numeric" enterkeyhint="next" min="0"><b>km</b></div></label>
      <label>Price / kg<div class="input-unit"><b>₹</b><input v-model="fuelPrice" type="number" inputmode="decimal" enterkeyhint="next" min="0" step=".01"></div></label>
      <label>Amount<div class="input-unit"><b>₹</b><input v-model="fuelAmount" type="number" inputmode="numeric" enterkeyhint="done" min="0"></div></label>
      <div class="calculated-value"><span>Quantity</span><strong>{{ fuelQty.valid ? fuelQty.quantityKg.toFixed(2)+' kg' : '—' }}</strong></div>
      <label class="check-row"><input v-model="fuelFull" type="checkbox"><span>Full tank</span></label>
      <button class="primary-action" :disabled="fuelBusy" @click="saveFuel">{{ fuelBusy ? 'SAVING…' : 'OK — SAVE FUEL' }}</button>
    </section>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="message" class="feedback success" role="status">{{ message }}</p>
  </main>
</div>
</template>
