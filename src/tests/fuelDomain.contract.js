import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calculateFuelQuantityKg, calculateFuelPeriodSummary } from '../domain/math/fuel.js'

assert.equal(calculateFuelQuantityKg(500, 100), 5)
assert.equal(calculateFuelQuantityKg(0, 100), null)
assert.equal(calculateFuelQuantityKg(500, 0), null)
assert.equal(calculateFuelQuantityKg('invalid', 100), null)

const logs = [
  { id: 'baseline', vehicleId: 'v1', odometer: 1000, amount: 300, isFullTank: true, capturedAt: '2026-10-26T08:00:00+05:30' },
  { id: 'partial', vehicleId: 'v1', odometer: 1050, amount: 100, isFullTank: false, capturedAt: '2026-10-27T08:00:00+05:30' },
  { id: 'full-a', vehicleId: 'v1', odometer: 1100, amount: 300, isFullTank: true, capturedAt: '2026-10-27T09:00:00+05:30' },
  { id: 'full-b', vehicleId: 'v1', odometer: 1300, amount: 800, isFullTank: true, capturedAt: '2026-10-28T09:00:00+05:30' },
]
const range = { from: new Date('2026-10-27T00:00:00+05:30'), to: new Date('2026-10-28T23:59:59.999+05:30') }
const summary = calculateFuelPeriodSummary(logs, range)
assert.equal(summary.totalFuelAmount, 1200, 'partial and full refills both count toward period fuel spending')
assert.equal(summary.intervalCount, 2, 'only consecutive full-tank readings create mileage intervals')
assert.equal(summary.intervalKm, 300)
assert.ok(Math.abs(summary.averageCostPerKm - (1100 / 300)) < 1e-9, 'period cost/km is total full-tank interval cost divided by interval kilometres')
const partialOnly = calculateFuelPeriodSummary(logs.slice(0, 2), range)
assert.equal(partialOnly.totalFuelAmount, 100)
assert.equal(partialOnly.intervalCount, 0)
assert.equal(partialOnly.averageCostPerKm, null, 'a partial refill never creates a mileage interval')

const crossVehicle = calculateFuelPeriodSummary([
  { id: 'v1-before', vehicleId: 'v1', odometer: 1000, amount: 300, isFullTank: true, capturedAt: '2026-10-26T08:00:00+05:30' },
  { id: 'v2-after', vehicleId: 'v2', odometer: 1100, amount: 300, isFullTank: true, capturedAt: '2026-10-27T09:00:00+05:30' },
], range)
assert.equal(crossVehicle.intervalCount, 0, 'full-tank readings from different vehicles must never form an interval')
assert.equal(crossVehicle.averageCostPerKm, null)

const noVehicle = calculateFuelPeriodSummary([
  { id: 'no-vehicle-a', odometer: 1000, amount: 300, isFullTank: true, capturedAt: '2026-10-26T08:00:00+05:30' },
  { id: 'no-vehicle-b', odometer: 1100, amount: 300, isFullTank: true, capturedAt: '2026-10-27T09:00:00+05:30' },
], range)
assert.equal(noVehicle.intervalCount, 0, 'unassigned vehicle records cannot create an authoritative interval')

const workService = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
const fuelStore = fs.readFileSync(new URL('../stores/fuel.js', import.meta.url), 'utf8')
const fuelDomain = fs.readFileSync(new URL('../domain/math/fuel.js', import.meta.url), 'utf8')
assert.doesNotMatch(workService, /calculateRollingFuelCostPerKm|calculateFuelMetrics|getFuelMetrics/)
assert.doesNotMatch(fuelStore, /metrics|calculateFuelMetrics|rollingCostPerKm/)
assert.doesNotMatch(fuelDomain, /rollingCostPerKm|averageMileageKmPerKg|latestMileageKm/)
console.log('Fuel domain contract: PASS — only saved fuel quantity and full-tank period cost/km calculations remain.')
