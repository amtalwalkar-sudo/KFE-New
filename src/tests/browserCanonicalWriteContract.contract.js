import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertBrowserCanonicalWriteAllowed } from '../infrastructure/work/browserCanonicalWork.js'

const base = { id: 'shift-1', status: 'ACTIVE', revenue: 0, updatedAt: '2026-10-20T10:00:00.000Z' }
const same = { ...base }
const newer = { ...base, revenue: 20, updatedAt: '2026-10-20T10:01:00.000Z' }

assert.equal(assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: null, record: base, expectAbsent: true }), base)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: base, record: newer, expectAbsent: true }), /Canonical create conflict/)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: base, record: newer, expectedUpdatedAt: '2026-10-20T09:59:00.000Z' }), /expected version changed/)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: null, record: newer, expectedUpdatedAt: base.updatedAt }), /expected record is missing/)
assert.equal(assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: base, record: same, expectedUpdatedAt: base.updatedAt }), same)
assert.equal(assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: base, record: newer, expectedUpdatedAt: base.updatedAt }), newer)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: newer, record: base }), /Stale canonical write rejected/)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: base, record: { ...base, revenue: 1 } }), /different payloads share updatedAt/)
assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: { id: 'shift-1', status: 'ACTIVE' }, record: { id: 'shift-1', status: 'ACTIVE', revenue: 1 } }), /updatedAt is required/)

// Match native's narrowly-scoped ACTIVE -> COMPLETED reconciliation: preserve the
// canonical fare projection and advance beyond the projection's version.
{
  const canonical = { ...base, revenue: 25, liveFareRevenue: 25, revenueSource: 'TRIP_FARES' }
  const completed = { ...base, status: 'COMPLETED', updatedAt: '2026-10-20T09:59:00.000Z', revenue: 0, liveFareRevenue: 0, revenueSource: 'MANUAL' }
  const reconciled = assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: canonical, record: completed })
  assert.equal(reconciled.status, 'COMPLETED')
  assert.equal(reconciled.revenue, 25)
  assert.equal(reconciled.liveFareRevenue, 25)
  assert.equal(reconciled.revenueSource, 'TRIP_FARES')
  assert.equal(Date.parse(reconciled.updatedAt), Date.parse(canonical.updatedAt) + 1)
}
// Match native's same-version active-shift projection collision exception only when
// every other business field is identical.
{
  const canonical = { ...base, revenue: 25, liveFareRevenue: 25, revenueSource: 'TRIP_FARES' }
  const incoming = { ...base, revenue: 0, liveFareRevenue: 0, revenueSource: 'MANUAL' }
  const reconciled = assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: canonical, record: incoming })
  assert.equal(reconciled.revenue, 25)
  assert.equal(reconciled.liveFareRevenue, 25)
  assert.equal(reconciled.revenueSource, 'TRIP_FARES')
  assert.equal(Date.parse(reconciled.updatedAt), Date.parse(canonical.updatedAt) + 1)
  assert.throws(() => assertBrowserCanonicalWriteAllowed({ entityType: 'SHIFT', existingRecord: canonical, record: { ...incoming, startOdometer: 999 } }), /different payloads share updatedAt/)
}

// The concurrency read and compare-and-set must occur in the same read-write
// IndexedDB transaction, not in a preceding readonly request.
const source = fs.readFileSync(new URL('../infrastructure/work/browserCanonicalWork.js', import.meta.url), 'utf8')
assert.match(source, /db\.transaction\(stores, 'readwrite'\)/)
assert.match(source, /const currentRequest = records\.get\(entityId\)/)
assert.match(source, /currentRequest\.onsuccess = \(\) => \{[\s\S]*?assertBrowserCanonicalWriteAllowed\(/)
assert.match(source, /expectedUpdatedAt = null, expectAbsent = false/)
assert.match(source, /refreshBrowserShiftRevenueProjection/)
assert.match(source, /operations\.add\(operationRecord/)
assert.match(source, /audit\.add\(/)
console.log('Browser canonical write contract: PASS')
