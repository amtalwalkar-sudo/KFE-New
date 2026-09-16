export function calculateFuelQuantityKg(amountRupees, pricePerKg) {
  const amount = Number(amountRupees)
  const price = Number(pricePerKg)
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null
  return amount / price
}

const validFuel = x => x && Number.isFinite(Number(x.odometer)) && Number(x.odometer) >= 0 && Number.isFinite(Number(x.amount ?? x.totalCost)) && Number(x.amount ?? x.totalCost) > 0
const fullTank = x => x?.isFullTank !== false

/**
 * Full-tank-to-full-tank fuel cost/km. Missing isFullTank is treated as the
 * default Full Tank state; explicit false means a partial fill and is ignored.
 * Partial fills remain records but never establish or contribute to an interval.
 */
export function calculateRollingFuelCostPerKm(logs = [], windowSize = 10) {
  const full = (logs || []).filter(x => validFuel(x) && fullTank(x)).sort((a, b) => new Date(a.capturedAt || a.createdAt || 0) - new Date(b.capturedAt || b.createdAt || 0) || Number(a.odometer) - Number(b.odometer))
  const intervals = []
  for (let i = 1; i < full.length; i += 1) {
    const previous = full[i - 1]
    const current = full[i]
    const km = Number(current.odometer) - Number(previous.odometer)
    const cost = Number(current.amount ?? current.totalCost)
    if (km > 0 && cost > 0) intervals.push({ km, cost, costPerKm: cost / km, capturedAt: current.capturedAt || current.createdAt || null })
  }
  const observations = intervals.slice(-Math.max(1, Number(windowSize) || 10))
  const rollingCostPerKm = observations.length ? observations.reduce((sum, x) => sum + x.costPerKm, 0) / observations.length : NaN
  return { rollingCostPerKm, observations, completedIntervals: intervals.length, baselineFullTank: full[0] || null, latestFullTank: full[full.length - 1] || null }
}
