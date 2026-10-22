<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { WorkDraftService } from '../application/work/workDraftService.js'
import { WorkflowTimerService, WorkWorkflowSessionService } from '../application/work/workflowTimerService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { WorkRuntimePorts } from '../application/work/workRuntimePorts.js'
import { CanonicalWorkBoundary } from '../application/work/canonicalWorkBoundary.js'
import { deriveLiveRevenue } from '../application/work/liveRevenueReadModel.js'
import { SWIPE_CONFIG } from '../application/work/swipeConfiguration.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'
import WorkContextForm from '../components/work/WorkContextForm.vue'
import WorkLiveMetrics from '../components/work/WorkLiveMetrics.vue'

const store = useShiftTripStore()
const fuel = useFuelStore()
const nativeAndroid = WorkRuntimePorts.platform.getPlatform() === 'android'
const startWorkflowId = ref('')
const fuelWorkflowId = ref('')
let restoringDrafts = false
let workflowTimerReady = false
let nativeReplayTimer = null
let nativeReplayRunning = false

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
const endBusy = ref(false)
const largeDistanceConfirmation = ref('')

const target = ref(null)
const targetAchieved = ref(0)
const clock = ref(Date.now())
const track = ref(null)
const swipe = ref({ down: false, start: 0, offset: 0 })
const swipePointerId = ref(null)

let timer = null
const refreshClock = () => { clock.value = Date.now() }
let nativeActionListener = null


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
watch([closingOdo, endStage, largeDistanceConfirmation], () => {
  if (!endOpen.value || endStage.value === 'ENDED' || !store.shift?.id || restoringDrafts) return
  saveDraft(shiftDraftIdentity('work-end-shift', 'END_SHIFT'), {
    endStage: endStage.value, closingOdo: closingOdo.value,
    largeDistanceConfirmation: largeDistanceConfirmation.value
  })
})

const gap = computed(() => store.calculateGap(startOdo.value))
const gapKm = computed(() => Number(gap.value?.gapKm || 0))
const targetValue = computed(() => target.value?.target == null ? null : Number(target.value.target))
const targetProgress = computed(() => targetValue.value > 0
  ? Math.min(100, Math.round(targetAchieved.value / targetValue.value * 100))
  : 0)

const completed = computed(() => store.completedTrips.filter(t => t.status === 'COMPLETED'))
const liveRevenue = computed(() => deriveLiveRevenue(store.registeredTrips.filter(trip => trip.shiftId === store.shift?.id)))
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
  revenue: money(liveRevenue.value),
  asOf: clock.value
}))

const ready = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP || cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP)
const active = computed(() => cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE)
const swipeStyle = computed(() => {
  const color = cockpit.value.action === 'END_RIDE' ? SWIPE_CONFIG.endColor : cockpit.value.action === 'START_RIDE' ? SWIPE_CONFIG.startColor : SWIPE_CONFIG.pickupColor
  return { '--swipe-action-color': color }
})
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
  if (endOpen.value) return 'ENDING TIME'
  if (cancelOpen.value) return 'CANCELLATION TIME'
  if (fuelOpen.value) return 'FUEL ENTRY TIME'
  if (pendingFare.value) return 'FARE ENTRY TIME'
  if (cockpit.value.state === WORK_COCKPIT_STATES.TRIP_ACTIVE) return 'TRIP TIME'
  if (cockpit.value.state === WORK_COCKPIT_STATES.GOING_TO_PICKUP || cockpit.value.state === WORK_COCKPIT_STATES.READY_FOR_TRIP) return 'PICKUP TIME'
  return 'READY TIME'
})
const workflowStepKey = computed(() => {
  if (startOpen.value) return 'START_SHIFT'
  if (endOpen.value) return 'END_SHIFT'
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


const endReady = computed(() => closingOdo.value.trim() !== '')
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
    await WorkRuntimePorts.androidOverlay.hide().catch(() => {})
    return
  }

  // Revenue is derived from saved trip fares, not manual shift-end entry.
  let trips = []
  try {
    trips = await WorkService.getTripsForShift(store.shift.id)
  } catch (_) {}

  const revenue = money(deriveLiveRevenue(trips))
  const recoveredPendingFareId = pendingFare.value?.id || [...trips]
    .filter(t => t.status === 'COMPLETED' && t.revenue == null && t.fareDetailsSkipped !== true)
    .sort((a, b) => Date.parse(b.tripEndAt || b.updatedAt || '') - Date.parse(a.tripEndAt || a.updatedAt || ''))[0]?.id || ''

  const state = deriveWorkCockpitState({
    shift: store.shift,
    trip: store.trip,
    trips,
    pendingFareId: recoveredPendingFareId,
    target: targetValue.value == null ? '—' : money(targetValue.value),
    targetProgress: targetProgress.value,
    revenue
  })

  await WorkRuntimePorts.androidOverlay.update({
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
    revenue: state.revenue,
    tripStartAt: state.tripStartAt,
    phaseStartAt: stateTimerStartAt.value,
    phaseLabel: stateTimerLabel.value,
    defaultOperator: store.defaultOperator,
    swipeConfig: SWIPE_CONFIG,
    overlayAction: state.pendingFareId && (!store.trip?.id || store.trip.status !== 'ACTIVE') ? 'ENTER_FARE' : state.action,
    overlayTripId: state.pendingFareId && (!store.trip?.id || store.trip.status !== 'ACTIVE') ? state.pendingFareId : state.tripId,
    pendingFareId: state.pendingFareId,
    cancelOpen: cancelOpen.value,
    cancelDraft: { cancelReason: cancelReason.value, cancelFare: cancelFare.value },
    fareDraft: { fare: fare.value, tripToll: tripToll.value, tripParking: tripParking.value, tripTollTreatment: tripTollTreatment.value, tripParkingTreatment: tripParkingTreatment.value }
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
    await WorkRuntimePorts.androidOverlay.prepare().catch(() => {})
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
    const result = await store.beginPickup(operator.value || store.defaultOperator, nativeTripId || null)
    if (!result?.ok) {
      fail(result?.reason || 'Could not start pickup.')
      return false
    }
    await syncOverlay()
    // Keep state transitions silent; the cockpit/action label reflects the new state.
    return true
  } finally {
    busy.value = false
  }
}

async function startTrip() {
  if (busy.value || !ready.value) return false
  busy.value = true
  try {
    const result = await store.startRide()
    if (!result?.ok) { fail(result?.reason || 'Trip could not be started.'); return false }
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

async function saveFare(fromNative = false, operationId = '') {
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

    // Android's native canonical record is authoritative for the overlay.
    // Mirror the exact saved trip snapshot under the durable event ID so replay
    // after an interrupted acknowledgement cannot count fare/toll/parking twice.
    if (nativeAndroid) {
      const savedTrip = { ...(pendingFare.value || {}), ...details, status: 'COMPLETED', updatedAt: new Date().toISOString() }
      await CanonicalWorkBoundary.putRecord({
        operationId: operationId || CanonicalWorkBoundary.createOperationId(),
        entityType: 'TRIP',
        record: savedTrip
      })
    }

    await clearCommittedDraft(fareDraft)
    fareTripId.value = null
    fare.value = ''
    tripToll.value = ''
    tripParking.value = ''
    tripTollTreatment.value = 'INCLUDED'
    tripParkingTreatment.value = 'INCLUDED'
    if (!fromNative) await WorkRuntimePorts.androidOverlay.fareSaved().catch(() => {})
    if (!fromNative) await WorkRuntimePorts.nativeWorkActions.clearPendingAction().catch(() => {})
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
    await WorkRuntimePorts.androidOverlay.fareSaved().catch(() => {})
    await WorkRuntimePorts.nativeWorkActions.clearPendingAction().catch(() => {})
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

async function saveCancel(fromNative = false, operationId = '') {
  if (cancelBusy.value) return false
  if (!cancelReason.value.trim()) { fail('Cancellation reason is required.'); return false }
  if (!Number.isFinite(Number(cancelFare.value)) || Number(cancelFare.value) < 0) { fail('Cancellation fee must be a non-negative number.'); return false }

  cancelBusy.value = true
  try {
    const cancellationDraft = tripDraftIdentity('work-cancellation', 'CANCEL_TRIP')
    const cancelledTripSnapshot = store.trip ? { ...store.trip } : null
    const cancelledTripId = store.trip?.id
    const cancellationReason = cancelReason.value.trim()
    const cancellationRevenue = Number(cancelFare.value)
    const result = await store.cancelTrip({
      reason: cancellationReason,
      revenue: cancelFare.value
    })
    if (!result?.ok) { fail(result?.reason || 'Cancellation could not be saved.'); return false }

    if (nativeAndroid && cancelledTripSnapshot) {
      await CanonicalWorkBoundary.putRecord({
        operationId: operationId || CanonicalWorkBoundary.createOperationId(),
        entityType: 'TRIP',
        record: {
          ...cancelledTripSnapshot,
          status: 'CANCELLED',
          cancelReason: cancellationReason,
          cancelledRevenue: cancellationRevenue,
          tripEndAt: cancelledTripSnapshot.tripEndAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      })
    }

    await clearCommittedDraft(cancellationDraft)
    cancelOpen.value = false
    if (!fromNative) await WorkRuntimePorts.androidOverlay.cancelSaved().catch(() => {})
    if (!fromNative) await WorkRuntimePorts.nativeWorkActions.clearPendingAction().catch(() => {})
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
    // The repository commits the vehicle-linked fuel record before returning.
    // Refresh derived full-tank intervals from that committed canonical record.
    let metricsRefreshed = true
    try { await fuel.refresh() } catch (_) { metricsRefreshed = false }
    fuelOpen.value = false
    notify(metricsRefreshed ? 'Fuel saved.' : 'Fuel saved. Metrics refresh failed; reopen Fuel to retry.')
    void clearCommittedDraft(fuelDraftIdentity(), { quiet: true }).catch(() => {})
  } catch (e) {
    fail(e?.message || 'Fuel save failed. Please retry.')
  } finally {
    fuelBusy.value = false
  }
}

async function openEnd() {
  if (store.isTripActive) return fail('End the active Trip before going Offline.')
  
  fuelOpen.value = false
  endOpen.value = true
  endStage.value = 'CLOSE'
  closingOdo.value = ''
  largeDistanceConfirmation.value = ''
  restoringDrafts = true
  const draft = await restoreDraft(shiftDraftIdentity('work-end-shift', 'END_SHIFT'))
  if (draft?.values) {
    endStage.value = String(draft.values.endStage || 'CLOSE')
    closingOdo.value = String(draft.values.closingOdo ?? '')
    largeDistanceConfirmation.value = String(draft.values.largeDistanceConfirmation || '')
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
  cancelEnd()
}

function closeShift() {
  if (!closingOdo.value.trim()) return fail('Closing odometer is required.')
  const closing = Number(closingOdo.value)
  const starting = Number(store.startOdometer)
  if (!Number.isFinite(closing) || closing < starting) return fail(`Closing odometer must be at least ${starting} km.`)
  if (largeDistanceKm.value > 500 && largeDistanceConfirmation.value !== largeDistanceIdentity.value) {
    return fail('Confirm the closing odometer and total distance before ending the shift.')
  }
  void finishEnd()
}

const largeDistanceKm = computed(() => {
  const start = Number(store.shift?.startOdometer)
  const end = Number(closingOdo.value)
  return closingOdo.value !== '' && Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0
})
const largeDistanceIdentity = computed(() => `${store.shift?.id || ''}:${closingOdo.value}:${largeDistanceKm.value}`)

async function finishEnd() {
  if (endBusy.value || !endReady.value) return
  endBusy.value = true
  try {
    const endDraft = shiftDraftIdentity('work-end-shift', 'END_SHIFT')
    const endingShiftId = store.shift?.id
    const result = await store.endShift({
      closingOdometer: closingOdo.value,
      confirmLargeDistance: largeDistanceKm.value > 500 && largeDistanceConfirmation.value === largeDistanceIdentity.value
    })
    if (!result?.ok) {
      return fail(result.reason)
    }
    await clearCommittedDraft(endDraft)
    endStage.value = 'ENDED'
    notify('Shift ended.')
  } catch (e) {
    fail(e?.message || 'Shift could not be ended. Please retry.')
  } finally {
    endBusy.value = false
  }
}

function finishEnded() {
  endOpen.value = false
  closingOdo.value = ''
  largeDistanceConfirmation.value = ''
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
  const commit = swipeProgress.value >= SWIPE_CONFIG.commitThresholdPercent
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

// Native overlay trip commands may already be committed to canonical SQLite
// while the PWA was closed. On replay, converge the PWA read model and acknowledge
// the same event instead of running a second business transition with a new ID.
// Return null on read failure so the event remains pending rather than risking a
// duplicate write; return false only when the native canonical commit is absent.
const hasCommittedNativeTripForm = async (mode, eventId, tripId) => {
  if (!eventId || !tripId) return false
  // Native overlay form commits use the atomic SUBMIT_TRIP_FORM command. The
  // PWA's durable event replay uses eventId for its PUT_RECORD fallback.
  // Check the operation ledger rather than inferring a fare commit from the
  // trip's COMPLETED status or its default fareDetailsSkipped=false field.
  for (const operationId of [`native-form-${mode}-${eventId}`, eventId]) {
    const operation = await CanonicalWorkBoundary.getOperation(operationId)
    if (isAcceptedNativeTripFormOperation(operation, mode, tripId)) return true
  }
  return false
}

const syncAlreadyCommittedNativeTripAction = async (stage, tripId, eventId = '') => {
  if (!nativeAndroid || !tripId) return false
  const supportedStages = ['GO_TO_PICKUP', 'START_RIDE', 'END_RIDE', 'ENTER_FARE', 'CANCEL_RIDE']
  if (!supportedStages.includes(stage)) return false
  try {
    if (stage === 'ENTER_FARE' || stage === 'CANCEL_RIDE') {
      const mode = stage === 'ENTER_FARE' ? 'FARE' : 'CANCEL'
      if (await hasCommittedNativeTripForm(mode, eventId, tripId)) {
        await store.refresh()
        return true
      }
    }
    const trips = await WorkService.getAllTrips()
    const trip = trips.find(item => item?.id === tripId)
    if (!trip) return false
    let committed = false
    // The queue may contain several unacknowledged lifecycle stages for one
    // trip. A later canonical stage proves the earlier command committed too;
    // form commands require their own durable operation record.
    if (stage === 'GO_TO_PICKUP') {
      committed = ['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(trip.status)
    } else if (stage === 'START_RIDE') {
      committed = (trip.status === 'ACTIVE' && trip.tripStage === 'RIDE_STARTED') ||
        trip.status === 'COMPLETED' || trip.status === 'CANCELLED'
    } else if (stage === 'END_RIDE') {
      committed = trip.status === 'COMPLETED' && trip.tripStage === 'COMPLETED'
    }
    if (!committed) return false
    await store.refresh()
    return true
  } catch (error) {
    console.warn('Native canonical action read failed; leaving original event pending:', stage, tripId, error)
    return null
  }
}

const handleNativeAction = async event => {
  const stage = String(event?.stage || '')
  const eventTripId = String(event?.tripId || '')
  if (stage === 'CLOSE_CANCEL_FORM') {
    if (!store.trip?.id || store.trip.id !== eventTripId) return false
    cancelOpen.value = false
    error.value = ''
    message.value = ''
    return true
  }
  if (stage === 'OPEN_CANCEL_FORM') {
    if (!store.trip?.id || store.trip.id !== eventTripId ||
        !['PICKUP', 'GOING_TO_PICKUP'].includes(store.trip.tripStage)) return false
    await openCancel()
    return true
  }
  const nativeCommit = await syncAlreadyCommittedNativeTripAction(stage, eventTripId, String(event?.eventId || ''))
  if (nativeCommit === true) return true
  if (nativeCommit === null) return false
  if (stage === 'GO_TO_PICKUP') {
    // An acknowledgement may be lost after the canonical write. Treat a replay
    // for the already-created trip as success instead of attempting a second trip.
    if (store.trip?.id === eventTripId && store.trip.status === 'ACTIVE' &&
        ['PICKUP', 'GOING_TO_PICKUP'].includes(store.trip.tripStage)) return true
    return Boolean(await goPickup(eventTripId))
  }
  if (stage === 'START_RIDE') {
    if (store.trip?.id === eventTripId && store.trip.status === 'ACTIVE' &&
        store.trip.tripStage === 'RIDE_STARTED') return true
    if (!eventTripId || store.trip?.id !== eventTripId) return false
    return Boolean(await startTrip())
  }
  if (stage === 'END_RIDE') {
    if (!store.trip?.id && completed.value.some(trip => trip.id === eventTripId && trip.status === 'COMPLETED')) {
      // END TRIP committed already; only replay the acknowledgement, not the write.
      fareTripId.value = eventTripId
      return true
    }
    if (store.trip?.id !== eventTripId) return false
    return Boolean(await endTrip())
  }

  if (stage === 'CANCEL_RIDE') {
    try {
      const payload = event?.input ? JSON.parse(String(event.input)) : {}
      cancelReason.value = payload.reason === 'PASSENGER' ? 'PASSENGER' : 'DRIVER'
      cancelFare.value = payload.revenue === '' || payload.revenue == null ? '' : String(payload.revenue)
      return Boolean(await saveCancel(true, String(event?.eventId || '')))
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
    return Boolean(await saveFare(true, String(event?.eventId || '')))
  }
  return false
}

// Serialize listener delivery and foreground replay through one FIFO queue.
// Several overlay swipes can be queued while Android has suspended this WebView;
// replay must apply GO_TO_PICKUP before START_RIDE and END_RIDE, never in parallel.
let nativeEventQueue = Promise.resolve()
function enqueueNativeEvent(event) {
  const next = nativeEventQueue.then(() => processNativeEvent(event))
  nativeEventQueue = next.catch(() => {})
  return next
}

// Prevent duplicate delivery of one durable event while it is being processed.
// The event ID remains the idempotency key.
const nativeEventsInFlight = new Set()

async function processNativeEvent(event) {
  const eventId = String(event?.eventId || '')
  if (eventId && nativeEventsInFlight.has(eventId)) return false
  if (eventId) nativeEventsInFlight.add(eventId)
  try {
    const saved = await handleNativeAction(event)
    if (saved && eventId) {
      const acknowledged = await WorkRuntimePorts.nativeWorkActions.acknowledgeAction(
        eventId, String(event?.stage || ''), String(event?.tripId || '')
      )
      // A successful Work write is not a completed native transition until its
      // durable event is acknowledged. Keep the original event retryable if the
      // acknowledgement bridge fails; the handlers above are idempotent by ID.
      if (!acknowledged) {
        await WorkRuntimePorts.nativeWorkActions.recordActionFailure(
          eventId, 'Work saved the action but native acknowledgement failed'
        )
        return false
      }
    } else if (!saved && eventId) {
      await WorkRuntimePorts.nativeWorkActions.recordActionFailure(eventId, 'Work did not confirm the action was saved')
    }
    return saved
  } catch (error) {
    if (eventId) await WorkRuntimePorts.nativeWorkActions.recordActionFailure(eventId, error?.message || error)
    return false
  } finally {
    if (eventId) nativeEventsInFlight.delete(eventId)
  }
}

// A failed durable event remains pending under its original ID. Retry it when
// Android brings the already-mounted Work view back to the foreground; never
// synthesize a replacement action or append another event.
async function replayFailedNativeActions() {
  if (document.visibilityState !== 'visible' || nativeReplayRunning) return
  nativeReplayRunning = true
  try {
    const pendingEvents = await WorkRuntimePorts.nativeWorkActions.consumePendingActions()
    // Replay every still-pending event, not only events with a recorded write
    // failure. An interruption can happen after the Work commit but before the
    // failure counter is persisted; handlers must safely accept replays.
    for (const event of pendingEvents) await enqueueNativeEvent(event)
  } finally {
    nativeReplayRunning = false
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', syncOverlay)
  document.addEventListener('visibilitychange', replayFailedNativeActions)
  window.addEventListener('pageshow', replayFailedNativeActions)
  window.addEventListener('focus', replayFailedNativeActions)
  // A transient bridge/WebView failure must not leave the native swipe locked
  // indefinitely while Work remains visible. Reuse the same durable event IDs;
  // processNativeEvent serializes per-ID work and acknowledges only confirmed saves.
  nativeReplayTimer = setInterval(() => { void replayFailedNativeActions() }, 5000)
  await store.initialize()
  await fuel.refresh().catch(() => {})
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
    if (savedForm.endStage && ['CLOSE', 'ENDED'].includes(savedForm.endStage)) {
      endStage.value = savedForm.endStage
    }
  } else if (savedForm) {
    WorkWorkflowSessionService.save(null)
  }
  workflowTimerReady = true
  workflowStepStartedAt.value = WorkflowTimerService.enter(workflowTimerIdentity.value, Date.now())

  // Wall-clock time is authoritative. Background throttling may delay interval callbacks,
  // so refresh immediately whenever Android/WebView returns to the foreground.
  refreshClock()
  timer = setInterval(refreshClock, 1000)
  document.addEventListener('visibilitychange', refreshClock)
  window.addEventListener('pageshow', refreshClock)
  window.addEventListener('focus', refreshClock)

  nativeActionListener = await WorkRuntimePorts.nativeWorkActions.addListener(
    'nativeWorkAction',
    event => { void enqueueNativeEvent(event) }
  )

  // Replay every native event in durable creation order. Failed/unconfirmed
  // writes remain pending for the next launch instead of being silently lost.
  const pendingEvents = await WorkRuntimePorts.nativeWorkActions.consumePendingActions()
  for (const event of pendingEvents) await processNativeEvent(event)

  // Compatibility for events created by app versions before the SQLite ledger.
  if (!pendingEvents.length) {
    const pending = await WorkRuntimePorts.nativeWorkActions.consumePendingAction()
    if (pending && await handleNativeAction(pending)) await WorkRuntimePorts.nativeWorkActions.clearPendingAction()
  }

  await syncOverlay()
})

watch(() => store.isOnline, () => { void syncOverlay() })
watch(() => store.trip?.tripStage, () => { void syncOverlay() })
watch(cancelOpen, () => { void syncOverlay() })


onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', syncOverlay)
  document.removeEventListener('visibilitychange', replayFailedNativeActions)
  window.removeEventListener('pageshow', replayFailedNativeActions)
  window.removeEventListener('focus', replayFailedNativeActions)
  if (nativeReplayTimer) clearInterval(nativeReplayTimer)
  nativeReplayTimer = null
  document.removeEventListener('visibilitychange', refreshClock)
  window.removeEventListener('pageshow', refreshClock)
  window.removeEventListener('focus', refreshClock)
  if (timer) clearInterval(timer)
  nativeActionListener?.remove?.()
  void WorkRuntimePorts.androidOverlay.hide().catch(() => {})
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
    <WorkLiveMetrics
      v-if="!fuelOpen && !pendingFare && (store.isOnline || cancelOpen || endOpen)"
      :timer-label="stateTimerLabel"
      :timer-value="active ? tripTimer : stateTimer"
      :revenue-value="money(liveRevenue)"
    />
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
      :end-ready="endReady"
      :end-busy="endBusy"
      :end-large-distance-km="largeDistanceKm"
      :large-distance-confirmed-for="largeDistanceConfirmation"
      :large-distance-identity="largeDistanceIdentity"
      :money="money"
      :start-odo="String(store.startOdometer ?? '')"
      :closing-odo="closingOdo"
      @update:closing-odo="closingOdo=$event"
      @update:large-distance-confirmed-for="largeDistanceConfirmation=$event"
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
        <div ref="track" class="swipe trip-swipe" :class="{threshold:swipeProgress>=SWIPE_CONFIG.commitThresholdPercent,committing:busy,'semantic-go':cockpit.action==='GO_TO_PICKUP','semantic-start':cockpit.action==='START_RIDE','semantic-end':cockpit.action==='END_RIDE'}" :style="swipeStyle" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="swipe-copy"><strong>{{ actionLabel }}</strong></div>
          <button class="swipe-handle" type="button" :aria-label="actionLabel" :style="{ transform: `translateX(${swipe.offset}px)`, transition: swipe.down ? 'none' : `transform ${SWIPE_CONFIG.returnDurationMs}ms ease-out` }" @keydown.enter.prevent="keyAction" @keydown.space.prevent="keyAction">→</button>
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
