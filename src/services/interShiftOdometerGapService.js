import { validateGapAllocation } from '../domain/work/shift.js'

const toFiniteKm = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const InterShiftOdometerGapService = {
  calculate(previousShiftEndOdometer, currentShiftStartOdometer) {
    const previous = toFiniteKm(previousShiftEndOdometer)
    const current = toFiniteKm(currentShiftStartOdometer)
    if (previous === null || current === null) throw new Error('Valid previous and current odometer readings are required.')
    if (current < previous) throw new Error('Current Shift Start Odometer cannot be lower than the previous Shift End Odometer.')
    return current - previous
  },

  validateAllocation({ gapKm, category }) {
    const allocation = validateGapAllocation(gapKm, category)
    if (!allocation.valid) {
      return {
        valid: false,
        error: allocation.reason || 'The full odometer gap must be allocated to either Personal KM or Dead KM.',
      }
    }
    return {
      valid: true,
      values: {
        gapKm: toFiniteKm(gapKm),
        personalKm: allocation.personalKm,
        deadKm: allocation.deadKm,
        category: allocation.category ?? null,
      },
    }
  }
}
