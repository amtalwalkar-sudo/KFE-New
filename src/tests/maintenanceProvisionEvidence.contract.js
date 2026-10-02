import assert from 'node:assert/strict'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
const range={from:new Date('2026-09-10T00:00:00Z'),to:new Date('2026-09-10T23:59:59Z')}
const shifts=[
 {id:'old',shiftStartAt:'2026-09-05T08:00:00Z',shiftEndAt:'2026-09-05T18:00:00Z',startOdometer:900,endOdometer:1000},
 {id:'today',shiftStartAt:'2026-09-10T08:00:00Z',shiftEndAt:'2026-09-10T18:00:00Z',startOdometer:1000,endOdometer:1100},
]
const base={shifts,trips:[],fuelLogs:[],maintenance:[],compliance:[],settlements:[{id:'pay1',sourceType:'Maintenance',direction:'OUT',amount:50,paidOn:'2026-09-08T12:00:00Z'}]}
const missing=derivePerformance({...base,breakEvenInputs:[]},range)
assert.ok(Number.isNaN(missing.maintenanceProvision),'Missing maintenance rate must not become zero')
assert.ok(Number.isNaN(missing.maintenanceProvisionAccumulated),'Missing historical rate must invalidate accumulated balance')
assert.ok(Number.isNaN(missing.maintenanceProvisionBalance),'Missing rate must invalidate bucket balance')
assert.equal(missing.maintenanceProvisionEvidenceStatus,'UNAVAILABLE')
const valid=derivePerformance({...base,breakEvenInputs:[{effectiveFrom:'2026-09-01',maintenanceProvisionPerKm:2,active:true}]},range)
assert.equal(valid.maintenanceProvision,200)
assert.equal(valid.maintenanceProvisionAccumulated,400)
assert.equal(valid.maintenancePayments,0,'A prior payment is not charged to the selected-day payment flow')
assert.equal(valid.maintenancePaymentsAccumulated,50)
assert.equal(valid.maintenanceProvisionBalance,350,'Accumulated provision less accumulated payment')
assert.equal(valid.maintenanceProvisionEvidenceStatus,'AUTHORITATIVE')
const explicitZero=derivePerformance({...base,breakEvenInputs:[{effectiveFrom:'2026-09-01',maintenanceProvisionPerKm:0,active:true}]},range)
assert.equal(explicitZero.maintenanceProvision,0)
assert.equal(explicitZero.maintenanceProvisionEvidenceStatus,'AUTHORITATIVE','An explicit zero rate is different from a missing rate')
console.log('Maintenance provision evidence and balance contract: PASS')
