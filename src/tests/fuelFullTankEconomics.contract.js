import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculateRollingFuelCostPerKm } from '../domain/math/fuel.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'

const fuel = (id, odometer, amount, isFullTank, day, quantityKg = 0, vehicleId) => ({
  id, odometer, amount, isFullTank, quantityKg, capturedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  ...(vehicleId ? { vehicleId } : {}),
})

const records = [
  fuel('baseline', 1000, 500, true, 1, 6),
  fuel('partial-1', 1050, 400, false, 2, 5),
  fuel('full-1', 1100, 500, true, 3, 6),
  fuel('partial-2', 1150, 300, false, 4, 3),
  fuel('full-2', 1400, 700, true, 5, 8),
]
const result = calculateRollingFuelCostPerKm(records)
assert.equal(result.completedIntervals, 2, 'only consecutive full-tank anchors define intervals')
assert.deepEqual(result.intervals.map(x => x.km), [100, 300])
assert.deepEqual(result.intervals.map(x => x.cost), [900, 1000], 'partial-fill costs must be included in the next full-to-full interval')
assert.deepEqual(result.intervals.map(x => x.quantityKg), [11, 11])
assert.ok(Math.abs(result.intervals[0].costPerKm - 9) < 1e-9)
assert.ok(Math.abs(result.intervals[1].costPerKm - (1000 / 300)) < 1e-9)
assert.ok(Math.abs(result.rollingCostPerKm - ((9 + (1000 / 300)) / 2)) < 1e-9)
assert.ok(Math.abs(result.averageCostPerKm - (1900 / 400)) < 1e-9, 'weighted average is total interval spend / total interval KM')
assert.equal(result.totalIntervalKm, 400)
assert.equal(result.totalIntervalCost, 1900)
assert.equal(result.baselineFullTank.id, 'baseline')
assert.equal(result.latestFullTank.id, 'full-2')

// Old single-vehicle canonical logs do not have vehicleId; they still qualify.
assert.equal(Number.isFinite(result.averageCostPerKm), true)

// Explicitly different vehicles must not create a cross-vehicle interval.
const mixedVehicles = [
  fuel('a1', 1000, 500, true, 1, 6, 'vehicle-a'),
  fuel('b1', 5000, 700, true, 2, 8, 'vehicle-b'),
  fuel('a2', 1100, 900, true, 3, 11, 'vehicle-a'),
]
const separated = calculateRollingFuelCostPerKm(mixedVehicles)
assert.equal(separated.completedIntervals, 1)
assert.equal(separated.intervals[0].vehicleId, 'vehicle-a')
assert.equal(separated.intervals[0].km, 100)
assert.equal(separated.intervals[0].cost, 900)

// Partial fills never become boundaries and incomplete intervals stay unavailable.
assert.equal(Number.isNaN(calculateRollingFuelCostPerKm([records[0], records[1]]).averageCostPerKm), true)
assert.equal(calculateRollingFuelCostPerKm([records[0], fuel('bad', 999, 200, true, 2, 2)]).completedIntervals, 0)

// The performance read model exposes both rolling and weighted-average rates.
const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') }
const metrics = derivePerformance({ shifts: [], trips: [], fuelLogs: records, maintenance: [], compliance: [], loans: [], settlements: [] }, range)
assert.ok(Math.abs(metrics.fullTankFuelCostPerKm - result.rollingCostPerKm) < 1e-9)
assert.ok(Math.abs(metrics.averageFuelCostPerKm - result.averageCostPerKm) < 1e-9)
assert.equal(metrics.fuelCostPerKmIntervals, 2)
assert.equal(metrics.fuelCostPerKmIntervalKm, 400)
assert.equal(metrics.fuelCostPerKmIntervalCost, 1900)

// Keep the form compact, hide contextual clutter during refuelling, and theme the quantity readout.
const work = await readFile(new URL('../views/WorkModuleView.vue', import.meta.url), 'utf8')
const form = await readFile(new URL('../components/work/WorkContextForm.vue', import.meta.url), 'utf8')
assert.match(work, /!pendingFare && !fuelOpen && \(store\.isOnline \|\| cancelOpen \|\| endOpen\)/)
assert.match(work, /!store\.isOnline && !fuelOpen/)
assert.doesNotMatch(form, /<span class="eyebrow">FUEL<\/span><strong>CNG REFUEL<\/strong>/)
assert.match(form, /\.form-fuel \.form-card\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
assert.match(form, /\.form-fuel \.calculated-value strong\{[^}]*var\(--kfe-info\)/)

console.log('Fuel full-tank economics and viewport contract: PASS')
