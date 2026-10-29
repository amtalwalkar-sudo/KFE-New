import assert from 'node:assert/strict'
import { AdminReadModelService } from '../application/admin/adminReadModelService.js'

const position = AdminReadModelService.getSourceFinancialPosition({
  record: { id: 'compliance-1', values: { cost: 1000 } },
  payments: [
    { id: 'p1', sourceId: 'compliance-1', amount: 250, direction: 'OUT' },
    { id: 'p2', sourceId: 'compliance-1', amount: 100, settlementType: 'Receipt' },
    { id: 'p3', sourceId: 'other', amount: 500, direction: 'OUT' },
    { id: 'p4', sourceId: 'compliance-1', amount: 50, direction: 'OUT', deletedAt: '2026-10-01' },
  ],
})
assert.deepEqual(position, { available: true, cost: 1000, paid: 250, remaining: 750 })

const overpaid = AdminReadModelService.getSourceFinancialPosition({
  record: { id: 'maintenance-1', values: { cost: 100 } },
  payments: [{ sourceId: 'maintenance-1', amount: 125, direction: 'OUT' }],
})
assert.deepEqual(overpaid, { available: true, cost: 100, paid: 125, remaining: -25 }, 'overpayment must remain visible, not be silently clamped')

const invalid = AdminReadModelService.getSourceFinancialPosition({
  record: { id: 'bad', values: { cost: 100 } },
  payments: [{ sourceId: 'bad', amount: 'invalid', direction: 'OUT' }],
})
assert.equal(invalid.available, false, 'malformed payment data must not silently become zero')

const observed = AdminReadModelService.getComplianceRevenueSummary({
  record: { values: { validFrom: '2026-10-30', validUntil: '2026-10-31' } },
  asOf: '2026-10-31T18:29:59.999Z',
  shifts: [
    { shiftEndAt: '2026-10-29T18:30:00.000Z', revenue: 100 },
    { shiftEndAt: '2026-10-30T18:30:00.000Z', revenue: 200 },
    { shiftEndAt: '2026-10-31T18:30:00.000Z', revenue: 300 },
    { shiftEndAt: '2026-11-01T18:30:00.000Z', revenue: 900 },
  ],
})
assert.deepEqual(observed, { total: 500, days: 2, average: 250 }, 'validity summary must use inclusive IST calendar days')

const schedule = AdminReadModelService.getLoanAmortizationSchedule({
  asOf: '2026-10-03T12:00:00+05:30',
  schedule: [
    { id: 'paid', dueDate: '2026-10-01T18:30:00.000Z', originalEmiAmount: 1000, scheduledInterestPaid: 500, scheduledPrincipalPaid: 499.5 },
    { id: 'overdue', dueDate: '2026-10-01T18:30:00.000Z', originalEmiAmount: 1000, scheduledInterestPaid: 0, scheduledPrincipalPaid: 0 },
    { id: 'due', dueDate: '2026-10-02T18:30:00.000Z', originalEmiAmount: 1000, scheduledInterestPaid: 0, scheduledPrincipalPaid: 0 },
    { id: 'upcoming', dueDate: '2026-10-03T18:30:00.000Z', originalEmiAmount: 1000, scheduledInterestPaid: 0, scheduledPrincipalPaid: 0 },
  ],
})
assert.deepEqual(schedule.map(row => row.paymentState), ['Paid', 'Overdue', 'Due', 'Upcoming'])
assert.equal(schedule[0].remainingScheduledAmount, 0.5)

const effectiveTarget = AdminReadModelService.getEffectiveDriverTarget({
  driverId: 'driver-1',
  month: '2026-10',
  records: [
    { id: 'old', values: { driverId: 'driver-1', effectiveFrom: '2026-08-01', desiredDriverProfit: 10000 } },
    { id: 'current', values: { driverId: 'driver-1', effectiveFrom: '2026-09-01', desiredDriverProfit: 12000 } },
    { id: 'other-driver', values: { driverId: 'driver-2', effectiveFrom: '2026-10-01', desiredDriverProfit: 20000 } },
    { id: 'future', values: { driverId: 'driver-1', effectiveFrom: '2026-11-01', desiredDriverProfit: 30000 } },
  ],
})
assert.equal(effectiveTarget.id, 'current', 'target selection must respect driver identity and effective date')

const effectiveRate = AdminReadModelService.getEffectiveMaintenanceRate({
  asOf: '2026-10-30T12:00:00+05:30',
  records: [
    { id: 'old-rate', values: { effectiveFrom: '2026-08-01', maintenanceProvisionPerKm: 1.5 } },
    { id: 'new-rate', values: { effectiveFrom: '2026-10-01', maintenanceProvisionPerKm: 2 } },
    { id: 'future-rate', values: { effectiveFrom: '2026-11-01', maintenanceProvisionPerKm: 3 } },
  ],
})
assert.equal(effectiveRate.id, 'new-rate', 'maintenance rate selection must respect the IST as-of date')

const loanSummary = AdminReadModelService.getLoanFinancialSummary({loan:{principal:100000},position:{actualPaid:2000,actualPrepayment:0,outstandingPrincipal:98000,emi:5000,scheduledDue:2500,totalOverdue:0,provisionBalance:-500}})
assert.equal(loanSummary.provisionBalance, -500, 'Admin loan summary must preserve a negative EMI provision balance')

console.log('Admin read-model projection contract: PASS')
