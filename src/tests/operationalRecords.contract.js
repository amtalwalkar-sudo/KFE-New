import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const service = read('services/operationalRecordService.js')
const shiftRepo = read('repositories/shiftTripRepository.js')
const fuelRepo = read('repositories/fuelRepository.js')
const canonical = fs.readFileSync(path.join(root, '..', 'docs', 'KFE-CANONICAL-DATA-CONTRACT.md'), 'utf8')

console.log('--- Running KFE Phase 4 Operational Records Contract Tests ---')

// Phase 3 correction: mutation/audit lineage is owned by the canonical repository helper.
const rideCaptureTest = read('tests/rideCapture.contract.js')
assert(shiftRepo.includes("saveMutation = (mutationStore, auditStore, entityId, entityType, action"), 'Canonical Trip mutation helper missing')
assert(shiftRepo.includes("saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now)"), 'Trip creation must retain mutation/audit lineage')
assert(rideCaptureTest.includes("saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now)"), 'Ride Capture contract must verify the repository mutation call actually used')

// Operational lifecycle delegates to the existing canonical repositories.
for (const method of ['startShift(data)', 'completeShift(data)', 'recordFuel(data)', 'reconstructShift(shiftId)']) assert(service.includes(method), `Operational service method missing: ${method}`)
assert(service.includes('ShiftTripRepository.createShift'), 'Shift creation must use canonical Shift repository')
assert(service.includes('ShiftTripRepository.completeShift'), 'Shift completion must use canonical Shift repository')
assert(service.includes('FuelRepository.create'), 'Fuel capture must use canonical Fuel repository')

// Reconstruction consumes canonical records rather than creating aggregate authorities.
for (const field of ['shift', 'trips', 'completedTrips', 'revenue', 'businessKm', 'vehicleKm', 'deadKm', 'fuelLogs', 'fuelQuantityKg', 'fuelCost', 'toll', 'parking']) assert(service.includes(field), `Operational reconstruction output missing: ${field}`)
assert(service.includes("trip.status === 'COMPLETED'"), 'Revenue/business-KM reconstruction must use completed Trips')
assert(service.includes('trip.revenue'), 'Revenue must be reconstructed from Trip revenue')
assert(service.includes('trip.tripKm'), 'Business KM must be reconstructed from Trip KM')
assert(service.includes('shift.endOdometer') && service.includes('shift.startOdometer'), 'Vehicle KM must use Shift odometer boundaries')
assert(service.includes('vehicleKm - businessKm'), 'Dead KM must derive from vehicle KM minus business KM')
assert(service.includes('FuelRepository.getAll'), 'Fuel reconstruction must consume canonical Fuel logs')

// No generic Expense or persisted operational aggregate authority is introduced.
assert(!service.includes('expenseTotal'), 'Operational service must not create a generic expense authority')
assert(!service.includes('saveOperationalTotal'), 'Operational aggregate must not be persisted as a competing authority')
assert(canonical.includes('A generic Expense aggregate must not become a competing source of truth'), 'Canonical Expense authority boundary must remain protected')
assert(canonical.includes('Trip.revenue'), 'Canonical revenue authority must remain Trip revenue')
assert(canonical.includes('Shift.startOdometer') && canonical.includes('Shift.endOdometer'), 'Canonical odometer authority must remain Shift boundaries')

// Fuel authority and full-tank state remain canonical.
assert(fuelRepo.includes('isFullTank'), 'Fuel full-tank state must remain persisted')
assert(fuelRepo.includes('writeMutationAndAudit'), 'Fuel mutation/audit lineage must remain transactional')

// Operational reconstruction must expose unavailable values explicitly, not fabricate them.
assert(service.includes('vehicleKm: vehicleKm == null'), 'Unavailable vehicle KM boundary missing')
assert(service.includes('deadKm: deadKm == null'), 'Unavailable dead KM boundary missing')

console.log('✅ Phase 4 Operational Records Contract Tests Passed Successfully!')
