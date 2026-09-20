export function calculateFuelQuantityKg(amountRupees, pricePerKg) {
  const amount = Number(amountRupees)
  const price = Number(pricePerKg)
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null
  return amount / price
}

const validFuel = x => { const capturedAtValue = x?.capturedAt || x?.createdAt; const capturedAt = capturedAtValue ? new Date(capturedAtValue) : null; return x && capturedAt && Number.isFinite(capturedAt.getTime()) && Number.isFinite(Number(x.odometer)) && Number(x.odometer) >= 0 && Number.isFinite(Number(x.amount ?? x.totalCost)) && Number(x.amount ?? x.totalCost) > 0 }
const fullTank = x => x?.isFullTank === true
const sameVehicle = (a, b) => a?.vehicleId != null && b?.vehicleId != null && String(a.vehicleId) === String(b.vehicleId)

/**
 * Authoritative full-tank-to-full-tank fuel cost/km requires explicit full-tank
 * confirmation, valid timestamp/odometer/amount, and a stable vehicle association.
 * Partial or unassociated fills remain records but never establish an interval.
 */
export function calculateRollingFuelCostPerKm(logs = [], windowSize = 10) {
  const full = (logs || []).filter(x => validFuel(x) && fullTank(x)).sort((a, b) => new Date(a.capturedAt || a.createdAt || 0) - new Date(b.capturedAt || b.createdAt || 0) || Number(a.odometer) - Number(b.odometer))
  const intervals = []
  for (let i = 1; i < full.length; i += 1) {
    const previous = full[i - 1]
    const current = full[i]
    const km = Number(current.odometer) - Number(previous.odometer)
    const cost = Number(current.amount ?? current.totalCost)
    if (km > 0 && cost > 0 && sameVehicle(previous, current)) intervals.push({ km, cost, costPerKm: cost / km, capturedAt: current.capturedAt || current.createdAt || null, vehicleId: current.vehicleId })
  }
  const observations = intervals.slice(-Math.max(1, Number(windowSize) || 10))
  const rollingCostPerKm = observations.length ? observations.reduce((sum, x) => sum + x.costPerKm, 0) / observations.length : NaN
  return { rollingCostPerKm, observations, completedIntervals: intervals.length, baselineFullTank: full[0] || null, latestFullTank: full[full.length - 1] || null }
}
