import assert from 'node:assert/strict'
import { deriveAuthoritativeBreakEven } from '../domain/performance/authoritativeBreakEven.js'
import { CALCULATION_STATUS } from '../domain/performance/calculationAuthority.js'

const range = { from: new Date('2026-09-01T00:00:00+05:30'), to: new Date('2026-09-30T23:59:59+05:30') }

const result = deriveAuthoritativeBreakEven({
  breakEvenInputs: [{ id: 'be', effectiveFrom: '2026-01-01', maintenanceProvisionPerKm: 1.5, active: true }],
  range,
  loanScheduledObligation: 10000,
  preBusinessRecovery: 0,
  historicalMaintenanceRecovery: 0,
  renewalProvision: 3000,
  fuelCostPerKm: 2,
  fuelCostPerKmStatus: CALCULATION_STATUS.AUTHORITATIVE,
  vehicleKm: 6000,
  vehicleKmSource: 'ADMIN_EXPECTED_MONTHLY_KM',
})
assert.equal(result.available, true)
assert.equal(result.monthlyBreakEvenRevenue, 31000)
assert.equal(result.vehicleKm, 6000)
assert.equal(result.vehicleKmSource, 'ADMIN_EXPECTED_MONTHLY_KM')

console.log('Normalized monthly vehicle-KM break-even contract: PASS')
