import assert from 'node:assert/strict'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { calculateEmi, deriveLoanPosition } from '../domain/finance/loanEngine.js'
import { authoritativeShiftRevenue } from '../domain/performance/authoritativeRevenue.js'

const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }

// Golden vector: dead KM is exactly vehicle KM minus business KM; it is not clamped.
{
  const metrics = derivePerformance({
    shifts: [{ shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1100, revenue:1000 }],
    trips: [{ status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T10:00:00Z', tripKm:130, revenue:9999 }],
    fuelLogs: [], maintenance: [], compliance: [],
  }, range)
  assert.equal(metrics.vehicleKm, 100)
  assert.equal(metrics.businessKm, 130)
  assert.equal(metrics.deadKm, -30)
}

// Golden vector: shift-end revenue is authoritative; trip revenue is supporting detail only.
{
  const shifts = [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', revenue:1250.55 }]
  const trips = [{ status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T10:00:00Z', revenue:999999 }]
  assert.equal(authoritativeShiftRevenue(shifts, range), 1250.55)
  const metrics = derivePerformance({ shifts, trips, fuelLogs:[], maintenance:[], compliance:[] }, range)
  assert.equal(metrics.revenue, 1250.55)
}

// Golden vector: monetary loan state is accumulated in integer paise.
// ₹1,000.01 at 0% over 3 months must allocate 333.34 + 333.34 + 333.33 exactly.
{
  const loan = { id:'paise-loan', principal:1000.01, tenureMonths:3, startDate:'2026-01-01', annualInterestRatePercent:0, status:'Active' }
  const position = deriveLoanPosition({ loan, asOf:'2026-04-01' })
  assert.deepEqual(position.schedule.map(row => row.originalPrincipalComponent), [333.34,333.34,333.33])
  assert.equal(position.scheduledPrincipal, 1000.01)
  assert.equal(position.outstandingPrincipal, 0)
  assert.equal(calculateEmi(1000.01, 3, 0), 333.34)
}

// Boundary vector: KFE counts IST calendar dates, including leap-day.
{
  const leapLoan = { id:'leap-loan', principal:100000, tenureMonths:12, startDate:'2028-01-31', annualInterestRatePercent:36.5, status:'Active' }
  const leap = deriveLoanPosition({ loan: leapLoan, asOf:'2028-02-29T23:59:59+05:30' })
  assert.equal(leap.schedule[0].dueDate.slice(0,10), '2028-02-29')
  assert.equal(leap.schedule[0].originalInterestComponent, 2900)
  assert.equal(leap.overdue.length, 0)

  const nonLeapLoan = { ...leapLoan, id:'non-leap-loan', startDate:'2027-01-31' }
  const nonLeap = deriveLoanPosition({ loan: nonLeapLoan, asOf:'2027-02-28T23:59:59+05:30' })
  assert.equal(nonLeap.schedule[0].dueDate.slice(0,10), '2027-02-28')
  assert.equal(nonLeap.schedule[0].originalInterestComponent, 2800)
}

// As-of boundary: future loan payments must not change a historical loan position.\n{\n  const loan = { id:'as-of-loan', principal:12000, tenureMonths:12, startDate:'2026-01-01', annualInterestRatePercent:12, status:'Active' }\n  const historical = deriveLoanPosition({ loan, payments:[{ id:'future-payment', loanId:loan.id, amount:1000, paidOn:'2026-03-01', status:'PAID' }], asOf:'2026-02-01' })\n  const clean = deriveLoanPosition({ loan, payments:[], asOf:'2026-02-01' })\n  assert.equal(historical.actualPaid, clean.actualPaid)\n  assert.equal(historical.outstandingPrincipal, clean.outstandingPrincipal)\n}\n\n// Boundary vector: one IST calendar day of overdue interest is counted from the due date to next calendar date.
{
  const loan = { id:'overdue-leap', principal:100000, tenureMonths:12, startDate:'2028-01-31', annualInterestRatePercent:36.5, status:'Active' }
  const position = deriveLoanPosition({ loan, asOf:'2028-03-01T23:59:59+05:30' })
  assert.equal(position.overdue[0].overdueDays, 1)
  assert.equal(position.overdue[0].additionalOverdueInterest, 3)
}

console.log('Formula hardening contract: PASS')
