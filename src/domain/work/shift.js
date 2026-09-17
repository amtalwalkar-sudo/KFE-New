export function validateShiftStartOdometer(currentOdometer, previousOdometer = null) {
  const current = Number(currentOdometer)
  const previous = Number(previousOdometer)

  if (!Number.isFinite(current) || current <= 0) {
    return { valid: false, reason: 'Enter a valid current odometer.' }
  }
  if (!Number.isFinite(previous)) {
    return { valid: true, gapKm: 0 }
  }
  if (current < previous) {
    return { valid: false, reason: 'Current odometer cannot be lower than the last recorded odometer.' }
  }
  return { valid: true, gapKm: current - previous }
}

export function validateGapAllocation(gapKm, category = null) {
  const gap = Number(gapKm)
  if (!Number.isFinite(gap) || gap < 0) {
    return { valid: false, requiresGapAllocation: true, gapKm: gap }
  }
  if (gap === 0) {
    return { valid: true, category: null, personalKm: 0, deadKm: 0 }
  }
  if (category !== 'PERSONAL' && category !== 'DEAD') {
    return { valid: false, requiresGapAllocation: true, gapKm: gap }
  }
  return {
    valid: true,
    category,
    personalKm: category === 'PERSONAL' ? gap : 0,
    deadKm: category === 'DEAD' ? gap : 0
  }
}
