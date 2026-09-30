import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const service = read('application/timeline/operationalRecordService.js')
const shiftRepo = read('repositories/shiftTripRepository.js')
const fuelRepo = read('repositories/fuelRepository.js')
const canonical = fs.readFileSync(path.join(root, '..', 'docs', 'KFE-CANONICAL-DATA-CONTRACT.md'), 'utf8')

console.log('--- Running KFE Phase 4 Operational Records Contract Tests ---')

const rideCaptureTest = read('tests/rideCapture.contract.js')
assert(shiftRepo.includes("saveMutation = (mutationStore, auditStore, entityId, entityType, action"), 'Canonical Trip mutation helper missing')
assert(shiftRepo.includes("saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now)"), 'Trip creation must retain mutation/audit lineage')
assert(rideCaptureTest.includes("saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now)"), 'Ride Capture contract must verify the repository mutation call actually used')

for (const method of ['startShift(data)', 'completeShift(data)', 'recordFuel(data)', 'reconstructShift(shiftId)']) assert(service.includes(method), `Operational service method missing: ${method}`)
assert(service.includes('ShiftTripRepository.createShift'), 'Shift creation must use canonical Shift repository')
assert(service.includes('ShiftTripRepository.completeShift'), 'Shift completion must use canonical Shift repository')
assert(service.includes('FuelRepository.create'), 'Fuel capture must use canonical Fuel repository')

for (const field of ['shift', 'trips', 'completedTrips', 'revenue', 'businessKm', 'vehicleKm', 'deadKm', 'fuelLogs', 'fuelQuantityKg', 'fuelCost', 'toll', 'parking']) assert(service.includes(field), `Operational reconstruction output missing: ${field}`)
assert(service.includes("trip.status === 'COMPLETED'"), 'Business-KM reconstruction must use completed Trips')
assert(service.includes('trip.tripKm'), 'Business KM must be reconstructed from Trip KM')
assert(service.includes('shift.revenue'), 'ERP revenue must be reconstructed from authoritative Shift revenue')
assert(!service.includes('completedTrips.reduce((sum, trip) => sum + Number(trip.revenue || 0), 0)'), 'Operational reconstruction must not sum Trip revenue as ERP revenue authority')
assert(service.includes('shift.endOdometer') && service.includes('shift.startOdometer'), 'Vehicle KM must use Shift odometer boundaries')
assert(service.includes('vehicleKm - businessKm'), 'Dead KM must derive from vehicle KM minus business KM')
assert(service.includes('FuelRepository.getAll'), 'Fuel reconstruction must consume canonical Fuel logs')

assert(!service.includes('expenseTotal'), 'Operational service must not create a generic expense authority')
assert(!service.includes('saveOperationalTotal'), 'Operational aggregate must not be persisted as a competing authority')
assert(canonical.includes('Shift.revenue') && canonical.includes('authoritative ERP revenue input'), 'Canonical revenue authority must remain Shift-end revenue')
assert(canonical.includes('Trip.revenue') && canonical.includes('supporting/detail data only'), 'Canonical Trip revenue must remain supporting-only detail')
assert(canonical.includes('Shift.startOdometer') && canonical.includes('Shift.endOdometer'), 'Canonical odometer authority must remain Shift boundaries')

assert(fuelRepo.includes('isFullTank'), 'Fuel full-tank state must remain persisted')
assert(fuelRepo.includes('writeMutationAndAudit'), 'Fuel mutation/audit lineage must remain transactional')
assert(service.includes('vehicleKm: vehicleKm == null'), 'Unavailable vehicle KM boundary missing')
assert(service.includes('deadKm: deadKm == null'), 'Unavailable dead KM boundary missing')

console.log('✅ Phase 4 Operational Records Contract Tests Passed Successfully!')
