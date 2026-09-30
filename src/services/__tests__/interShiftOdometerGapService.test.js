import { describe, expect, it } from 'vitest'
import { InterShiftOdometerGapService } from '../interShiftOdometerGapService.js'

describe('InterShiftOdometerGapService', () => {
  it('calculates the gap from previous shift end to current shift start', () => {
    expect(InterShiftOdometerGapService.calculate(2, 5)).toBe(3)
  })

  it('rejects a backwards odometer reading', () => {
    expect(() => InterShiftOdometerGapService.calculate(5, 2)).toThrow('Current Shift Start Odometer cannot be lower')
  })

  it('requires personal + dead + unclassified to equal the gap', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3, personalKm: 1, deadKm: 1, unclassifiedKm: 1 }).valid).toBe(true)
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3, personalKm: 1, deadKm: 1, unclassifiedKm: 0 }).valid).toBe(false)
  })
})
