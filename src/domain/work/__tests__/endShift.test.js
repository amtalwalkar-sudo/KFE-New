import { describe, it, expect } from 'vitest'
import { validateEndShiftEntry } from '../endShift.js'

describe('End Shift gate', () => {
  it('allows zero revenue with no trips', () => {
    expect(validateEndShiftEntry({
      closingOdometer: 65000,
      revenue: 0
    })).toEqual({ valid: true })
  })

  it('allows zero revenue even when trips exist', () => {
    expect(validateEndShiftEntry({
      closingOdometer: 65000,
      revenue: 0
    })).toEqual({ valid: true })
  })

  it('allows closing odometer equal to starting odometer', () => {
    expect(validateEndShiftEntry({
      closingOdometer: 65000,
      revenue: 1250
    })).toEqual({ valid: true })
  })

  it('does not require odometer movement as an End Shift condition', () => {
    expect(validateEndShiftEntry({
      closingOdometer: 65000,
      revenue: 0
    })).toEqual({ valid: true })
  })

  it('rejects a missing or non-numeric closing odometer', () => {
    expect(validateEndShiftEntry({ closingOdometer: null, revenue: 0 })).toEqual({
      valid: false,
      reason: 'CLOSING_ODOMETER_REQUIRED'
    })
  })

  it('rejects missing or negative revenue', () => {
    expect(validateEndShiftEntry({ closingOdometer: 65000, revenue: null })).toEqual({
      valid: false,
      reason: 'REVENUE_REQUIRED'
    })

    expect(validateEndShiftEntry({ closingOdometer: 65000, revenue: -1 })).toEqual({
      valid: false,
      reason: 'REVENUE_REQUIRED'
    })
  })
})
