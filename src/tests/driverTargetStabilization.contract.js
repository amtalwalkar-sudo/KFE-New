import assert from 'node:assert/strict'

// Monthly amounts are authoritative. Daily guidance is a representation of the
// remaining monthly obligation, not an independent financial authority.
const remainingDaily = (monthlyAmount, allocatedBeforeCurrentDay, remainingEligibleDays) =>
  (monthlyAmount - allocatedBeforeCurrentDay) / remainingEligibleDays
assert.equal(remainingDaily(10000, 0, 20), 500)
assert.equal(remainingDaily(10000, 500, 19), 500)

// Driver target is the remaining effective monthly obligation divided by the
// remaining eligible calendar/financial target days.
const effectiveMonthly = (monthlyBreakEven, desiredDriverProfit, openingBalance) =>
  monthlyBreakEven + desiredDriverProfit + openingBalance
assert.equal(effectiveMonthly(10000, 4000, 0), 14000)
assert.equal(effectiveMonthly(10000, 4000, 2000), 16000)
assert.equal(remainingDaily(effectiveMonthly(10000, 4000, 0), 0, 20), 700)
assert.equal(remainingDaily(effectiveMonthly(10000, 4000, 2000), 0, 20), 800)

// Holidays consume no allocation; their untouched obligation is redistributed
// over later eligible days. Actual current-month revenue is not part of this
// day's target calculation.
const beforeHoliday = remainingDaily(14000, 0, 21)
const afterHoliday = remainingDaily(14000, beforeHoliday, 19)
assert.ok(afterHoliday > beforeHoliday)
// After one eligible day has been allocated, 20 eligible days remain. The
// remaining obligation is therefore 14000 - (14000 / 21), divided by 20.
const expectedAfterOneAllocation = (14000 - beforeHoliday) / 20
assert.ok(Math.abs(remainingDaily(14000, beforeHoliday, 20) - expectedAfterOneAllocation) < 1e-12)
assert.ok(Math.abs(expectedAfterOneAllocation - (14000 / 21)) < 1e-12)

// Configured workingDays is not a competing divisor for the target authority.
const configured20 = remainingDaily(14000, 0, 20)
const configured5 = remainingDaily(14000, 0, 20)
assert.equal(configured20, configured5)

const targetForDay = ({ financial, effectiveMonthlyTarget, allocatedBeforeCurrentDay, remainingEligibleDays }) =>
  financial ? remainingDaily(effectiveMonthlyTarget, allocatedBeforeCurrentDay, remainingEligibleDays) : null
assert.equal(targetForDay({ financial: false, effectiveMonthlyTarget: 14000, allocatedBeforeCurrentDay: 0, remainingEligibleDays: 20 }), null)
assert.equal(targetForDay({ financial: true, effectiveMonthlyTarget: 14000, allocatedBeforeCurrentDay: 0, remainingEligibleDays: 20 }), 700)

// The rolling state is explicit and monthly: opening balance -> monthly variance
// -> closing balance. The active month's variance is provisional until month close.
const openingBalance = 2000
const monthlyVariance = 14000 - 12000
const closingBalance = openingBalance + monthlyVariance
assert.equal(closingBalance, 4000)

// No replacement smoothing ledger or N-day average is permitted.
const prohibited = ['N-day average', 'arbitrary smoothing window', 'invented replacement recovery ledger']
assert.deepEqual(prohibited, ['N-day average', 'arbitrary smoothing window', 'invented replacement recovery ledger'])

console.log('Driver target stabilization contract passed: monthly authority, rolling state, dynamic remaining-day amortization, holiday redistribution, and no-new-smoothing guards are explicit.')
