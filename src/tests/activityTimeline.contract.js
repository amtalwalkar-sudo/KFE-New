import assert from 'node:assert/strict'
import { eligibleRevenue, pickupDurationMs, rideDurationMs, validFullTankIntervals } from '../application/timeline/activityTimelineService.js'

const iso = value => new Date(value).toISOString()
const completed = {
  id:'completed', status:'COMPLETED', createdAt:iso('2026-10-23T03:00:00Z'),
  tripStartAt:iso('2026-10-23T03:20:00Z'), tripEndAt:iso('2026-10-23T04:20:00Z'),
  revenue:600, fareDetailsSkipped:false,
}
assert.equal(pickupDurationMs(completed),20*60*1000,'pickup travel ends when passenger ride starts')
assert.equal(rideDurationMs(completed),60*60*1000,'completed ride hours exclude pickup travel')
assert.equal(eligibleRevenue(completed),600,'completed fare contributes to hourly revenue')

const cancelledBeforePickup = {
  id:'cancelled-before-pickup',status:'CANCELLED',createdAt:iso('2026-10-23T05:00:00Z'),
  tripStartAt:null,tripEndAt:iso('2026-10-23T05:15:00Z'),cancelledRevenue:75,
}
assert.equal(pickupDurationMs(cancelledBeforePickup),15*60*1000,'pre-pickup cancellation time counts as pickup travel')
assert.equal(rideDurationMs(cancelledBeforePickup),15*60*1000,'pre-pickup cancellation has a valid consumed-time duration')
assert.equal(eligibleRevenue(cancelledBeforePickup),75,'cancellation fee contributes to hourly revenue')

const skippedFare={...completed,id:'skipped',fareDetailsSkipped:true,revenue:999}
assert.equal(eligibleRevenue(skippedFare),0,'skipped fare remains zero for reporting')
assert.equal(pickupDurationMs({...completed,tripStartAt:null}),null,'missing pickup arrival time is not estimated')
assert.equal(rideDurationMs({...completed,tripEndAt:null}),null,'missing end timestamp is not estimated')
assert.equal(eligibleRevenue({...cancelledBeforePickup,cancelledRevenue:''}),0,'blank cancellation fee remains zero')

const logs=[
 {id:'full-a',vehicleId:'vehicle-1',capturedAt:iso('2026-10-01T00:00:00Z'),odometer:1000,amount:500,quantityKg:10,isFullTank:true},
 {id:'partial',vehicleId:'vehicle-1',capturedAt:iso('2026-10-02T00:00:00Z'),odometer:1100,amount:200,quantityKg:4,isFullTank:false},
 {id:'full-b',vehicleId:'vehicle-1',capturedAt:iso('2026-10-03T00:00:00Z'),odometer:1200,amount:600,quantityKg:12,isFullTank:true},
 {id:'full-other-vehicle',vehicleId:'vehicle-2',capturedAt:iso('2026-10-03T00:00:00Z'),odometer:50,amount:100,quantityKg:2,isFullTank:true},
]
const intervals=validFullTankIntervals(logs)
assert.equal(intervals.length,1,'only consecutive full-tank readings for the same vehicle form an interval')
assert.equal(intervals[0].km,200,'full-tank interval uses odometer difference, not partial-fill distance')
assert.equal(intervals[0].cost,600,'interval cost uses the ending full-tank entry')
assert.equal(intervals[0].mileageKmPerKg,200/12,'mileage uses interval distance divided by CNG kilograms')
assert.equal(intervals[0].costPerKm,3,'cost per km uses interval cost divided by interval distance')

console.log('Activity timeline pickup, cancellation, skipped-fare and full/partial fuel contracts passed.')
