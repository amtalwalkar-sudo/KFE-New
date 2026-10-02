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
    const gap = toFiniteKm(gapKm)
    if (gap === null) return { valid: false, error: 'Enter a valid non-negative KM gap.' }
    if (gap === 0) return { valid: true, values: { gapKm: 0, personalKm: 0, deadKm: 0, category: null } }
    if (category !== 'PERSONAL' && category !== 'DEAD') return { valid: false, error: 'The full odometer gap must be allocated to either Personal KM or Dead KM.' }
    return {
      valid: true,
      values: {
        gapKm: gap,
        personalKm: category === 'PERSONAL' ? gap : 0,
        deadKm: category === 'DEAD' ? gap : 0,
        category,
      },
    }
  }
}
