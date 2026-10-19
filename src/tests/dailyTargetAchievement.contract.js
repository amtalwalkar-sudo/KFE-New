import assert from 'node:assert/strict'
import { deriveDailyTargetAchievement } from '../domain/performance/dailyTargetAchievement.js'

const range = {
  from: new Date('2026-10-01T00:00:00+05:30'),
  to: new Date('2026-10-01T23:59:59+05:30'),
}
const asOf = new Date('2026-10-01T18:00:00+05:30')
const shifts = [
  { id: 'active', status: 'ACTIVE', shiftStartAt: '2026-10-01T08:00:00+05:30', shiftEndAt: null },
  { id: 'overnight', status: 'ACTIVE', shiftStartAt: '2026-09-30T22:00:00+05:30', shiftEndAt: null },
  { id: 'closed', status: 'COMPLETED', shiftStartAt: '2026-10-01T08:00:00+05:30', shiftEndAt: '2026-10-01T17:00:00+05:30', revenue: 500 },
]
const trips = [
  { id: 'fare-entered', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T09:00:00+05:30', revenue: 120, fareDetailsSkipped: false },
  { id: 'zero-fare-entered', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T10:00:00+05:30', revenue: 0, fareDetailsSkipped: false },
  { id: 'skipped-fare', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T11:00:00+05:30', revenue: null, fareDetailsSkipped: true },
  { id: 'stale-fare-skipped', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T12:00:00+05:30', revenue: 90, fareDetailsSkipped: true },
  { id: 'not-yet-completed', shiftId: 'active', status: 'ACTIVE', tripEndAt: null, revenue: 1000, fareDetailsSkipped: false },
  { id: 'yesterday', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-09-30T23:59:00+05:30', revenue: 400, fareDetailsSkipped: false },
  { id: 'future', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T19:00:00+05:30', revenue: 700, fareDetailsSkipped: false },
  { id: 'overnight-fare', shiftId: 'overnight', status: 'COMPLETED', tripEndAt: '2026-10-01T13:00:00+05:30', revenue: 80, fareDetailsSkipped: false },
  { id: 'closed-shift-detail', shiftId: 'closed', status: 'COMPLETED', tripEndAt: '2026-10-01T14:00:00+05:30', revenue: 9999, fareDetailsSkipped: false },
  { id: 'active-cancel-fee', shiftId: 'active', status: 'CANCELLED', tripEndAt: '2026-10-01T15:30:00+05:30', revenue: 25, cancelledRevenue: 25 },
  { id: 'blank-cancel-fee', shiftId: 'active', status: 'CANCELLED', tripEndAt: '2026-10-01T15:45:00+05:30', revenue: 0, cancelledRevenue: 0 },
  { id: 'deleted', shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T15:00:00+05:30', revenue: 600, fareDetailsSkipped: false, deleted: true },
]

assert.equal(deriveDailyTargetAchievement({
  shifts, trips, range, asOf, completedShiftRevenue: 500,
}), 725, 'completed Shift projection plus eligible active-shift fares and cancellation fees; blank fees contribute zero')

assert.equal(deriveDailyTargetAchievement({
  shifts: [{ id: 'active', status: 'ACTIVE', shiftStartAt: '2026-10-01T08:00:00+05:30' }],
  trips: [
    { shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T09:00:00+05:30', revenue: 120, fareDetailsSkipped: false },
    { shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T10:00:00+05:30', revenue: null, fareDetailsSkipped: true },
    { shiftId: 'active', status: 'CANCELLED', tripEndAt: '2026-10-01T10:30:00+05:30', cancelledRevenue: 15 },
  ],
  range, asOf, completedShiftRevenue: 0,
}), 135, 'skipped fare contributes zero while a recorded cancellation fee contributes once')

assert.equal(deriveDailyTargetAchievement({
  shifts: [{ id: 'closed', status: 'COMPLETED', shiftEndAt: '2026-10-01T17:00:00+05:30' }],
  trips: [{ shiftId: 'closed', status: 'COMPLETED', tripEndAt: '2026-10-01T16:00:00+05:30', revenue: 9999 }],
  range, asOf, completedShiftRevenue: 500,
}), 500, 'do not double count per-trip fares for a closed shift')

assert.equal(deriveDailyTargetAchievement({
  shifts: [{ id: 'active', status: 'ACTIVE', shiftStartAt: '2026-10-01T08:00:00+05:30' }],
  trips: [{ shiftId: 'active', status: 'COMPLETED', tripEndAt: '2026-10-01T09:00:00+05:30', revenue: 100, fareDetailsSkipped: false }],
  range, asOf: new Date('2026-10-01T08:30:00+05:30'), completedShiftRevenue: 25,
}), 25, 'future trip completions cannot increase progress')

console.log('Daily target achievement: PASS — eligible recorded fares and cancellation fees feed the persisted Shift projection; skipped fares contribute zero; closed shifts are never double-counted.')
