<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { MovementReconciliationQueue } from '../application/work/movementReconciliationQueue.js'
import { WorkDraftService } from '../application/work/workDraftService.js'
import { WorkflowTimerService, WorkWorkflowSessionService } from '../application/work/workflowTimerService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { MovementTraceService, calculateTraceDistanceKm } from '../infrastructure/location/movementTraceService.js'
import { NativeGpsService } from '../infrastructure/android/nativeGpsService.js'
import { KfeRideNotificationService } from '../infrastructure/android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../infrastructure/android/kfeOverlay.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'
import WorkContextForm from '../components/work/WorkContextForm.vue'

const store = useShiftTripStore()
const fuel = useFuelStore()
const nativeAndroid = Capacitor.getPlatform() === 'android'
const startWorkflowId = ref('')
const fuelWorkflowId = ref('')
let restoringDrafts = false
let workflowTimerReady = false

const startOdo = ref('')
const startAck = ref(false)
const gapChoice = ref('')
const startBusy = ref(false)
const startOpen = ref(false)

const operator = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')
const fuelSaveConfirmation = ref(false)

const fareTripId = ref(null)
const fare = ref('')
const tripToll = ref('')
const tripParking = ref('')
const tripTollTreatment = ref('INCLUDED')
const tripParkingTreatment = ref('INCLUDED')
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
const parkingTreatment = ref('INCLUDED')
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
let liveKmRefreshTimer = null
let traceRunning = false
let notificationListener = null

const money = value => Number.isFinite(Number(value))
  ? '₹' + Math.round(Number(value)).toLocaleString('en-IN')
  : '—'

const notify = text => {
  fuelSaveConfirmation.value = text === 'Fuel saved.'
  message.value = text
  error.value = ''
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 8000)
}
const fail = text => { fuelSaveConfirmation.value = false; error.value = text; message.value = '' }

const tripDraftIdentity = (formId, step, tripId = store.trip?.id, shiftId = store.shift?.id) => ({
  formId, workflowStep: step, parentType: 'TRIP', parentId: tripId, ownerId: shiftId
})
const shiftDraftIdentity = (formId, step, shiftId = store.shift?.id) => ({
  formId, workflowStep: step, parentType: 'SHIFT', parentId: shiftId
})
const startDraftIdentity = () => ({
  formId: 'work-start-shift', workflowStep: 'START_SHIFT', parentType: 'WORKFLOW',
  workflowId: startWorkflowId.value
})
const fuelDraftIdentity = () => store.shift?.id
  ? shiftDraftIdentity('work-fuel', 'RECORD_FUEL')
  : { formId: 'work-fuel', workflowStep: 'RECORD_FUEL', parentType: 'WORKFLOW', workflowId: fuelWorkflowId.value }
const restoreDraft = async identity => {
  try { return await WorkDraftService.get(identity) } catch (_) { return null }
}
let draftWriteQueue = Promise.resolve()
const committedDraftKeys = new Set()
const draftIdentityKey = identity => JSON.stringify([
  identity?.formId, identity?.workflowStep, identity?.parentType,
  identity?.parentId || null, identity?.ownerId || null, identity?.workflowId || null
])
const saveDraft = (identity, values) => {
  if (restoringDrafts || committedDraftKeys.has(draftIdentityKey(identity))) return draftWriteQueue
  draftWriteQueue = draftWriteQueue.then(() => WorkDraftService.save(identity, values)).catch(() => {
    fail('Draft could not be saved locally. Keep this form open and retry.')
    return null
  })
  return draftWriteQueue
}
const clearCommittedDraft = async (identity, { quiet = false } = {}) => {
  const key = draftIdentityKey(identity)
  committedDraftKeys.add(key)
  await draftWriteQueue
  try { await WorkDraftService.clear(identity, { committed: true }) }
  catch (_) {
    // A draft-cleanup failure must not overwrite the authoritative commit
    // confirmation or make a saved fuel record look unsaved. The draft is never
    // auto-submitted; a later open still requires explicit user confirmation.
    if (!quiet) fail('The record was saved, but its temporary draft could not be cleared. Do not replay it; reopen the record and verify the saved value.')
  }
}

watch([startOdo, startAck, gapChoice], () => {
  if (!startOpen.value || !startWorkflowId.value || restoringDrafts) return
  saveDraft(startDraftIdentity(), { startOdo: startOdo.value, startAck: startAck.value, gapChoice: gapChoice.value })
})
watch([fare, tripToll, tripParking, tripTollTreatment, tripParkingTreatment], () => {
  // Persist only against the trip explicitly opened in the fare form; never
  // let a reset after commit overwrite the next pending trip's draft.
  const tripId = fareTripId.value
  if (!tripId || !store.shift?.id || restoringDrafts) return
  saveDraft(tripDraftIdentity('work-trip-details', 'ENTER_FARE', tripId), {
    fare: fare.value, tripToll: tripToll.value, tripParking: tripParking.value,
    tripTollTreatment: tripTollTreatment.value, tripParkingTreatment: tripParkingTreatment.value
  })
})
watch([cancelReason, cancelFare], () => {
  if (!cancelOpen.value || !store.trip?.id || !store.shift?.id || restoringDrafts) return
  saveDraft(tripDraftIdentity('work-cancellation', 'CANCEL_TRIP'), {
    cancelReason: cancelReason.value, cancelFare: cancelFare.value
  })
})
watch([fuelOdo, fuelPrice, fuelAmount, fuelFull], () => {
  if (!fuelOpen.value || restoringDrafts) return
  const identity = fuelDraftIdentity()
  if (!identity.parentId && !identity.workflowId) return
  saveDraft(identity, { fuelOdo: fuelOdo.value, fuelPrice: fuelPrice.value, fuelAmount: fuelAmount.value, fuelFull: fuelFull.value })
})
watch([closingOdo, shiftRevenue, toll, parking, tollTreatment, parkingTreatment, endStage, reviewRevenue, reviewKm, reviewOperator], () => {
  if (!endOpen.value || endStage.value === 'ENDED' || !store.shift?.id || restoringDrafts) return
  saveDraft(shiftDraftIdentity('work-end-shift', 'END_SHIFT'), {
    endStage: endStage.value, closingOdo: closingOdo.value, shiftRevenue: shiftRevenue.value,
    toll: toll.value, parking: parking.value, tollTreatment: tollTreatment.value, parkingTreatment: parkingTreatment.value,
    reviewRevenue: reviewRevenue.value, reviewKm: reviewKm.value, reviewOperator: reviewOperator.value
  })
}, { deep: true })

const gap = computed(() => store.calculateGap(startOdo.value))
const gapKm = computed(() => Number(gap.value?.gapKm || 0))
const targetValue = computed(() => target.value?.target == null ? null : Number(target.value.target))
const targetProgress = computed(() => targetValue.value > 0
  ? Math.min(100, Math.round(targetAchieved.value / targetValue.value * 100))
  : 0)

const completed = computed(() => store.completedTrips.filter(t => t.status === 'COMPLETED'))
const tripTollTotal = computed(() => completed.value.filter(t => t.shiftId === store.shift?.id).reduce((sum, trip) => sum + Math.max(0, Number(trip.toll) || 0), 0))
const tripParkingTotal = computed(() => completed.value.filter(t => t.shiftId === store.shift?.id).reduce((sum, trip) => sum + Math.max(0, Number(trip.parking) || 0), 0))
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
  liveKm: `${liveMovementKm.value.toFixed(1)} km`,
  revenue: '₹0',
  asOf: clock.value
}))

const ready = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP || cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP)
const active = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE)
const liveMovementKm = ref(0)
const liveMovementStatus = ref('WAITING FOR GPS')
const liveMovementLabel = computed(() => store.isOnline ? (active.value ? 'BUSINESS KM' : 'DEAD KM') : '')
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
const formatElapsed = elapsedMs => {
  const seconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
const tripTimer = computed(() => {
  const started = cockpit.value.tripStartAt
  return started ? formatElapsed(clock.value - started) : '00:00:00'
})
const stateTimerLabel = computed(() => {
  if (endOpen.value) return 'SHIFT REVIEW TIME'
  if (cancelOpen.value) return 'CANCELLATION TIME'
  if (fuelOpen.value) return 'FUEL ENTRY TIME'
  if (pendingFare.value) return 'FARE ENTRY TIME'
  if (cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE) return 'TRIP TIME'
  if (cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP || cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP) return 'PICKUP TIME'
  return 'READY TIME'
})
const workflowStepKey = computed(() => {
  if (startOpen.value) return 'START_SHIFT'
  if (endOpen.value) return 'SHIFT_REVIEW'
  if (cancelOpen.value) return 'CANCELLATION'
  if (fuelOpen.value) return 'FUEL_ENTRY'
  if (pendingFare.value) return 'FARE_ENTRY'
  return cockpit.value.state
})
const workflowTimerIdentity = computed(() => JSON.stringify({
  shiftId: store.shift?.id || null,
  tripId: pendingFare.value?.id || store.trip?.id || null,
  step: workflowStepKey.value,
  endStage: endOpen.value ? endStage.value : null
}))
const workflowStepStartedAt = ref(Date.now())
watch(workflowTimerIdentity, identity => {
  if (!workflowTimerReady) return
  workflowStepStartedAt.value = WorkflowTimerService.enter(identity, Date.now())
}, { immediate: true })
watch([startOpen, fuelOpen, cancelOpen, endOpen, endStage], () => {
  if (!workflowTimerReady) return
  const session = endOpen.value ? { form: 'end', endStage: endStage.value, shiftId: store.shift?.id || null }
    : cancelOpen.value ? { form: 'cancel', shiftId: store.shift?.id || null, tripId: store.trip?.id || null }
    : fuelOpen.value ? { form: 'fuel', shiftId: store.shift?.id || null }
    : startOpen.value ? { form: 'start', shiftId: store.shift?.id || null }
    : null
  WorkWorkflowSessionService.save(session)
})
const stateTimerStartAt = computed(() => {
  if (endOpen.value || cancelOpen.value || fuelOpen.value || pendingFare.value) return workflowStepStartedAt.value
  if (cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE) return cockpit.value.tripStartAt
  if (cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP || cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP) {
    return Date.parse(store.trip?.createdAt || store.trip?.updatedAt || '') || clock.value
  }
  const lastTrip = completed.value
    .filter(trip => trip.shiftId === store.shift?.id)
    .sort((a, b) => (Date.parse(b.tripEndAt || b.updatedAt || '') || 0) - (Date.parse(a.tripEndAt || a.updatedAt || '') || 0))[0]
  return Date.parse(lastTrip?.tripEndAt || lastTrip?.updatedAt || store.shift?.shiftStartAt || '') || clock.value
})
const stateTimer = computed(() => formatElapsed(clock.value - stateTimerStartAt.value))

async function refreshLiveMovementKm() {
  // Keep shift-level dead KM visible between trips as well as during pickup.
  void MovementReconciliationQueue.reconcilePending()
  const currentTrip = store.trip
  if (!store.isOnline || !store.shift?.id) {
    liveMovementKm.value = 0
    liveMovementStatus.value = 'WAITING FOR GPS'
    return
  }

  const expectedEvent = active.value ? 'PASSENGER_RIDE_TRACE' : 'DEAD_MOVEMENT_TRACE'
  const traceOwnerId = active.value && currentTrip?.id ? currentTrip.id : store.shift.id
  let tracePoints = []

  if (nativeAndroid) {
    try {
      tracePoints = (await NativeGpsService.readTrace(traceOwnerId))
        .filter(point => point?.eventType === expectedEvent)
    } catch (_) {}
  }

  if (tracePoints.length < 2) {
    const session = MovementTraceService.getActiveSession()
    const matchesCurrentMovement = active.value
      ? Boolean(currentTrip?.id) && session?.entityType === 'TRIP' && session.entityId === currentTrip.id && session.profile === 'PASSENGER_RIDE'
      : session?.entityType === 'SHIFT' && session.entityId === store.shift?.id && session.profile === 'DEAD_LEG'
    if (matchesCurrentMovement) {
      tracePoints = MovementTraceService.getPoints()
    }
  }

  const movement = WorkService.calculateLiveMovement(tracePoints)
  if (movement.points.length < 2) {
    // A temporary GPS gap must not make the live readout jump to zero.
    // Keep the last measured value, but make its stale/provisional status explicit.
    liveMovementStatus.value = liveMovementKm.value > 0
      ? 'GPS SIGNAL GAP · LAST ESTIMATE'
      : 'ACQUIRING GPS'
    return
  }

  // GPS is local telemetry: this estimate remains available with Wi-Fi and mobile
  // data disabled. Network routing is an optional enrichment, never a prerequisite.
  liveMovementKm.value = movement.distanceKm
  liveMovementStatus.value = 'LIVE GPS ESTIMATE · PROVISIONAL'

  if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const matched = await MovementReconciliationQueue.matchLiveTrace(
      active.value ? 'TRIP' : 'SHIFT',
      active.value ? currentTrip.id : store.shift?.id,
      movement.points
    )
    if (matched) {
      liveMovementKm.value = matched.distanceKm
      liveMovementStatus.value = 'PROVISIONAL ROAD MATCH'
    }
    // Also discovers completed GPS-fallback trips after a restart and retries
    // persisted route work no more often than the queue's configured cadence.
    void MovementReconciliationQueue.reconcilePending()
  }
}

const preview = computed(() => endOpen.value ? WorkService.reconcileShiftRevenue({
  shiftRevenue: shiftRevenue.value,
  trips: completed.value.map(t => ({
    ...t,
    revenue: reviewRevenue.value[t.id] ?? t.revenue,
    tripKm: reviewKm.value[t.id] ?? t.tripKm,
    operator: reviewOperator.value[t.id] ?? t.operator,
    toll: t.toll,
    parking: t.parking,
    tollTreatment: t.tollTreatment,
    parkingTreatment: t.parkingTreatment
  })),
  toll: toll.value,
  parking: parking.value,
  tollTreatment: tollTreatment.value,
  parkingTreatment: parkingTreatment.value,
  tollParkingCaptureMode: 'ADDITIONAL_ONLY',
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
  restoringDrafts = true
  startOpen.value = true
  startOdo.value = store.lastKnownOdometer == null ? '' : String(store.lastKnownOdometer)
  startAck.value = false
  gapChoice.value = ''
  startWorkflowId.value = (await WorkDraftService.latestWorkflow('work-start-shift', 'START_SHIFT'))?.workflowId || WorkDraftService.newWorkflowId()
  const draft = await restoreDraft(startDraftIdentity())
  if (draft?.values) {
    startOdo.value = String(draft.values.startOdo ?? startOdo.value)
    startAck.value = Boolean(draft.values.startAck)
    gapChoice.value = String(draft.values.gapChoice ?? '')
  }
  restoringDrafts = false
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
    await clearCommittedDraft(startDraftIdentity())
    startWorkflowId.value = WorkDraftService.newWorkflowId()
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
  liveMovementKm.value = 0
  liveMovementStatus.value = 'ACQUIRING GPS'
  busy.value = true
  try {
    const traceSession = MovementTraceService.getActiveSession()
    const alreadyTrackingDeadLeg = traceSession?.entityType === 'SHIFT' &&
      traceSession.entityId === store.shift?.id &&
      traceSession.eventType === 'DEAD_MOVEMENT_TRACE' &&
      traceSession.profile === 'DEAD_LEG'
    if (!alreadyTrackingDeadLeg) {
      try {
        traceRunning = MovementTraceService.start({
          entityType: 'SHIFT',
          entityId: store.shift?.id,
          eventType: 'DEAD_MOVEMENT_TRACE',
          profile: 'DEAD_LEG'
        })
      } catch (_) { traceRunning = false }
    }
    if (nativeAndroid && store.shift?.id) {
      await NativeGpsService.start(store.shift.id, 'DEAD_MOVEMENT_TRACE')
    }

    const result = await store.beginPickup(operator.value || store.defaultOperator, nativeTripId || null)
    if (!result?.ok) {
      if (traceRunning) MovementTraceService.reset()
      traceRunning = false
      fail(result?.reason || 'Could not start pickup.')
      return false
    }
    await KfeRideNotificationService.beginPickup(store.trip?.id || '').catch(() => {})
    await syncOverlay()
    // Keep state transitions silent; the cockpit/action label reflects the new state.
    return true
  } finally {
    busy.value = false
  }
}

async function startTrip() {
  if (busy.value || !ready.value) return false
  liveMovementKm.value = 0
  liveMovementStatus.value = 'ACQUIRING GPS'
  busy.value = true
  try {
    const result = await store.startRide()
    if (!result?.ok) { fail(result?.reason || 'Trip could not be started.'); return false }
    if (traceRunning) {
      MovementTraceService.reset()
      traceRunning = false
    }
    let nativeTraceStarted = false
    if (nativeAndroid && store.trip?.id) {
      nativeTraceStarted = await NativeGpsService.start(store.trip.id, 'PASSENGER_RIDE_TRACE')
    }
    if (!nativeTraceStarted && store.trip?.id) {
      traceRunning = MovementTraceService.start({
        entityType: 'TRIP',
        entityId: store.trip.id,
        eventType: 'PASSENGER_RIDE_TRACE',
        profile: 'PASSENGER_RIDE'
      })
    }
    await KfeRideNotificationService.startRide().catch(() => {})
    await syncOverlay()
    // Keep state transitions silent; the cockpit/action label reflects the new state.
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
    if (nativeAndroid) {
      await NativeGpsService.stop(tripId)
      if (store.shift?.id) await NativeGpsService.start(store.shift.id, 'DEAD_MOVEMENT_TRACE')
    }
    // Return browser tracking to the shift owner whenever it was the active
    // capture path (all web runs and Android when native location is unavailable).
    if (traceRunning) MovementTraceService.reset()
    traceRunning = MovementTraceService.start({
      entityType: 'SHIFT',
      entityId: store.shift?.id,
      eventType: 'DEAD_MOVEMENT_TRACE',
      profile: 'DEAD_LEG'
    })
    fareTripId.value = tripId
    restoringDrafts = true
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    tripTollTreatment.value = 'INCLUDED'
    tripParkingTreatment.value = 'INCLUDED'
    const draft = await restoreDraft(tripDraftIdentity('work-trip-details', 'ENTER_FARE', tripId))
    if (draft?.values) {
      fare.value = String(draft.values.fare ?? '')
      tripToll.value = String(draft.values.tripToll ?? '')
      tripParking.value = String(draft.values.tripParking ?? '')
      tripTollTreatment.value = String(draft.values.tripTollTreatment || 'INCLUDED')
      tripParkingTreatment.value = String(draft.values.tripParkingTreatment || 'INCLUDED')
    }
    restoringDrafts = false
    await KfeRideNotificationService.completeRide().catch(() => {})
    await syncOverlay()
    // Keep state transitions silent; the cockpit/action label reflects the new state.
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
      parking: tripParking.value === '' ? 0 : Number(tripParking.value),
      tollTreatment: tripTollTreatment.value,
      parkingTreatment: tripParkingTreatment.value
    }
    const fareDraft = tripDraftIdentity('work-trip-details', 'ENTER_FARE', pendingFare.value.id)
    const result = await store.updateTrip(details)
    if (!result?.ok) { fail(result?.reason || 'Trip details could not be saved.'); return false }

    await clearCommittedDraft(fareDraft)
    fareTripId.value = null
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    tripTollTreatment.value = 'INCLUDED'
    tripParkingTreatment.value = 'INCLUDED'
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
    const fareDraft = tripDraftIdentity('work-trip-details', 'ENTER_FARE', pendingFare.value.id)
    const result = await store.updateTrip({ id: pendingFare.value.id, fareDetailsSkipped: true })
    if (!result?.ok) return fail(result?.reason || 'Trip detail skip could not be saved.')
    await clearCommittedDraft(fareDraft)
    fareTripId.value = null
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    tripTollTreatment.value = 'INCLUDED'
    tripParkingTreatment.value = 'INCLUDED'
    await AndroidOverlay.fareSaved().catch(() => {})
    await KfeRideNotificationService.clearPendingAction().catch(() => {})
    await syncOverlay()
    notify('Trip details skipped.')
  } finally {
    fareBusy.value = false
  }
}

async function openCancel() {
  restoringDrafts = true
  cancelOpen.value = true
  cancelReason.value = ''
  cancelFare.value = ''
  const draft = store.trip?.id && store.shift?.id
    ? await restoreDraft(tripDraftIdentity('work-cancellation', 'CANCEL_TRIP'))
    : null
  if (draft?.values) {
    cancelReason.value = String(draft.values.cancelReason ?? '')
    cancelFare.value = String(draft.values.cancelFare ?? '')
  }
  restoringDrafts = false
  error.value = ''
  message.value = ''
}

async function saveCancel(fromNative = false) {
  if (cancelBusy.value) return false
  if (!cancelReason.value.trim()) { fail('Cancellation reason is required.'); return false }
  if (!Number.isFinite(Number(cancelFare.value)) || Number(cancelFare.value) < 0) { fail('Cancellation fee must be a non-negative number.'); return false }

  cancelBusy.value = true
  try {
    const cancellationDraft = tripDraftIdentity('work-cancellation', 'CANCEL_TRIP')
    const result = await store.cancelTrip({
      reason: cancelReason.value.trim(),
      revenue: cancelFare.value
    })
    if (!result?.ok) { fail(result?.reason || 'Cancellation could not be saved.'); return false }
    await clearCommittedDraft(cancellationDraft)
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
  fuelSaveConfirmation.value = false
  endOpen.value = false
  restoringDrafts = true
  fuelOdo.value = ''
  fuelPrice.value = ''
  fuelAmount.value = ''
  fuelFull.value = true
  if (!store.shift?.id) fuelWorkflowId.value = (await WorkDraftService.latestWorkflow('work-fuel', 'RECORD_FUEL'))?.workflowId || WorkDraftService.newWorkflowId()
  const draft = await restoreDraft(fuelDraftIdentity())
  if (draft?.values) {
    fuelOdo.value = String(draft.values.fuelOdo ?? '')
    fuelPrice.value = String(draft.values.fuelPrice ?? '')
    fuelAmount.value = String(draft.values.fuelAmount ?? '')
    fuelFull.value = draft.values.fuelFull !== false
  }
  restoringDrafts = false
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
  if (action === 'back-end') { backEndStage(); return }
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
    // The repository has committed the fuel record. Close/confirm immediately;
    // draft cleanup and derived-metric refresh are non-critical follow-up work.
    fuelOpen.value = false
    notify('Fuel saved.')
    void clearCommittedDraft(fuelDraftIdentity(), { quiet: true }).catch(() => {})
    void fuel.refresh().catch(() => {})
  } catch (e) {
    fail(e?.message || 'Fuel save failed. Please retry.')
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

async function openEnd() {
  if (store.isTripActive) return fail('End the active Trip before going Offline.')
  
  fuelOpen.value = false
  endOpen.value = true
  endStage.value = 'CLOSE'
  closingOdo.value = ''
  shiftRevenue.value = ''
  toll.value = ''
  parking.value = ''
  tollTreatment.value = 'INCLUDED'
  parkingTreatment.value = 'INCLUDED'
  seedReview()
  restoringDrafts = true
  const draft = await restoreDraft(shiftDraftIdentity('work-end-shift', 'END_SHIFT'))
  if (draft?.values) {
    endStage.value = String(draft.values.endStage || 'CLOSE')
    closingOdo.value = String(draft.values.closingOdo ?? '')
    shiftRevenue.value = String(draft.values.shiftRevenue ?? '')
    toll.value = String(draft.values.toll ?? '')
    parking.value = String(draft.values.parking ?? '')
    tollTreatment.value = String(draft.values.tollTreatment || 'INCLUDED')
    parkingTreatment.value = String(draft.values.parkingTreatment || 'INCLUDED')
    reviewRevenue.value = draft.values.reviewRevenue || reviewRevenue.value
    reviewKm.value = draft.values.reviewKm || reviewKm.value
    reviewOperator.value = draft.values.reviewOperator || reviewOperator.value
  }
  restoringDrafts = false
  error.value = ''
  message.value = ''
}

function cancelEnd() {
  endOpen.value = false
  notify('Still Online — End Shift cancelled.')
}

function backEndStage() {
  if (endStage.value === 'CONFIRM') { endStage.value = 'REVIEW'; return }
  if (endStage.value === 'REVIEW') { endStage.value = 'RECONCILE'; return }
  if (endStage.value === 'RECONCILE') { endStage.value = 'CLOSE'; return }
  cancelEnd()
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
    const endDraft = shiftDraftIdentity('work-end-shift', 'END_SHIFT')
    const trips = completed.value.map(t => ({
      id: t.id,
      operator: reviewOperator.value[t.id] ?? t.operator,
      tripKm: reviewKm.value[t.id] === '' || reviewKm.value[t.id] == null ? (t.tripKm ?? '') : reviewKm.value[t.id],
      revenue: reviewRevenue.value[t.id] ?? t.revenue ?? ''
    }))
    const endingShiftId = store.shift?.id
    // Freeze and import the native shift trace before reconciliation reads
    // canonical SHIFT snapshots. Never end the shift with dead-movement points
    // stranded only in the app-private JSONL file.
    if (nativeAndroid && endingShiftId) {
      await NativeGpsService.stop(endingShiftId)
      try {
        await NativeGpsService.syncTrace(endingShiftId, { entityType: 'SHIFT' })
      } catch (traceError) {
        await NativeGpsService.start(endingShiftId, 'DEAD_MOVEMENT_TRACE')
        throw new Error('Shift GPS trace could not be saved locally. Tracking was restarted; retry ending the shift.')
      }
    }
    const result = await store.endShift({
      closingOdometer: closingOdo.value,
      revenue: shiftRevenue.value,
      toll: toll.value,
      parking: parking.value,
      tollTreatment: tollTreatment.value,
      parkingTreatment: parkingTreatment.value,
      tollParkingCaptureMode: 'ADDITIONAL_ONLY',
      tollParkingRevenueTreatment: tollTreatment.value,
      trips
    })
    if (!result?.ok) {
      if (nativeAndroid && endingShiftId) await NativeGpsService.start(endingShiftId, 'DEAD_MOVEMENT_TRACE')
      return fail(result.reason)
    }
    if (nativeAndroid && endingShiftId) await NativeGpsService.stop(endingShiftId)
    if (traceRunning) {
      MovementTraceService.reset()
      traceRunning = false
    }
    await clearCommittedDraft(endDraft)
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
      tripTollTreatment.value = String(payload.tollTreatment || 'INCLUDED')
      tripParkingTreatment.value = String(payload.parkingTreatment || 'INCLUDED')
    } catch (_) {
      fare.value = String(event.input)
      tripToll.value = ''
      tripParking.value = ''
      tripTollTreatment.value = 'INCLUDED'
      tripParkingTreatment.value = 'INCLUDED'
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
  await fuel.refresh().catch(() => {})
  // Restore only the exact persisted movement owner that still matches the
  // canonical active shift/trip. A stale trace must never be attached to a new one.
  const savedTrace = MovementTraceService.getActiveSession()
  if (store.isOnline && savedTrace) {
    const shiftDeadLeg = savedTrace.entityType === 'SHIFT' &&
      savedTrace.entityId === store.shift?.id &&
      savedTrace.eventType === 'DEAD_MOVEMENT_TRACE' &&
      savedTrace.profile === 'DEAD_LEG' && !active.value
    const passengerRide = savedTrace.entityType === 'TRIP' &&
      savedTrace.entityId === store.trip?.id &&
      savedTrace.eventType === 'PASSENGER_RIDE_TRACE' &&
      savedTrace.profile === 'PASSENGER_RIDE' && active.value
    if (shiftDeadLeg || passengerRide) {
      traceRunning = await MovementTraceService.resumePersisted(savedTrace)
    }
  }
  // Reassert the canonical native GPS owner on WebView/process recovery.
  // The foreground service itself remains responsible for screen-off tracking.
  if (store.isOnline && nativeAndroid && store.shift?.id) {
    const nativeOwnerId = active.value && store.trip?.id ? store.trip.id : store.shift.id
    const nativeEventType = active.value ? 'PASSENGER_RIDE_TRACE' : 'DEAD_MOVEMENT_TRACE'
    await NativeGpsService.start(nativeOwnerId, nativeEventType)
  }
  startWorkflowId.value = (await WorkDraftService.latestWorkflow('work-start-shift', 'START_SHIFT'))?.workflowId || WorkDraftService.newWorkflowId()
  fuelWorkflowId.value = (await WorkDraftService.latestWorkflow('work-fuel', 'RECORD_FUEL'))?.workflowId || WorkDraftService.newWorkflowId()
  await targetRefresh()
  operator.value = store.defaultOperator
  if (pendingFare.value?.id && store.shift?.id) {
    fareTripId.value = pendingFare.value.id
    restoringDrafts = true
    const draft = await restoreDraft(tripDraftIdentity('work-trip-details', 'ENTER_FARE', pendingFare.value.id))
    if (draft?.values) {
      fare.value = String(draft.values.fare ?? '')
      tripToll.value = String(draft.values.tripToll ?? '')
      tripParking.value = String(draft.values.tripParking ?? '')
      tripTollTreatment.value = String(draft.values.tripTollTreatment || 'INCLUDED')
      tripParkingTreatment.value = String(draft.values.tripParkingTreatment || 'INCLUDED')
    }
    restoringDrafts = false
  }

  // Restore an interrupted context form from its durable UI session marker.
  // Canonical trip/shift records remain authoritative; invalid/stale forms are ignored.
  const savedForm = WorkWorkflowSessionService.read()
  const savedShiftMatches = savedForm?.shiftId === (store.shift?.id || null)
  const savedTripMatches = savedForm?.tripId === (store.trip?.id || null)
  if (savedForm?.form === 'start' && savedShiftMatches && !store.isOnline) {
    await openStart()
  } else if (savedForm?.form === 'fuel' && savedShiftMatches) {
    await toggleFuel()
  } else if (savedForm?.form === 'cancel' && savedShiftMatches && savedTripMatches && store.isOnline &&
    store.trip?.id && ['PICKUP', 'GOING_TO_PICKUP'].includes(store.trip?.tripStage)) {
    cancelOpen.value = true
    restoringDrafts = true
    const draft = await restoreDraft(tripDraftIdentity('work-cancellation', 'CANCEL_TRIP'))
    if (draft?.values) {
      cancelReason.value = String(draft.values.cancelReason ?? '')
      cancelFare.value = String(draft.values.cancelFare ?? '')
    }
    restoringDrafts = false
  } else if (savedForm?.form === 'end' && savedShiftMatches && store.isOnline && !store.isTripActive) {
    await openEnd()
    if (savedForm.endStage && ['CLOSE', 'RECONCILE', 'REVIEW', 'CONFIRM'].includes(savedForm.endStage)) {
      endStage.value = savedForm.endStage
    }
  } else if (savedForm) {
    WorkWorkflowSessionService.save(null)
  }
  workflowTimerReady = true
  workflowStepStartedAt.value = WorkflowTimerService.enter(workflowTimerIdentity.value, Date.now())

  clock.value = Date.now()
  timer = setInterval(() => { clock.value = Date.now() }, 1000)
  void refreshLiveMovementKm()
  liveKmRefreshTimer = setInterval(() => { void refreshLiveMovementKm() }, 3000)

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
  if (liveKmRefreshTimer) clearInterval(liveKmRefreshTimer)
  if (traceRunning) MovementTraceService.pause()
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
    <section v-if="!fuelOpen && !pendingFare && (store.isOnline || cancelOpen || endOpen)" class="operational-state state-tone-info work-persistent-metrics" aria-label="Live distance and workflow timer">
      <div class="work-live-metrics">
        <div class="live-km-readout" aria-live="polite"><span>{{ liveMovementLabel || 'LIVE KM' }}</span><strong>{{ liveMovementKm.toFixed(1) }} km</strong><small>{{ liveMovementStatus }}</small></div>
        <div class="trip-timer-block"><span class="timer-label">{{ stateTimerLabel }}</span><strong class="trip-timer" aria-live="polite">{{ active ? tripTimer : stateTimer }}</strong></div>
      </div>
    </section>
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
      :parking-treatment="parkingTreatment"
      :toll="toll"
      :parking="parking"
      :trip-toll-total="tripTollTotal"
      :trip-parking-total="tripParkingTotal"
      @update:closing-odo="closingOdo=$event"
      @update:shift-revenue="shiftRevenue=$event"
      @update:review-revenue="reviewRevenue=$event"
      @update:review-km="reviewKm=$event"
      @update:review-operator="reviewOperator=$event"
      @update:toll-treatment="tollTreatment=$event"
      @update:parking-treatment="parkingTreatment=$event"
      @update:toll="toll=$event"
      @update:parking="parking=$event"
      @action="handleContextAction"
    />

    <section v-if="!store.isOnline && !fuelOpen" class="offline-state state-tone-neutral" :class="{ 'contextual-context': startOpen }">
      <div class="state-mark" aria-hidden="true">○</div><span class="eyebrow">CURRENT STATE</span><strong>OFFLINE</strong><p>Shift is not active.</p><button v-if="!startOpen && !fuelOpen" class="primary-action" @click="openStart">START SHIFT</button>
    </section>

    <template v-if="store.isOnline">
      <section class="instrument target-instrument">
        <div><span class="eyebrow">TODAY'S TARGET</span><strong>{{ targetValue==null ? '—' : money(targetValue) }}</strong></div>
        <div class="target-meta"><span>PROGRESS</span><strong>{{ targetProgress }}%</strong><span>SHIFT {{ shiftTimer }}</span></div>
        <div class="progress-track"><i :style="{width:targetProgress+'%'}"/></div>
      </section>



      <section v-if="!fuelOpen && !endOpen && !cancelOpen" class="action-instrument work-fixed-action">
        <div ref="track" class="swipe trip-swipe" :class="{threshold:swipeProgress>=70,committing:busy,'semantic-go':cockpit.action==='GO_TO_PICKUP','semantic-start':cockpit.action==='START_RIDE','semantic-end':cockpit.action==='END_RIDE'}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="swipe-copy"><strong>{{ actionLabel }}</strong></div>
          <button class="swipe-handle" type="button" :aria-label="actionLabel" :style="{ transform: `translateX(${swipe.offset}px)`, transition: swipe.down ? 'none' : 'transform 180ms ease-out' }" @keydown.enter.prevent="keyAction" @keydown.space.prevent="keyAction">→</button>
        </div>
      </section>
    </template>



    <button
      v-if="store.isOnline && (store.trip?.tripStage === 'GOING_TO_PICKUP' || store.trip?.tripStage === 'PICKUP') && !endOpen && !fuelOpen && !cancelOpen"
      class="secondary-action cancel-trip-tab"
      type="button"
      @click="openCancel"
    >CANCEL TRIP</button>

    <WorkContextForm
      v-if="pendingFare && !endOpen && !cancelOpen && !fuelOpen"
      type="fare"
      :fare-busy="fareBusy"
      :fare="fare"
      :trip-toll="tripToll"
      :trip-parking="tripParking"
      :trip-toll-treatment="tripTollTreatment"
      :trip-parking-treatment="tripParkingTreatment"
      @update:fare="fare=$event"
      @update:trip-toll="tripToll=$event"
      @update:trip-parking="tripParking=$event"
      @update:trip-toll-treatment="tripTollTreatment=$event"
      @update:trip-parking-treatment="tripParkingTreatment=$event"
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
    <p v-if="fuelSaveConfirmation" class="feedback success fuel-save-confirmation" role="status">Fuel saved.</p>
    <p v-else-if="message" class="feedback success" role="status">{{ message }}</p>
  </main>
</div>
</template>
