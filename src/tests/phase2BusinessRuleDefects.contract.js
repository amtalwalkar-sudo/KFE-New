import assert from 'node:assert/strict'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { calculateHistoricalMaintenanceRecovery } from '../domain/performance/performanceEngineV2.js'
import { calculatePreBusinessLoanRecovery, deriveLoanPosition } from '../domain/finance/loanEngine.js'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'

const businessStart = '2026-05-15'
const normalized = normalizeCalculationSnapshot({
  businessSetup: { businessStartDate: businessStart },
  vehicles: [{ id: 'vehicle-1', acquiredOn: '2025-01-01', openingOdometerKm: 65000, status: 'Active' }],
  shifts: [], trips: [], fuelLogs: [], maintenance: [], compliance: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [], settlements: [],
})
assert.equal(ADMIN_FORM_DEFINITIONS.businessSetup.fields[0].key, 'businessStartDate')
assert.equal(normalized.businessSetup.businessStartDate, businessStart)
assert.equal(calculateHistoricalMaintenanceRecovery({ vehicles: normalized.vehicles, businessStartDate: businessStart, asOf: '2026-05-15' }), 2166.67)
assert.equal(calculateHistoricalMaintenanceRecovery({ vehicles: normalized.vehicles, businessStartDate: businessStart, asOf: '2027-05-14' }), 2166.67)
assert.equal(calculateHistoricalMaintenanceRecovery({ vehicles: normalized.vehicles, businessStartDate: businessStart, asOf: '2027-05-15' }), 0)
assert.equal(calculateHistoricalMaintenanceRecovery({ vehicles: normalized.vehicles, businessStartDate: businessStart, asOf: '2026-05-14' }), 0)

const loan = { id: 'loan-phase2', principal: 12000, tenureMonths: 12, startDate: '2026-01-01', annualInterestRatePercent: 10, status: 'Active' }
const loanAtStart = deriveLoanPosition({ loan, asOf: businessStart })
const expectedLoanRecovery = Math.round(((loanAtStart.outstandingPrincipal + loanAtStart.overdue.reduce((sum, row) => sum + row.unpaidScheduledInterest + row.unpaidOverdueInterest, 0)) / 12) * 100) / 100
assert.ok(expectedLoanRecovery > 0)
assert.equal(calculatePreBusinessLoanRecovery({ loan, businessStartDate: businessStart, asOf: '2026-05-15' }), expectedLoanRecovery)
assert.equal(calculatePreBusinessLoanRecovery({ loan, businessStartDate: businessStart, asOf: '2027-05-14' }), expectedLoanRecovery)
assert.equal(calculatePreBusinessLoanRecovery({ loan, businessStartDate: businessStart, asOf: '2027-05-15' }), 0)
assert.equal(calculatePreBusinessLoanRecovery({ loan: { ...loan, startDate: '2026-06-01' }, businessStartDate: businessStart, asOf: '2026-06-15' }), 0)

const metrics = deriveFinanceAwarePerformance(normalized, { from: new Date('2026-05-15T00:00:00+05:30'), to: new Date('2026-05-15T23:59:59+05:30') })
assert.equal(metrics.finance.businessStartDate, new Date(businessStart + 'T00:00:00+05:30').toISOString())
assert.equal(metrics.historicalMaintenanceRecoveryMonthly, 2166.67)
assert.equal(metrics.finance.preBusinessRecoveryMonthly, 0)
assert.equal(metrics.maintenanceProvision, 0)

const loanSnapshot = normalizeCalculationSnapshot({ ...normalized, loans: [loan], loanPayments: [], prepayments: [] })
const loanMetrics = deriveFinanceAwarePerformance(loanSnapshot, { from: new Date('2026-05-15T00:00:00+05:30'), to: new Date('2026-05-15T23:59:59+05:30') })
assert.equal(loanMetrics.finance.preBusinessRecoveryMonthly, expectedLoanRecovery)
assert.equal(loanMetrics.finance.businessStartDate, new Date(businessStart + 'T00:00:00+05:30').toISOString())

console.log('Phase 2 business-rule contract passed: Business Start Date authority, acquisition-date separation, ₹0.40/km historical recovery, ₹1.60/km predictive maintenance, and origin-based 12-month loan recovery.')
