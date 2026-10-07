import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const adminService = read('../application/admin/adminService.js')
const adminRepo = read('../repositories/adminRepository.js')
const perfEngine = read('../domain/performance/performanceEngineV2.js')

const breakEven = getAdminFormDefinition('breakEvenInputs')
assert.equal(breakEven.fields.some(field => field.key === 'expectedMonthlyVehicleKm'), false,
  'expectedMonthlyVehicleKm must not remain an Admin input when actual vehicle KM is authoritative')
const normalized = normalizeCalculationSnapshot({
  shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [],
  loans: [], loanPayments: [], prepayments: [], driverTargets: [], settlements: [],
  breakEvenInputs: [{ id: 'rate', effectiveFrom: '2026-10-01', maintenanceProvisionPerKm: 1.6, expectedMonthlyVehicleKm: 1000 }],
})
assert.equal(normalized.breakEvenInputs[0].expectedMonthlyVehicleKm, undefined,
  'legacy expectedMonthlyVehicleKm must not become a calculation input')

const samePeriodOld = {
  id: 'target-old',
  driverId: 'driver-1',
  effectiveFrom: '2026-10-01',
  targetRevenue: 100,
  active: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const samePeriodNew = {
  id: 'target-new',
  driverId: 'driver-1',
  effectiveFrom: '2026-10-01',
  targetRevenue: 200,
  active: true,
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
}
const targetResult = deriveRollingDriverTarget({
  driverTargets: [samePeriodOld, samePeriodNew],
  shifts: [
    { id: 'shift-1', shiftStartAt: '2026-10-01T09:00:00+05:30', shiftEndAt: '2026-10-01T18:00:00+05:30' },
    { id: 'shift-2', shiftStartAt: '2026-10-02T09:00:00+05:30', shiftEndAt: '2026-10-02T18:00:00+05:30' },
  ],
  trips: [],
  from: '2026-10-02T00:00:00+05:30',
  to: '2026-10-02T23:59:59+05:30',
})
assert.equal(targetResult.balanceBefore, 200, 'latest saved target must win when effective period is identical')
assert.equal(targetResult.currentDailyTarget, 400, 'current target must use deterministic latest same-period record')

const nonWorkingResult = deriveRollingDriverTarget({
  driverTargets: [{
    ...samePeriodNew,
    nonWorkingDates: '2026-10-01',
  }],
  shifts: [
    { id: 'shift-1', shiftStartAt: '2026-10-01T09:00:00+05:30', shiftEndAt: '2026-10-01T18:00:00+05:30' },
    { id: 'shift-2', shiftStartAt: '2026-10-02T09:00:00+05:30', shiftEndAt: '2026-10-02T18:00:00+05:30' },
  ],
  trips: [],
  from: '2026-10-02T00:00:00+05:30',
  to: '2026-10-02T23:59:59+05:30',
})
assert.equal(nonWorkingResult.balanceBefore, 0, 'planned non-working day must not increase recovery')
assert.equal(nonWorkingResult.activeDays, 1, 'planned non-working day must be excluded from active target days')

assert.match(adminService, /maintenance:\[\['settlement','sourceId'\]\]/, 'Maintenance deletion must protect linked settlements')
assert.match(adminService, /compliance:\[\['settlement','sourceId'\]\]/, 'Compliance deletion must protect linked settlements')
assert.match(adminRepo, /assertSourcePaymentIntegrity/, 'Maintenance/Compliance edits must enforce source/payment integrity')
assert.match(adminRepo, /assertSourceHasNoSettlements/, 'Maintenance/Compliance deletion must enforce settlement integrity')
assert.match(perfEngine, /String\(b\.updatedAt \|\| b\.createdAt \|\| b\.id \|\| ''\)/, 'Maintenance rate selection must tie-break identical effective dates deterministically')

console.log('Admin five-defect integrity contract: PASS')
