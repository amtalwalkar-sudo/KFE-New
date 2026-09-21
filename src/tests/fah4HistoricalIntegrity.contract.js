import assert from 'node:assert/strict'
import { buildPeriodSnapshot, completeIstMonthRange, verifyPeriodSnapshot } from '../domain/finance/periodSnapshot.js'

const baseSnapshot = {
  shifts: [{ id: 's1', shiftEndAt: '2026-08-31T18:00:00+05:30', revenue: 1000 }],
  trips: [{ id: 't1', tripEndAt: '2026-08-31T17:00:00+05:30', revenue: 1000 }],
  fuelLogs: [{ id: 'f1', capturedAt: '2026-08-31T10:00:00+05:30', amount: 200 }],
}
const metrics = { revenue: 1000, fuelCost: 200, monthlyBreakEvenRevenue: 900, calculationEvidence: { breakEven: { status: 'AUTHORITATIVE' } } }
const facts = { facts: [{ id: 'revenue:2026-08', factType: 'REVENUE', basis: 'ACTUAL', amount: 1000 }] }

const build = () => buildPeriodSnapshot({
  periodKey: '2026-08',
  calculationSnapshot: baseSnapshot,
  metrics,
  financialFacts: facts,
  closedAt: new Date('2026-09-01T00:30:00+05:30'),
})

const first = await build()
assert.equal(first.status, 'CLOSED')
assert.equal(first.periodRange.from, completeIstMonthRange('2026-08').from.toISOString())
assert.equal(first.periodRange.to, completeIstMonthRange('2026-08').to.toISOString())
assert.equal(first.evidenceBoundary.asOf, first.periodRange.to)
assert.equal(first.evidenceBoundary.sourceRecordIds.trips[0], 't1')

const verified = await verifyPeriodSnapshot(first)
assert.equal(verified.valid, true)

const laterMutation = structuredClone(first)
laterMutation.calculationSnapshot.trips.push({ id: 't2', tripEndAt: '2026-09-01T10:00:00+05:30', revenue: 500 })
assert.equal((await verifyPeriodSnapshot(laterMutation)).valid, false)

const tampered = structuredClone(first)
tampered.metrics.revenue = 9999
assert.equal((await verifyPeriodSnapshot(tampered)).reason, 'INTEGRITY_HASH_MISMATCH')

const futureBoundary = structuredClone(first)
futureBoundary.evidenceBoundary.asOf = '2026-08-31T18:00:00+05:30'
assert.equal((await verifyPeriodSnapshot(futureBoundary)).reason, 'INVALID_EVIDENCE_BOUNDARY')

await assert.rejects(
  () => buildPeriodSnapshot({ periodKey: '2026-08', calculationSnapshot: baseSnapshot, metrics, financialFacts: facts, closedAt: new Date('2026-08-31T23:00:00+05:30') }),
  /cannot be closed before/
)

console.log('FAH-4 historical integrity contracts: PASS')
