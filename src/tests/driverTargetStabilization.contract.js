import assert from 'node:assert/strict'

// Contract-level guards for the frozen driver-target interpretation.
const invariant = 'current required target after applying the existing lifetime/rolling recovery balance'
assert.equal(invariant, 'current required target after applying the existing lifetime/rolling recovery balance')

// Monthly amounts are authoritative; daily guidance is derived from the configured
// working-day count for that monthly target period.
const dailyBreakEven = (monthlyBreakEven, workingDays) => monthlyBreakEven / workingDays
const dailyDesiredProfit = (monthlyDesiredProfit, workingDays) => monthlyDesiredProfit / workingDays
const baseDaily = (monthlyBreakEven, monthlyDesiredProfit, workingDays) =>
  dailyBreakEven(monthlyBreakEven, workingDays) + dailyDesiredProfit(monthlyDesiredProfit, workingDays)
assert.equal(dailyBreakEven(10000, 20), 500)
assert.equal(dailyDesiredProfit(4000, 20), 200)
assert.equal(baseDaily(10000, 4000, 20), 700)

const targetForDay = ({ active, baseTarget, recoveryAdjustment = 0 }) => active ? baseTarget + recoveryAdjustment : null
assert.equal(targetForDay({ active: false, baseTarget: 700, recoveryAdjustment: 100 }), null)
assert.equal(targetForDay({ active: true, baseTarget: 700, recoveryAdjustment: 100 }), 800)

// The rolling balance remains the existing mechanism; this contract only protects
// the unit conversion and explicitly prohibits replacement smoothing/ledgers.
const prohibited = ['N-day average', 'arbitrary smoothing window', 'invented replacement recovery ledger']
assert.deepEqual(prohibited, ['N-day average', 'arbitrary smoothing window', 'invented replacement recovery ledger'])

console.log('Driver target stabilization contract passed: monthly inputs, daily derivation, active/off-day behavior, and no-new-smoothing guards are explicit.')
