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

  validateAllocation({ gapKm, personalKm, deadKm, unclassifiedKm }) {
    const gap = toFiniteKm(gapKm)
    const personal = toFiniteKm(personalKm)
    const dead = toFiniteKm(deadKm)
    const unclassified = toFiniteKm(unclassifiedKm)
    if ([gap, personal, dead, unclassified].some((value) => value === null)) return { valid: false, error: 'Enter valid non-negative KM values.' }
    const total = personal + dead + unclassified
    if (Math.abs(total - gap) > 0.000001) return { valid: false, error: `Allocation must total exactly ${gap} km.` }
    return { valid: true, values: { gapKm: gap, personalKm: personal, deadKm: dead, unclassifiedKm: unclassified } }
  }
}
