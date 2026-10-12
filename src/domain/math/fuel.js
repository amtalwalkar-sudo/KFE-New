export function calculateFuelQuantityKg(amountRupees, pricePerKg) {
  const amount = Number(amountRupees)
  const price = Number(pricePerKg)
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null
  return amount / price
}

const timestamp = row => row?.capturedAt || row?.createdAt || null
const validFuel = row => {
  const at = timestamp(row)
  const date = at ? new Date(at) : null
  return Boolean(row && date && Number.isFinite(date.getTime())
    && Number.isFinite(Number(row.odometer)) && Number(row.odometer) >= 0
    && Number.isFinite(Number(row.amount ?? row.totalCost)) && Number(row.amount ?? row.totalCost) > 0)
}
const fullTank = row => row?.isFullTank === true
const vehicleKey = row => {
  const id = row?.vehicleId
  return id == null || String(id).trim() === '' ? '__SINGLE_VEHICLE_UNASSIGNED__' : String(id)
}

/**
 * Derive full-tank-to-full-tank CNG economy from canonical fuel logs.
 * Each interval starts at one confirmed full tank and ends at the next.
 * Spend and quantity from partial fills after the baseline are included, as is
 * the final full fill; the baseline fill itself is excluded. This is the
 * standard full-to-full method and makes the result useful to later finance
 * and target calculations without persisting a stale derived snapshot.
 */
export function calculateRollingFuelCostPerKm(logs = [], windowSize = 10) {
  const rows = (Array.isArray(logs) ? logs : [])
    .filter(validFuel)
    .slice()
    .sort((a, b) => new Date(timestamp(a)) - new Date(timestamp(b)) || Number(a.odometer) - Number(b.odometer))
  const groups = new Map()
  for (const row of rows) {
    const key = vehicleKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const intervals = []
  for (const [vehicleId, vehicleRows] of groups) {
    // If explicit vehicle IDs exist, keep unassigned logs separate; the app's
    // current single-car fuel form does not write a vehicle ID yet.
    const ordered = vehicleRows
    const fullIndices = ordered.map((row, index) => fullTank(row) ? index : -1).filter(index => index >= 0)
    for (let i = 1; i < fullIndices.length; i += 1) {
      const previousIndex = fullIndices[i - 1]
      const currentIndex = fullIndices[i]
      const previous = ordered[previousIndex]
      const current = ordered[currentIndex]
      const km = Number(current.odometer) - Number(previous.odometer)
      if (!(km > 0)) continue

      const refills = ordered.slice(previousIndex + 1, currentIndex + 1)
      const cost = refills.reduce((sum, row) => sum + Number(row.amount ?? row.totalCost), 0)
      const quantityKg = refills.reduce((sum, row) => {
        const stored = Number(row.quantityKg ?? row.kg)
        if (Number.isFinite(stored) && stored > 0) return sum + stored
        const derived = calculateFuelQuantityKg(row.amount ?? row.totalCost, row.pricePerKg ?? row.price_per_kg)
        return sum + (derived || 0)
      }, 0)
      if (!(cost > 0)) continue
      intervals.push({
        startOdometer: Number(previous.odometer),
        endOdometer: Number(current.odometer),
        km,
        cost,
        quantityKg,
        mileageKmPerKg: quantityKg > 0 ? km / quantityKg : null,
        costPerKm: cost / km,
        capturedAt: timestamp(current),
        vehicleId: vehicleId === '__SINGLE_VEHICLE_UNASSIGNED__' ? null : vehicleId
      })
    }
  }

  intervals.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0))
  const observations = intervals.slice(-Math.max(1, Number(windowSize) || 10))
  const totalKm = observations.reduce((sum, interval) => sum + interval.km, 0)
  const totalCost = observations.reduce((sum, interval) => sum + interval.cost, 0)
  const totalQuantityKg = observations.reduce((sum, interval) => sum + interval.quantityKg, 0)
  const latest = observations.at(-1) || null
  const averageCostPerKm = totalKm > 0 ? totalCost / totalKm : NaN
  const averageMileageKmPerKg = totalQuantityKg > 0 ? totalKm / totalQuantityKg : NaN

  return {
    rollingCostPerKm: observations.length
      ? observations.reduce((sum, interval) => sum + interval.costPerKm, 0) / observations.length
      : NaN,
    latestMileageKm: latest?.km ?? null,
    latestCostPerKm: latest?.costPerKm ?? null,
    latestMileageKmPerKg: latest?.mileageKmPerKg ?? null,
    averageCostPerKm,
    averageMileageKmPerKg,
    averageMileageKm: observations.length ? totalKm / observations.length : NaN,
    observations,
    completedIntervals: intervals.length,
    baselineFullTank: rows.find(fullTank) || null,
    latestFullTank: rows.filter(fullTank).at(-1) || null
  }
}
