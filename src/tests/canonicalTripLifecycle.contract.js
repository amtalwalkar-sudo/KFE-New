import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canTransitionTrip, canTransitionTripStage, TRIP_STATES, transitionTrip, transitionTripStage } from '../domain/work/tripLifecycle.js'
import { applyTripDetails } from '../domain/work/trip.js'
import { createCanonicalTripRecord } from '../domain/work/canonicalWorkRecords.js'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = fs.readFileSync(path.join(root, 'repositories', 'shiftTripRepository.js'), 'utf8')
const canonicalWorkRecords = fs.readFileSync(path.join(root, 'domain', 'work', 'canonicalWorkRecords.js'), 'utf8')
const workService = fs.readFileSync(path.join(root, 'application', 'work', 'workService.js'), 'utf8')
const workView = fs.readFileSync(path.join(root, 'views', 'WorkModuleView.vue'), 'utf8') + '\n' + ['WorkContextForm.vue','WorkStartShiftForm.vue','WorkFareForm.vue','WorkCancellationForm.vue','WorkFuelForm.vue','WorkEndShiftForm.vue'].map(name => fs.readFileSync(path.join(root, 'components', 'work', name), 'utf8')).join('\n')
const overlay = fs.readFileSync(path.join(root, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'kanishka', 'pwa', 'KfeOverlayService.java'), 'utf8')

console.log('--- Running KFE Canonical Trip Lifecycle Gate ---')

const newTrip = createCanonicalTripRecord({ shiftId: 'shift-1', operator: 'Uber' }, { createId: () => 'new-trip', now: '2026-09-24T08:00:00.000Z' })
assert(newTrip.revenueAuthority === undefined, 'New canonical Trips must not carry obsolete per-Trip revenue authority metadata.')
const active = { id: 'trip-1', shiftId: 'shift-1', status: TRIP_STATES.ACTIVE, tripStage: 'GOING_TO_PICKUP', revenue: null }
const completed = transitionTrip(active, TRIP_STATES.COMPLETED, { tripEndAt: '2026-09-24T12:00:00.000Z' })
assert(completed.status === 'COMPLETED', 'END_RIDE must produce one COMPLETED canonical Trip')
assert(completed.id === active.id, 'Trip ID must remain stable across END_RIDE')
assert(completed.tripKm === undefined, 'Ride lifecycle must not calculate or capture trip distance')

const priced = applyTripDetails({ ...completed, revenueAuthority: 'SUPPORTING_ONLY' }, { id: active.id, revenue: 250, toll: 10, parking: 5, fareDetailsSkipped: false }, '2026-09-24T12:01:00.000Z')
assert(priced.id === active.id && priced.status === 'COMPLETED', 'Fare must update the same completed Trip, not create another record')
assert(priced.revenue === 250, 'Fare amount must be saved.')
assert(priced.toll === 10, 'Toll must be saved.')
assert(priced.parking === 5, 'Parking must be saved.')
assert(priced.updatedAt === '2026-09-24T12:01:00.000Z', 'Trip detail update time must be saved.')
assert(priced.revenueAuthority === undefined, 'Trip fare remains a supporting fact; obsolete per-Trip revenue authority metadata is not persisted.')

const cancelled = transitionTrip(active, TRIP_STATES.CANCELLED, { revenue: 0, reason: 'DRIVER_MISTAKE' })
assert(cancelled.status === 'CANCELLED', 'Cancellation must produce one CANCELLED canonical Trip')
assert(cancelled.id === active.id, 'Cancellation must retain the canonical Trip ID')
assert(cancelled.cancelledRevenue === 0 && cancelled.revenue === null, 'Cancellation fee must be recorded separately and must not become a Trip fare.')
const cancelledBlank = transitionTrip(active, TRIP_STATES.CANCELLED, { revenue: '', reason: 'DRIVER_MISTAKE' })
assert(cancelledBlank.cancelledRevenue === 0 && cancelledBlank.revenue === null, 'Blank cancellation fee defaults to zero without creating a Trip fare.')
const cancelledZero = transitionTrip(active, TRIP_STATES.CANCELLED, { revenue: 0, reason: 'DRIVER_MISTAKE' })
assert(cancelledZero.cancelledRevenue === 0 && cancelledZero.revenue === null, 'Explicit zero cancellation fee remains distinct from Trip fare.')
const cancelledWithPriorFare = transitionTrip({ ...active, revenue: 300 }, TRIP_STATES.CANCELLED, { revenue: 20, reason: 'PASSENGER' })
assert(cancelledWithPriorFare.cancelledRevenue === 20, 'Cancellation fee must be saved independently.')
assert(cancelledWithPriorFare.revenue === 300, 'Cancellation must not overwrite a pre-existing fare fact with the cancellation fee.')
let cancellationAfterStartRejected = false
try { transitionTrip({ ...active, tripStage: 'RIDE_STARTED' }, TRIP_STATES.CANCELLED, { revenue: 20, reason: 'PASSENGER' }) } catch (_) { cancellationAfterStartRejected = true }
assert(cancellationAfterStartRejected, 'A Trip cannot be cancelled after the ride has started.')
let invalidCancellationRejected = false
try { transitionTrip(active, TRIP_STATES.CANCELLED, { revenue: 'not-a-number' }) } catch (_) { invalidCancellationRejected = true }
assert(invalidCancellationRejected, 'Invalid cancellation fee must be rejected')

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
assert(!/revenueAuthority/.test(canonicalWorkRecords), 'Canonical Trip factory must not create obsolete revenue authority metadata.')
assert(repository.includes("import { applyTripDetails } from '../domain/work/trip.js'"), 'Browser repository must use the shared domain Trip detail mutation.')
assert(workService.includes("applyTripDetails(trip, details, nextCanonicalTimestamp(trip.updatedAt))"), 'Native-first Work service must use the same domain Trip detail mutation.')
assert(!repository.includes("const applyTripDetails ="), 'Browser repository must not keep a duplicate Trip detail mutation.')
assert(!workService.includes("const applyTripDetails ="), 'Work service must not keep a duplicate Trip detail mutation.')
assert(!repository.includes("revenueAuthority = 'SUPPORTING_ONLY'") && !workService.includes("revenueAuthority = 'SUPPORTING_ONLY'"), 'The retired Trip-level revenue-authority marker must not be written.')
assert(repository.includes('transitionTrip(record, status, data)'), 'Trip completion/cancellation must use the shared transition function')
assert(repository.includes("shift.revenue = deriveLiveRevenue(shiftTrips)"), 'Canonical Shift.revenue must be projected from eligible completed-trip fares and cancellation fees.')
assert(repository.includes("db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite')"), 'Shift completion must project revenue from trips atomically with the canonical shift close.')
assert(!repository.includes('if (hasSavedFare)'), 'A missing optional fare must not leave stale or manually entered Shift.revenue as authority.')
assert(workService.includes('ShiftTripRepository.completeTrip'), 'Main app completion must use canonical Trip repository')
assert(workService.includes('ShiftTripRepository.cancelTrip'), 'Main app cancellation must use canonical Trip repository')
assert(repository.includes('async setTripStage'), 'Canonical repository must persist pickup/ride stage')
assert(repository.includes('transitionTripStage(trip, stage, { at: now })'), 'Repository must enforce the canonical trip-stage transition')
assert(!repository.includes('trip.tripStage = String(stage)'), 'Repository must not persist arbitrary trip-stage values')
assert(canonicalWorkRecords.includes("tripStage: normalized.tripStage || 'GOING_TO_PICKUP'"), 'Shared canonical record factory must retain explicit persisted pickup stage authority')
assert(repository.includes('createCanonicalTripRecord(data'), 'Repository must use the shared canonical Trip record factory')

assert(workService.includes('async startRide'), 'Work service must expose canonical START_RIDE stage transition')
assert(workView.includes('GO TO PICKUP') && workView.includes('START TRIP') && workView.includes('END TRIP'), 'Work cockpit must expose the three frozen swipe states')
assert(workView.includes('CANCEL TRIP'), 'Work cancellation must be available only at READY FOR TRIP')
assert(workView.includes('TRIP COMPLETED') && workView.includes('Trip fare') && workView.includes('inputmode="none"') && workView.includes('readonly'), 'Work cockpit must expose KFE-owned completed-trip fare entry')
assert(overlay.includes('"START_RIDE".equals(actionStage)') && overlay.includes('openCancelForm()'), 'Overlay cancellation must be available only on the pre-ride START_RIDE state')

console.log('✓ END_RIDE → COMPLETED → fare preserves one Trip ID')
console.log('✓ CANCEL_RIDE → CANCELLED stores a distinct cancellation fee and preserves any Trip fare fact')
console.log('✓ Terminal replay is idempotent; cross-terminal mutation is blocked')
console.log('✓ PWA and native command adapters preserve the same Trip lifecycle and canonical data semantics')
console.log('✓ Work cockpit and overlay share pickup/start/end/fare/cancel state semantics')
console.log('✅ Canonical Trip Lifecycle Gate Passed Successfully!')
