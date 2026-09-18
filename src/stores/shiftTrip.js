import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { WorkService } from '../application/work/workService.js'

export const useShiftTripStore = defineStore('shiftTrip', () => {
  const shift = ref(null)
  const trip = ref(null)
  const registeredTrips = ref([])
  const completedTrips = ref([])
  const lifecycleLocations = ref([])
  const tripLocations = ref([])
  const lastKnownOdometer = ref(null)
  const businessStartBaseline = ref(null)
  const firstKfeDay = ref(false)
  const operators = WorkService.getTripOperators()
  const defaultOperator = ref(operators[0])
  const initialized = ref(false)

  const isShiftActive = computed(() => shift.value?.status === 'ACTIVE')
  const isTripActive = computed(() => trip.value?.status === 'ACTIVE')
  const isOnline = isShiftActive
  const isFinancialDayActive = computed(() => isShiftActive.value && registeredTrips.value.length > 0)
  const headerShiftStatus = computed(() => isShiftActive.value ? 'ONLINE' : 'OFFLINE')
  const headerTripStatus = computed(() => isTripActive.value ? 'ON' : 'OFF')
  const startOdometer = computed(() => shift.value?.startOdometer ?? lastKnownOdometer.value)

  const loadLifecycleLocations = async () => {
    lifecycleLocations.value = shift.value ? await WorkService.getLocations('SHIFT', shift.value.id) : []
    tripLocations.value = trip.value ? await WorkService.getLocations('TRIP', trip.value.id) : []
  }
  const loadEntityLocations = async (entityType, entityId) => {
    if (entityType === 'SHIFT') lifecycleLocations.value = await WorkService.getLocations('SHIFT', entityId)
    if (entityType === 'TRIP') tripLocations.value = await WorkService.getLocations('TRIP', entityId)
  }
  const captureAndRefreshLocation = ({ entityType, entityId, eventType }) => {
    void WorkService.captureLocation({ entityType, entityId, eventType }).then(() => loadEntityLocations(entityType, entityId)).catch(() => {})
  }

  const refresh = async () => {
    const active = await WorkService.getActiveState()
    shift.value = active.shift
    trip.value = active.trip
    if (shift.value) {
      registeredTrips.value = await WorkService.getTripsForShift(shift.value.id)
      completedTrips.value = registeredTrips.value.filter(item => item.status === 'COMPLETED')
    } else {
      registeredTrips.value = []
      completedTrips.value = []
    }
    const previous = await WorkService.getLastCompletedShift()
    lastKnownOdometer.value = previous?.endOdometer ?? null
    businessStartBaseline.value = await WorkService.getBusinessStartBaseline()
    firstKfeDay.value = !previous && !shift.value
    const previousTrip = await WorkService.getLastCompletedTrip()
    if (previousTrip?.operator && operators.includes(previousTrip.operator)) defaultOperator.value = previousTrip.operator
    await loadLifecycleLocations()
    initialized.value = true
  }

  const initialize = async () => { if (!initialized.value) await refresh() }
  const calculateGap = odo => firstKfeDay.value
    ? WorkService.validateFirstDayShiftStartOdometer(odo, businessStartBaseline.value?.businessStartOdometer)
    : WorkService.validateShiftStartOdometer(odo, lastKnownOdometer.value)

  const startShift = async (odo, allocation = null) => {
    if (isShiftActive.value) return { ok: false, reason: 'A Shift is already active.' }
    const check = calculateGap(odo)
    if (!check.valid) return { ok: false, reason: check.reason }
    const allocationCheck = WorkService.validateGapAllocation(check.gapKm, allocation?.category)
    if (!allocationCheck.valid) return allocationCheck
    const record = await WorkService.startShift({ startOdometer: Number(odo), openingPersonalKm: allocationCheck.personalKm, openingDeadKm: allocationCheck.deadKm, openingPersonalToll: Number(allocation?.personalToll || 0), openingPersonalParking: Number(allocation?.personalParking || 0), openingBaselineType: firstKfeDay.value ? 'BUSINESS_START_FIRST_DAY' : 'POST_KFE_GAP', historicalOdometerGapKm: firstKfeDay.value ? Number(check.historicalKm || 0) : 0, businessStartDate: businessStartBaseline.value?.businessStartDate || null, businessStartOdometer: businessStartBaseline.value?.businessStartOdometer ?? null })
    shift.value = record
    await refresh()
    captureAndRefreshLocation({ entityType: 'SHIFT', entityId: record.id, eventType: 'ONLINE' })
    return { ok: true }
  }

  const startTrip = async operator => {
    if (!isShiftActive.value) return { ok: false, reason: 'Go Online before starting a Trip.' }
    if (isTripActive.value) return { ok: false, reason: 'A Trip is already active.' }
    const selected = operators.includes(operator) ? operator : defaultOperator.value
    const result = await WorkService.startTrip({ shiftId: shift.value.id, operator: selected })
    if (result?.ok === false) return result
    const record = result
    trip.value = record
    defaultOperator.value = selected
    registeredTrips.value = [...registeredTrips.value, record]
    captureAndRefreshLocation({ entityType: 'TRIP', entityId: record.id, eventType: 'START' })
    return { ok: true, trip: record }
  }

  const endTrip = async () => {
    if (!isTripActive.value) return false
    const tripId = trip.value.id
    await WorkService.completeTrip({ id: tripId })
    await refresh()
    captureAndRefreshLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'END' })
    return true
  }

  const cancelTrip = async ({ reason = 'DRIVER_MISTAKE', revenue = '' } = {}) => {
    if (!isTripActive.value) return false
    const tripId = trip.value.id
    await WorkService.cancelTrip({ id: tripId, reason, revenue })
    await refresh()
    captureAndRefreshLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'CANCELLED' })
    return true
  }

  const updateTrip = async data => {
    const result = await WorkService.updateTrip(data)
    if (result?.ok === false) return result
    await refresh()
    return { ok: true }
  }

  const endShift = async data => {
    if (!isShiftActive.value) return { ok: false, reason: 'No active Shift.' }
    if (isTripActive.value) return { ok: false, reason: 'Cannot go Offline while a Trip is active. End the active Trip first.' }
    const shiftId = shift.value.id
    const result = await WorkService.endShift({ shiftId, ...data })
    if (!result.ok) return result
    await refresh()
    captureAndRefreshLocation({ entityType: 'SHIFT', entityId: shiftId, eventType: 'OFFLINE' })
    return result
  }

  return { shift, trip, registeredTrips, completedTrips, lifecycleLocations, tripLocations, operators, defaultOperator, lastKnownOdometer, businessStartBaseline, firstKfeDay, startOdometer, isShiftActive, isTripActive, isOnline, isFinancialDayActive, headerShiftStatus, headerTripStatus, initialize, refresh, calculateGap, startShift, startTrip, endTrip, cancelTrip, updateTrip, endShift }
})
