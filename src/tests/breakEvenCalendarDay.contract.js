import assert from 'node:assert/strict'
import { calendarDayProratedMonthlyAmount } from '../domain/performance/authoritativeBreakEven.js'
const emi=3100
assert.equal(calendarDayProratedMonthlyAmount(emi,{from:'2026-01-01',to:'2026-01-31'}),3100)
assert.equal(calendarDayProratedMonthlyAmount(emi,{from:'2026-01-01',to:'2026-01-10'}),1000)
assert.equal(calendarDayProratedMonthlyAmount(3000,{from:'2026-09-15',to:'2026-09-30'}),1600)
assert.equal(calendarDayProratedMonthlyAmount(emi,{from:'2026-02-01',to:'2026-02-28'}),emi,'EMI due date does not control accrual')
assert.equal(calendarDayProratedMonthlyAmount(emi,{from:'2026-02-01',to:'2026-02-14'}),1550)
console.log('Break-even calendar-day fixed-cost contract: PASS')
