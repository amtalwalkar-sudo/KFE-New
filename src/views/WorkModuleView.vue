<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { MovementTraceService } from '../infrastructure/location/movementTraceService.js'
import { KfeRideNotificationService } from '../infrastructure/android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../infrastructure/android/kfeOverlay.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'
import WorkContextForm from '../components/work/WorkContextForm.vue'

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
const tripToll = ref('')
const tripParking = ref('')
const fareBusy = ref(false)


const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelFare = ref('')
const cancelBusy = ref(false)

const fuelOpen = ref(false)
const fuelOdo = ref('')
const fuelPrice = ref('')
const fuelAmount = ref('')
const fuelFull = ref(true)
const fuelPartial = computed({ get: () => !fuelFull.value, set: value => { fuelFull.value = !value } })
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
    const selected = completed.value.find(t => t.id === fareTripId.value)
    if (selected) return selected
  }
  // Recover the latest unpriced completed trip after a WebView/PWA restart.
  // Explicitly skipped details are terminal and must not reopen.
  return [...completed.value]
    .filter(t => t.revenue == null && t.fareDetailsSkipped !== true)
    .sort((a, b) => Date.parse(b.tripEndAt || b.updatedAt || '') - Date.parse(a.tripEndAt || a.updatedAt || ''))[0] || null
})

const cockpit = computed(() => deriveWorkCockpitState({
  shift: store.shift,
  trip: store.trip,
  pendingFareId: pendingFare.value?.id || '',
  target: targetValue.value == null ? '—' : money(targetValue.value),
  targetProgress: targetProgress.value,
  liveKm: '0.0 km',
  revenue: '₹0',
  asOf: clock.value
}))

const ready = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP || cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP)
const active = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE)
const actionLabel = computed(() => {
  if (cockpit.value.action === 'END_RIDE') return 'END TRIP'
  if (cockpit.value.action === 'START_RIDE') return 'START TRIP'
  return 'GO TO PICKUP'
})
const shiftTimer = computed(() => {
  const elapsed = Math.max(0, Number(cockpit.value.shiftDurationMs || 0))
  const seconds = Math.floor(elapsed / 1000)
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
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
  reviewedDeadKm.value >= -0.000001
)
const shiftKm = computed(() => Math.max(
  0,
  Number(closingOdo.value || store.lastKnownOdometer || store.startOdometer || 0) - Number(store.startOdometer || 0)
))
const tripKmForReview = trip => {
  const edited = reviewKm.value[trip.id]
  const raw = edited === '' || edited == null ? trip.tripKm : edited
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : 0
}
const reviewedTripKm = computed(() => completed.value.reduce((sum, trip) => sum + tripKmForReview(trip), 0))
const reviewedDeadKm = computed(() => shiftKm.value - reviewedTripKm.value)
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

  // Shift-end revenue is the ERP authority. Trip fares are optional supporting
  // detail and must never become a competing overlay revenue total.
  const revenue = money(store.shift?.revenue ?? 0)
  let liveKm = '0.0 km'
  let trips = []
  try {
    trips = await WorkService.getTripsForShift(store.shift.id)
  } catch (_) {}

  if (store.trip?.id) {
    try {
      const distance = await WorkService.getTripGpsDistanceKm(store.trip.id)
      if (Number.isFinite(Number(distance))) liveKm = Number(distance).toFixed(1) + ' km'
    } catch (_) {}
  }

  const recoveredPendingFareId = pendingFare.value?.id || [...trips]
    .filter(t => t.status === 'COMPLETED' && t.revenue == null && t.fareDetailsSkipped !== true)
    .sort((a, b) => Date.parse(b.tripEndAt || b.updatedAt || '') - Date.parse(a.tripEndAt || a.updatedAt || ''))[0]?.id || ''

  const state = deriveWorkCockpitState({
    shift: store.shift,
    trip: store.trip,
    trips,
    pendingFareId: recoveredPendingFareId,
    notificationPhase: KfeRideNotificationService.getState()?.phase || '',
    target: targetValue.value == null ? '—' : money(targetValue.value),
    targetProgress: targetProgress.value,
    liveKm,
    revenue
  })

  await AndroidOverlay.update({
    theme: document.documentElement.getAttribute('data-kfe-theme') === 'night' ? 'dark' : 'light',
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
    overlayAction: state.pendingFareId && (!store.trip?.id || store.trip.status !== 'ACTIVE') ? 'ENTER_FARE' : state.action,
    overlayTripId: state.pendingFareId && (!store.trip?.id || store.trip.status !== 'ACTIVE') ? state.pendingFareId : state.tripId,
    pendingFareId: state.pendingFareId
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
  // Let the driver's tap focus the field so Android reliably opens its numeric keyboard.
}

function setStartGapChoice(choice) {
  gapChoice.value = choice
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

async function goPickup(nativeTripId = '') {
  if (busy.value || !store.isOnline || store.isTripActive) return false
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

    const result = await store.beginPickup(operator.value || store.defaultOperator, nativeTripId || null)
    if (!result?.ok) {
      if (traceRunning) MovementTraceService.reset()
      traceRunning = false
      fail(result?.reason || 'Could not start pickup.')
      return false
    }
    await KfeRideNotificationService.beginPickup(store.trip?.id || '').catch(() => {})
    await syncOverlay()
    notify('Going to pickup.')
    return true
  } finally {
    busy.value = false
  }
}

async function startTrip() {
  if (busy.value || !ready.value) return false
  busy.value = true
  try {
    if (traceRunning) {
      MovementTraceService.reset()
      traceRunning = false
    }
    const result = await store.startRide()
    if (!result?.ok) { fail(result?.reason || 'Trip could not be started.'); return false }
    await KfeRideNotificationService.startRide().catch(() => {})
    await syncOverlay()
    notify('Trip active.')
    return true
  } finally {
    busy.value = false
  }
}

async function endTrip() {
  if (busy.value || !active.value) return false
  busy.value = true
  try {
    const tripId = store.trip.id
    if (!await store.endTrip()) { fail('Trip could not be completed.'); return false }
    fareTripId.value = tripId
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    await KfeRideNotificationService.completeRide().catch(() => {})
    await syncOverlay()
    notify('Trip ended. Add optional details or skip.')
    return true
  } catch (e) {
    fail(e?.message || 'Trip could not be completed. Please retry.')
    return false
  } finally {
    busy.value = false
  }
}

async function saveFare(fromNative = false) {
  if (fareBusy.value || !pendingFare.value) return false
  for (const [label, value] of [['Trip fare', fare.value], ['Toll', tripToll.value], ['Parking', tripParking.value]]) {
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return fail(`${label} must be a non-negative number.`)
  }

  fareBusy.value = true
  try {
    const details = {
      id: pendingFare.value.id,
      ...(fare.value === '' ? {} : { revenue: Number(fare.value) }),
      fareDetailsSkipped: fare.value === '',
      toll: tripToll.value === '' ? 0 : Number(tripToll.value),
      parking: tripParking.value === '' ? 0 : Number(tripParking.value)
    }
    const result = await store.updateTrip(details)
    if (!result?.ok) { fail(result?.reason || 'Trip details could not be saved.'); return false }

    fareTripId.value = null
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    if (!fromNative) await AndroidOverlay.fareSaved().catch(() => {})
    if (!fromNative) await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await targetRefresh()
    await syncOverlay()
    notify('Trip details saved.')
    return true
  } finally {
    fareBusy.value = false
  }
}

async function skipTripDetails() {
  if (!pendingFare.value || fareBusy.value) return
  fareBusy.value = true
  try {
    const result = await store.updateTrip({ id: pendingFare.value.id, fareDetailsSkipped: true })
    if (!result?.ok) return fail(result?.reason || 'Trip detail skip could not be saved.')
    fareTripId.value = null
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    await AndroidOverlay.fareSaved().catch(() => {})
    await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await syncOverlay()
    notify('Trip details skipped.')
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

async function saveCancel(fromNative = false) {
  if (cancelBusy.value) return false
  if (!cancelReason.value.trim()) { fail('Cancellation reason is required.'); return false }
  if (cancelFare.value === '') { fail('Cancellation fee is required.'); return false }
  if (!Number.isFinite(Number(cancelFare.value)) || Number(cancelFare.value) < 0) { fail('Cancellation fee must be a non-negative number.'); return false }

  cancelBusy.value = true
  try {
    const result = await store.cancelTrip({
      reason: cancelReason.value.trim(),
      revenue: cancelFare.value
    })
    if (!result?.ok) { fail(result?.reason || 'Cancellation could not be saved.'); return false }
    cancelOpen.value = false
    if (!fromNative) await AndroidOverlay.cancelSaved().catch(() => {})
    if (!fromNative) await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await syncOverlay()
    notify('Trip cancelled.')
    return true
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
}


async function handleContextAction(action) {
  if (action === 'back-start') { startOpen.value = false; return }
  if ((typeof action === 'object' ? action.name : action) === 'submit-start') {
    if (typeof action === 'object') {
      startOdo.value = String(action.startOdo ?? '')
      startAck.value = Boolean(action.startAck)
    }
    await submitStart()
    return
  }
  if (action === 'save-fare') { await saveFare(); return }
  if (action === 'skip-fare') { await skipTripDetails(); return }
  if (action === 'back-cancel') { cancelOpen.value = false; return }
  if (action === 'save-cancel') { await saveCancel(); return }
  if (action === 'close-fuel') { fuelOpen.value = false; return }
  if (action === 'save-fuel') { await saveFuel(); return }
  if (action === 'back-end') { cancelEnd(); return }
  if (action === 'close-end') { closeShift(); return }
  if (action === 'continue-reconcile') { continueReconcile(); return }
  if (action === 'review-complete') { reviewDone(); return }
  if (action === 'finish-end') { await finishEnd(); return }
  if (action === 'finish-ended') { finishEnded() }
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
  // Trip fares are optional supporting detail. Shift-end revenue remains authoritative.
  endStage.value = 'REVIEW'
}

function reviewDone() {
  endStage.value = 'CONFIRM'
}

async function finishEnd() {
  if (endBusy.value || !endReady.value) return
  endBusy.value = true
  try {
    if (reviewedDeadKm.value < -0.000001) return fail('Completed trip KM exceeds total shift KM. Correct the trip KM before ending the shift.')
    const trips = completed.value.map(t => ({
      id: t.id,
      operator: reviewOperator.value[t.id] ?? t.operator,
      tripKm: reviewKm.value[t.id] === '' || reviewKm.value[t.id] == null ? (t.tripKm ?? '') : reviewKm.value[t.id],
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
  if (busy.value || !store.isOnline || endOpen.value || fuelOpen.value || cancelOpen.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!event.target.closest('.swipe-handle')) return
  swipePointerId.value = event.pointerId
  swipe.value = { down: true, start: event.clientX, offset: 0 }
  event.preventDefault?.()
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function move(event) {
  if (!swipe.value.down || swipePointerId.value !== event.pointerId) return
  event.preventDefault?.()
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

const handleNativeAction = async event => {
  const stage = String(event?.stage || '')
  if (stage === 'GO_TO_PICKUP') return Boolean(await goPickup(String(event?.tripId || '')))
  if (stage === 'START_RIDE') return Boolean(await startTrip())
  if (stage === 'END_RIDE') return Boolean(await endTrip())

  if (stage === 'CANCEL_RIDE') {
    try {
      const payload = event?.input ? JSON.parse(String(event.input)) : {}
      cancelReason.value = payload.reason === 'PASSENGER' ? 'PASSENGER' : 'DRIVER'
      cancelFare.value = payload.revenue === '' || payload.revenue == null ? '' : String(payload.revenue)
      return Boolean(await saveCancel(true))
    } catch (e) {
      fail(e?.message || 'Cancellation failed.')
      return false
    }
  }

  if (stage === 'ENTER_FARE' && event?.input != null) {
    const tripId = String(event.tripId || fareTripId.value || pendingFare.value?.id || '')
    if (!tripId) return false
    fareTripId.value = tripId
    try {
      const payload = JSON.parse(String(event.input))
      fare.value = payload.fare == null ? '' : String(payload.fare)
      tripToll.value = payload.toll == null ? '' : String(payload.toll)
      tripParking.value = payload.parking == null ? '' : String(payload.parking)
    } catch (_) {
      fare.value = String(event.input)
      tripToll.value = ''
      tripParking.value = ''
    }
    return Boolean(await saveFare(true))
  }
  return false
}

async function processNativeEvent(event) {
  try {
    const saved = await handleNativeAction(event)
    if (saved && event?.eventId) await KfeRideNotificationService.acknowledgeAction(event.eventId, String(event?.stage || ''), String(event?.tripId || ''))
    else if (!saved && event?.eventId) await KfeRideNotificationService.recordActionFailure(event.eventId, 'Work did not confirm the action was saved')
    return saved
  } catch (error) {
    if (event?.eventId) await KfeRideNotificationService.recordActionFailure(event.eventId, error?.message || error)
    return false
  }
}

onMounted(async () => {
  await store.initialize()
  await targetRefresh()
  operator.value = store.defaultOperator

  clock.value = Date.now()
  timer = setInterval(() => { clock.value = Date.now() }, 1000)

  notificationListener = await KfeRideNotificationService.addListener(
    'rideNotificationAction',
    event => { void processNativeEvent(event) }
  )

  // Replay every native event in durable creation order. Failed/unconfirmed
  // writes remain pending for the next launch instead of being silently lost.
  const pendingEvents = await KfeRideNotificationService.consumePendingActions()
  for (const event of pendingEvents) await processNativeEvent(event)

  // Compatibility for events created by app versions before the SQLite ledger.
  if (!pendingEvents.length) {
    const pending = await KfeRideNotificationService.consumePendingAction()
    if (pending && await handleNativeAction(pending)) await KfeRideNotificationService.clearPendingAction()
  }

  await KfeRideNotificationService.resume().catch(() => {})
  await syncOverlay()
})

watch(() => store.isOnline, () => { void syncOverlay() })
watch(() => store.trip?.tripStage, () => { void syncOverlay() })


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

  <main class="work-main contextual-form-shell">
    <WorkContextForm
      v-show="!store.isOnline && startOpen"
      type="start"
      :gap="gap"
      :gap-km="gapKm"
      :start-busy="startBusy"
      :start-odo="startOdo"
      :start-ack="startAck"
      :gap-choice="gapChoice"
      @update:start-odo="startOdo=$event"
      @update:start-ack="startAck=$event"
      @update:gap-choice="setStartGapChoice"
      @action="handleContextAction"
    />

    <WorkContextForm
      v-if="endOpen"
      type="end"
      :end-stage="endStage"
      :end-missing="missing"
      :end-preview="preview"
      :end-completed-count="completed.length"
      :end-shift-km="shiftKm"
      :end-reviewed-trip-km="reviewedTripKm"
      :end-reviewed-dead-km="reviewedDeadKm"
      :end-ready="endReady"
      :end-busy="endBusy"
      :money="money"
      :start-odo="String(store.startOdometer ?? '')"
      :closing-odo="closingOdo"
      :shift-revenue="shiftRevenue"
      :review-revenue="reviewRevenue"
      :review-km="reviewKm"
      :review-operator="reviewOperator"
      :toll-treatment="tollTreatment"
      @update:closing-odo="closingOdo=$event"
      @update:shift-revenue="shiftRevenue=$event"
      @update:review-revenue="reviewRevenue=$event"
      @update:review-km="reviewKm=$event"
      @update:review-operator="reviewOperator=$event"
      @update:toll-treatment="tollTreatment=$event"
      @action="handleContextAction"
    />

    <section v-if="!store.isOnline" class="offline-state state-tone-neutral" :class="{ 'contextual-context': startOpen || fuelOpen }">
      <div class="state-mark" aria-hidden="true">○</div><span class="eyebrow">CURRENT STATE</span><strong>OFFLINE</strong><p>Shift is not active.</p><button v-if="!startOpen && !fuelOpen" class="primary-action" @click="openStart">START SHIFT</button>
    </section>

    <template v-if="store.isOnline">
      <section class="instrument target-instrument">
        <div><span class="eyebrow">TODAY'S TARGET</span><strong>{{ targetValue==null ? '—' : money(targetValue) }}</strong></div>
        <div class="target-meta"><span>PROGRESS</span><strong>{{ targetProgress }}%</strong><span>SHIFT {{ shiftTimer }}</span></div>
        <div class="progress-track"><i :style="{width:targetProgress+'%'}"/></div>
      </section>

      <section v-if="cockpit.state===WORK_COCKPIT_STATES.READY" class="operational-state state-tone-info">
        <strong>READY FOR NEXT PICKUP</strong>
        <label class="operator-compact"><span>Operator</span><select v-model="operator"><option v-for="item in store.operators" :key="item">{{ item }}</option></select></label>
      </section>

      <section v-else-if="cockpit.state===WORK_COCKPIT_STATES.READY_FOR_TRIP || cockpit.state===WORK_COCKPIT_STATES.GOING_TO_PICKUP" class="operational-state state-tone-info">
        <span class="eyebrow">GOING TO PICKUP</span><strong>{{ store.trip?.operator || 'TRIP' }}</strong><p>Pickup movement is active. GPS remains background telemetry.</p><button class="secondary-action cancel-trip-tab" type="button" @click="openCancel">CANCEL TRIP</button>
      </section>

      <section v-else-if="cockpit.state===WORK_COCKPIT_STATES.TRIP_ACTIVE" class="operational-state trip-timer-state state-tone-success">
        <span class="eyebrow">TRIP ACTIVE</span><strong>{{ store.trip?.operator || 'TRIP' }}</strong>
        <div class="trip-timer-block"><span class="timer-label">TRIP TIME</span><strong class="trip-timer" aria-live="polite">{{ tripTimer }}</strong></div>
      </section>

      <section v-if="!fuelOpen && !endOpen && !cancelOpen" class="action-instrument work-fixed-action">
        <div ref="track" class="swipe trip-swipe" :class="{threshold:swipeProgress>=70,committing:busy,'semantic-go':cockpit.action==='GO_TO_PICKUP','semantic-start':cockpit.action==='START_RIDE','semantic-end':cockpit.action==='END_RIDE'}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="swipe-copy"><span>{{ swipeProgress>=70 ? 'RELEASE' : 'SWIPE' }}</span><strong>{{ actionLabel }}</strong></div>
          <button class="swipe-handle" type="button" :aria-label="actionLabel" :style="{ transform: `translateX(${swipe.offset}px)`, transition: swipe.down ? 'none' : 'transform 180ms ease-out' }" @keydown.enter.prevent="keyAction" @keydown.space.prevent="keyAction">→</button>
        </div>
      </section>
    </template>

    <WorkContextForm
      v-if="pendingFare && !endOpen && !cancelOpen && !fuelOpen"
      type="fare"
      :fare-busy="fareBusy"
      :fare="fare"
      :trip-toll="tripToll"
      :trip-parking="tripParking"
      @update:fare="fare=$event"
      @update:trip-toll="tripToll=$event"
      @update:trip-parking="tripParking=$event"
      @action="handleContextAction"
    />

    <WorkContextForm
      v-if="cancelOpen"
      type="cancel"
      :cancel-busy="cancelBusy"
      :cancel-reason="cancelReason"
      :cancel-fare="cancelFare"
      @update:cancel-reason="cancelReason=$event"
      @update:cancel-fare="cancelFare=$event"
      @action="handleContextAction"
    />

    <WorkContextForm
      v-if="fuelOpen"
      type="fuel"
      :fuel-busy="fuelBusy"
      :fuel-odo="fuelOdo"
      :fuel-price="fuelPrice"
      :fuel-amount="fuelAmount"
      :fuel-partial="fuelPartial"
      :fuel-qty="fuelQty"
      @update:fuel-odo="fuelOdo=$event"
      @update:fuel-price="fuelPrice=$event"
      @update:fuel-amount="fuelAmount=$event"
      @update:fuel-partial="fuelPartial=$event"
      @action="handleContextAction"
    />

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="message" class="feedback success" role="status">{{ message }}</p>
  </main>
</div>
</template>
