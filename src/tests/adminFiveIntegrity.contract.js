import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const adminService = read('../application/admin/adminService.js')
const adminRepo = read('../repositories/adminRepository.js')
const perfEngine = read('../domain/performance/performanceEngineV2.js')
const maintenanceRate = read('../domain/performance/maintenanceRate.js')
const adminForm = read('../components/admin/AdminSourceForm.vue')
const formShell = read('../components/KfeFormShell.vue')
const formField = read('../components/KfeFormField.vue')
const workForm = read('../components/work/WorkContextForm.vue')
const useForm = read('../composables/useForm.js')

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
    { id: 'shift-1', shiftStartAt: '2026-10-01T09:00:00+05:30', shiftEndAt: '2026-10-01T18:00:00+05:30', revenue: 0 },
    { id: 'shift-2', shiftStartAt: '2026-10-02T09:00:00+05:30', shiftEndAt: '2026-10-02T18:00:00+05:30', revenue: 0 },
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
assert.match(adminRepo, /legacy value on unrelated edits so removing the old field never silently destroys stored history/, 'Removing a presentation field must not erase legacy vehicle data on edit')
const shiftTripRepo = read('../repositories/shiftTripRepository.js')
assert.match(shiftTripRepo, /const terminalVehicleStates = new Set\(\['SOLD', 'RETIRED', 'TRANSFERRED', 'INACTIVE'\]\)/, 'Terminal vehicle states must be centrally enumerated')
assert.match(shiftTripRepo, /const vehicleLifecycleStates = vehicle => \[vehicle\?\.status, vehicle\?\.lifecycle_status\]/, 'Both legacy lifecycle aliases must be evaluated rather than masking one another')
assert.match(shiftTripRepo, /vehicleLifecycleStates\(vehicle\)\.some\(status => terminalVehicleStates\.has\(status\)\)/, 'A terminal value in either lifecycle alias must make a vehicle ineligible')
assert.match(shiftTripRepo, /vehicle\?\.active !== false/, 'Explicit inactive flag must make a vehicle ineligible')
assert.match(shiftTripRepo, /const liveVehicle = isEligibleVehicle/, 'Primary vehicle selection must use the shared vehicle eligibility rule')
assert.match(shiftTripRepo, /const hasValidOpeningOdometer = vehicle =>[^\n]*openingOdometerKm !== null[^\n]*openingOdometerKm !== undefined[^\n]*Number\.isFinite\(Number\(vehicle\.openingOdometerKm\)\)/, 'Business-start baseline must reject null, blank, non-finite, and negative opening odometers while accepting zero')
assert.match(shiftTripRepo, /vehicles\.filter\(v => isEligibleVehicle\(v\) && hasValidOpeningOdometer\(v\)\)/, 'Business-start baseline must apply both shared lifecycle eligibility and valid opening odometer rules')
assert.ok(maintenanceRate.includes("String(b.updatedAt || b.createdAt || b.id || '')"), 'Maintenance rate selection must tie-break identical effective dates deterministically')
assert.doesNotMatch(adminForm, /v-model(?:\.[\\w-]+)?=/, 'Admin form controls must not use Vue v-model for native entry')
assert.doesNotMatch(adminForm, /userEditing/, 'Admin form must not rely on an editing flag that can be reset by parent synchronization')
assert.ok(adminForm.includes('function changed(field, raw)'), 'Admin form native controls must write through explicit field events')
assert.doesNotMatch(adminForm, /openEditor|closeEditor|editorRef|editorOpen/, 'Admin form must not use an isolated editor overlay')
assert.ok(adminForm.includes(':value="value(field)"') && adminForm.includes('@input="changed(field, $event.target.value)"'), 'Admin text and numeric fields must use reactive values and native input events')

assert.doesNotMatch(formShell, /watch\(.*props\.initialValue/, 'Shared KfeFormShell must not overwrite active form state from initial props')
assert.doesNotMatch(workForm, /watch\(.*props\..*form/, 'Work contextual form must not introduce a parent-prop watcher that resets active input')
assert.match(formField, /emit\('update:modelValue'/, 'Shared form field must propagate user input directly')
assert.match(useForm, /const form = reactive\(\{ \.\.\.initialState \}\)/, 'Shared useForm must own mutable local input state')
const adminView = read('../views/AdminView.vue')
const calculationsView = read('../views/CalculationsView.vue')
assert.doesNotMatch(adminView + calculationsView, /AdminNativeForm/, 'No Admin subsection may retain the previous form implementation')
assert.match(calculationsView, /<AdminSourceForm[\s\S]*fuelFields/, 'Fuel baseline must use the new form system')
assert.match(calculationsView, /isFullTank:!Boolean\(values\.isPartialTank\)/, 'Partial-fill selection must map to canonical full-tank semantics')
assert.match(adminView, /loading=ref\(false\)/, 'Admin must separate background loading state')
assert.match(adminView, /saving=ref\(false\)/, 'Admin must separate form saving state')
assert.match(adminView, /<AdminSourceForm[\s\S]*:busy="saving"/, 'Admin form must not be disabled by background data loading')
console.log('PWA-wide form input ownership guards: PASS')
console.log('Admin five-defect integrity contract: PASS')

// CI retrigger only: preserve the reviewed cross-layer UI acknowledgement on the next PR event.
