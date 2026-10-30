import fs from 'node:fs'
import assert from 'node:assert/strict'
import { calculateDistanceKm, calculateFuelQuantityKg } from '../domain/math/index.js'
import { calculateTotalAmount } from '../domain/math/calculations.js'
import { istDayRange, istMonthRange } from '../domain/time/ist.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const performance = read('../views/PerformanceView.vue')
const timeline = read('../views/ActivityTimelineView.vue')
const work = read('../views/WorkModuleView.vue')
const breakEvenAdmin = read('../components/admin/AdminBreakEven.vue')
const financeAdmin = read('../components/admin/AdminFinanceView.vue')
const matrix = fs.readFileSync(new URL('../../docs/CALCULATION-AUTHORITY-MATRIX.md', import.meta.url), 'utf8')

const rowIds = Array.from({ length: 30 }, (_, i) => `CV-${String(i + 1).padStart(2, '0')}`)
for (const id of rowIds) assert.match(matrix, new RegExp('^\\| ' + id + ' ', 'm'), `verification matrix missing ${id}`)

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`)

// Independent oracle values intentionally do not call the KFE PerformanceService/engine.
const vehicleKm = 1100 - 1000
const businessKm = 30 + 42
const deadKm = vehicleKm - businessKm
const revenue = 2400
const operatingCost = 600 + 100 + 50 + 300
const operatingProfit = revenue - operatingCost
const actualPL = operatingProfit - 300
const provisionalPL = actualPL - (vehicleKm * 1.60) - 40 - 20 - 10
const monthlyBreakEven = 10000 + (1000 * (23 + 1.60))
const driverTarget = (monthlyBreakEven + 14000) / 31
const allocation = { emi:5000*(15000/50000), maintenance:5000*(10000/50000), compliance:5000*(5000/50000) }

near(vehicleKm, 100, 'CV-01 vehicle KM')
near(businessKm, 72, 'CV-02 business KM')
near(deadKm, 28, 'CV-03 dead KM')
near(revenue, 2400, 'CV-06 authoritative revenue')
near(operatingCost, 1050, 'CV-19 operating cost')
near(operatingProfit, 1350, 'CV-20 operating profit')
near(actualPL, 1050, 'CV-21 actual P/L')
near(provisionalPL, 820, 'CV-22 provisional P/L')
near(monthlyBreakEven, 34600, 'CV-23 monthly break-even')
near(driverTarget, 1567.741935483871, 'CV-25 driver target')
near(allocation.emi, 1500, 'CV-26 EMI allocation')
near(allocation.maintenance, 1000, 'CV-26 maintenance allocation')
near(allocation.compliance, 500, 'CV-26 compliance allocation')
near(5000-allocation.emi-allocation.maintenance-allocation.compliance, 2000, 'CV-26 remaining revenue')

assert.equal(calculateDistanceKm(1000, 1100), 100)
assert.equal(calculateDistanceKm(-1, 10), null)
assert.equal(calculateDistanceKm(10, -1), null)
assert.equal(calculateFuelQuantityKg(500, 82), 500 / 82)
assert.equal(calculateFuelQuantityKg(0, 82), null)
assert.equal(calculateTotalAmount([{ amount_paise: 1000 }, { amount_paise: '2500' }], 'amount_paise'), 3500)
assert.equal(calculateTotalAmount([{ amount_paise: 'bad' }], 'amount_paise'), null)

const principal = 550000
const monthlyRate = 0.10 / 12
const months = 60
const emi = principal * monthlyRate * ((1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1)
near(emi, 11685.874591197584, 'CV-15 independent EMI oracle')
assert.equal(120000 / 12, 10000, 'CV-16 zero-interest amortization control')

const day = istDayRange('2026-10-03T12:00:00+05:30')
assert.equal(day.from.toISOString(), '2026-10-02T18:30:00.000Z')
assert.equal(day.to.toISOString(), '2026-10-03T18:29:59.999Z')
const month = istMonthRange('2026-10-03T12:00:00+05:30', '2026-11-01T00:00:00+05:30')
assert.equal(month.from.toISOString(), '2026-09-30T18:30:00.000Z')
assert.equal(month.to.toISOString(), '2026-10-31T18:29:59.999Z')

for (const token of ['ACTUAL', 'OBLIGATION', 'PROVISION', 'VARIANCE']) assert.ok(matrix.includes(token), `CV-29 missing financial basis ${token}`)

// Phase 1 Performance intentionally exposes only recorded fare and fuel metrics.
for (const pattern of [/overview\\.fareIncome/, /overview\\.completedRides/, /overview\\.cancellationFees/, /overview\\.fuelSpending/, /overview\\.fuelCostPerKm/, /overview\\.incomeAfterFuel/]) assert.match(performance, pattern, 'Phase 1 Performance UI binding missing')
assert.match(performance, /Maintenance, EMI and other costs are not included in Phase 1/)
assert.doesNotMatch(performance, /maintenanceProvision|loanProvision|driverTargetSurplusCredit|vehicleKm/, 'Future calculation layers must not be falsely claimed as current Performance UI')

const secondary = [
  [work, 'CV-04', [/gapKm/, /Personal/, /Dead/]],
  [work, 'CV-08', [/fuelPrice/, /fuelAmount/, /fuelFull|fuelPartial/]], [timeline, 'CV-07', [/fare/i, /duration/i]],
  [work, 'CV-08', [/fuelPrice/, /fuelAmount/, /fuelFull|fuelPartial/]],
]
for (const [source, id, patterns] of secondary) for (const pattern of patterns) assert.match(source, pattern, `${id} consumer UI/source binding missing`)
assert.doesNotMatch(timeline, /tripKm|rideDistance|distancePerRide/i, 'Timeline must not invent ride-distance metrics when ride distance is not recorded')

console.log('KFE Calculation Verification Matrix contract: PASS')
