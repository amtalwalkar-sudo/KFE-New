import { describe, expect, it } from 'vitest'
import { RevenueReconciliationService } from '../revenueReconciliationService.js'

describe('RevenueReconciliationService', () => {
  it('keeps shift-end revenue authoritative and reports unallocated trip detail', () => {
    const result = RevenueReconciliationService.reconcileShiftRevenue({
      shiftRevenue: 2500,
      trips: [
        { status: 'COMPLETED', uberRevenue: 500 },
        { status: 'COMPLETED', uberRevenue: 500 }
      ]
    })
    expect(result.authoritativeShiftRevenue).toBe(2500)
    expect(result.tripRevenue).toBe(1000)
    expect(result.unallocatedRevenue).toBe(1500)
    expect(result.revenueStatus).toBe('UNALLOCATED_SHIFT_REVENUE')
    expect(result.tripRevenueIsDetailOnly).toBe(true)
  })

  it('does not silently replace the shift total with trip detail', () => {
    const result = RevenueReconciliationService.reconcileShiftRevenue({
      shiftRevenue: 2500,
      trips: [{ status: 'COMPLETED', uberRevenue: 2500 }]
    })
    expect(result.authoritativeShiftRevenue).toBe(2500)
    expect(result.tripRevenue).toBe(2500)
    expect(result.unallocatedRevenue).toBe(0)
    expect(result.revenueStatus).toBe('RECONCILED')
  })

  it('rejects invalid authoritative shift revenue', () => {
    expect(() => RevenueReconciliationService.reconcileShiftRevenue({ shiftRevenue: -1, trips: [] })).toThrow()
  })
})
