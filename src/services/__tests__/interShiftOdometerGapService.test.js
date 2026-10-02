import { describe, expect, it } from 'vitest'
import { InterShiftOdometerGapService } from '../interShiftOdometerGapService.js'

describe('InterShiftOdometerGapService', () => {
  it('calculates the gap from previous shift end to current shift start', () => {
    expect(InterShiftOdometerGapService.calculate(2, 5)).toBe(3)
  })

  it('rejects a backwards odometer reading', () => {
    expect(() => InterShiftOdometerGapService.calculate(5, 2)).toThrow('Current Shift Start Odometer cannot be lower')
  })

  it('allocates the entire gap to Personal KM when Personal is selected', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3, category: 'PERSONAL' })).toEqual({
      valid: true,
      values: { gapKm: 3, personalKm: 3, deadKm: 0, category: 'PERSONAL' },
    })
  })

  it('allocates the entire gap to Dead KM when Dead is selected', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3, category: 'DEAD' })).toEqual({
      valid: true,
      values: { gapKm: 3, personalKm: 0, deadKm: 3, category: 'DEAD' },
    })
  })

  it('rejects a missing or blank gap instead of treating it as zero', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: null }).valid).toBe(false)
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: '' }).valid).toBe(false)
  })

  it('rejects missing or partial allocation', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3 }).valid).toBe(false)
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 3, category: 'OTHER' }).valid).toBe(false)
  })

  it('allows a zero gap without an allocation category', () => {
    expect(InterShiftOdometerGapService.validateAllocation({ gapKm: 0 }).values).toEqual({
      gapKm: 0, personalKm: 0, deadKm: 0, category: null,
    })
  })
})
