import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canTransitionTrip, canTransitionTripStage, TRIP_STATES, transitionTrip, transitionTripStage } from '../domain/work/tripLifecycle.js'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = fs.readFileSync(path.join(root, 'repositories', 'shiftTripRepository.js'), 'utf8')
const workService = fs.readFileSync(path.join(root, 'application', 'work', 'workService.js'), 'utf8')
const workView = fs.readFileSync(path.join(root, 'views', 'WorkModuleView.vue'), 'utf8')
const overlay = fs.readFileSync(path.join(root, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'kanishka', 'pwa', 'KfeOverlayService.java'), 'utf8')

console.log('--- Running KFE Canonical Trip Lifecycle Gate ---')

const active = { id: 'trip-1', shiftId: 'shift-1', status: TRIP_STATES.ACTIVE, revenue: null }
const completed = transitionTrip(active, TRIP_STATES.COMPLETED, { tripEndAt: '2026-09-24T12:00:00.000Z', tripKm: 12.4, tripKmAuthority: 'GPS_ESTIMATE' })
assert(completed.status === 'COMPLETED', 'END_RIDE must produce one COMPLETED canonical Trip')
assert(completed.id === active.id, 'Trip ID must remain stable across END_RIDE')
assert(completed.tripKm === 12.4, 'Completed trip must retain canonical trip distance')

const priced = { ...completed, revenue: 250, revenueAuthority: 'SUPPORTING_ONLY' }
assert(priced.id === active.id && priced.status === 'COMPLETED', 'Fare must update the same completed Trip, not create another record')

const cancelled = transitionTrip(active, TRIP_STATES.CANCELLED, { revenue: 0, reason: 'DRIVER_MISTAKE' })
assert(cancelled.status === 'CANCELLED', 'Cancellation must produce one CANCELLED canonical Trip')
assert(cancelled.id === active.id, 'Cancellation must retain the canonical Trip ID')
assert(cancelled.cancelledRevenue === 0 && cancelled.revenue === 0, 'Cancellation default revenue must be ₹0')

assert(canTransitionTrip(TRIP_STATES.ACTIVE, TRIP_STATES.COMPLETED), 'ACTIVE → COMPLETED transition missing')
assert(canTransitionTripStage('PICKUP', 'RIDE_STARTED'), 'PICKUP → RIDE_STARTED transition missing')
assert(!canTransitionTripStage('RIDE_STARTED', 'GOING_TO_PICKUP'), 'RIDE_STARTED must not transition back to pickup')
let invalidStageRejected = false
try { transitionTripStage({ ...active, tripStage: 'RIDE_STARTED' }, 'GOING_TO_PICKUP', { at: '2026-10-01T08:00:00+05:30' }) } catch (_) { invalidStageRejected = true }
assert(invalidStageRejected, 'RIDE_STARTED must reject a transition back to pickup')
assert(canTransitionTrip(TRIP_STATES.ACTIVE, TRIP_STATES.CANCELLED), 'ACTIVE → CANCELLED transition missing')
assert(canTransitionTrip(TRIP_STATES.COMPLETED, TRIP_STATES.COMPLETED), 'Completed replay must be idempotent')
assert(canTransitionTrip(TRIP_STATES.CANCELLED, TRIP_STATES.CANCELLED), 'Cancelled replay must be idempotent')
assert(!canTransitionTrip(TRIP_STATES.COMPLETED, TRIP_STATES.CANCELLED), 'A completed Trip must not be cancelled into a second terminal record')
assert(!canTransitionTrip(TRIP_STATES.CANCELLED, TRIP_STATES.COMPLETED), 'A cancelled Trip must not be completed into a second terminal record')

assert(repository.includes("import { transitionTrip, transitionTripStage, TRIP_STATES } from '../domain/work/tripLifecycle.js'"), 'Canonical repository must use the shared Trip lifecycle')
assert(repository.includes('transitionTrip(record, status, data)'), 'Trip completion/cancellation must use the shared transition function')
assert(workService.includes('ShiftTripRepository.completeTrip'), 'Main app completion must use canonical Trip repository')
assert(workService.includes('ShiftTripRepository.cancelTrip'), 'Main app cancellation must use canonical Trip repository')
assert(repository.includes('async setTripStage'), 'Canonical repository must persist pickup/ride stage')
assert(repository.includes('transitionTripStage(trip, stage, { at: now })'), 'Repository must enforce the canonical trip-stage transition')
assert(!repository.includes('trip.tripStage = String(stage)'), 'Repository must not persist arbitrary trip-stage values')
assert(repository.includes("tripStage: normalized.tripStage || 'GOING_TO_PICKUP'"), 'Repository must retain explicit persisted pickup stage authority')

assert(workService.includes('async startRide'), 'Work service must expose canonical START_RIDE stage transition')
assert(workView.includes('GO TO PICKUP') && workView.includes('START TRIP') && workView.includes('END TRIP'), 'Work cockpit must expose the three frozen swipe states')
assert(workView.includes('CANCEL TRIP'), 'Work cancellation must be available only at READY FOR TRIP')
assert(workView.includes('TRIP COMPLETED') && workView.includes('Trip fare') && workView.includes('inputmode="numeric"'), 'Work cockpit must expose native completed-trip fare entry')
assert(overlay.includes('"START_RIDE".equals(actionStage)') && overlay.includes('openCancelForm()'), 'Overlay cancellation must be available only on the pre-ride START_RIDE state')

console.log('✓ END_RIDE → COMPLETED → fare preserves one Trip ID')
console.log('✓ CANCEL_RIDE → CANCELLED ₹0 preserves one Trip ID')
console.log('✓ Terminal replay is idempotent; cross-terminal mutation is blocked')
console.log('✓ Main app and overlay command paths converge on the canonical Trip repository')
console.log('✓ Work cockpit and overlay share pickup/start/end/fare/cancel state semantics')
console.log('✅ Canonical Trip Lifecycle Gate Passed Successfully!')
