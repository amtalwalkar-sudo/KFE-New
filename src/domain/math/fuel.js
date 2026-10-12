export function calculateFuelQuantityKg(amountRupees, pricePerKg) {
  const amount = Number(amountRupees)
  const price = Number(pricePerKg)
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null
  return amount / price
}

const validFuel = row => {
  const capturedAtValue = row?.capturedAt || row?.createdAt
  const capturedAt = capturedAtValue ? new Date(capturedAtValue) : null
  return Boolean(row && capturedAt && Number.isFinite(capturedAt.getTime()) &&
    Number.isFinite(Number(row.odometer)) && Number(row.odometer) >= 0 &&
    Number.isFinite(Number(row.amount ?? row.totalCost)) && Number(row.amount ?? row.totalCost) > 0)
}
const fullTank = row => row?.isFullTank === true
const vehicleKey = row => {
  const id = row?.vehicleId
  // KFE currently operates as a single-vehicle ERP. Older canonical fuel logs
  // do not carry vehicleId, so they must still form intervals with one another.
  return id == null || String(id).trim() === '' ? '__SINGLE_UNASSIGNED_VEHICLE__' : String(id)
}

/**
 * Full-to-full CNG economics.
 * Distance is measured between consecutive confirmed full-tank odometer readings.
 * Fuel spend/quantity includes every refill after the baseline full tank through
 * the next full tank, including partial fills. The baseline fill itself is not
 * charged to the following interval because it establishes the starting state.
 */
export function calculateRollingFuelCostPerKm(logs = [], windowSize = 10) {
  const grouped = new Map()
  for (const row of (logs || []).filter(validFuel)) {
    const key = vehicleKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }

  const intervals = []
  const fullTanks = []
  for (const rows of grouped.values()) {
    const ordered = rows.slice().sort((a, b) =>
      new Date(a.capturedAt || a.createdAt).getTime() - new Date(b.capturedAt || b.createdAt).getTime() ||
      Number(a.odometer) - Number(b.odometer)
    )
    const anchors = []
    ordered.forEach((row, index) => {
      if (fullTank(row)) {
        anchors.push({ row, index })
        fullTanks.push(row)
      }
    })

    for (let i = 1; i < anchors.length; i += 1) {
      const previous = anchors[i - 1]
      const current = anchors[i]
      const km = Number(current.row.odometer) - Number(previous.row.odometer)
      if (!(km > 0)) continue

      const included = ordered.slice(previous.index + 1, current.index + 1)
      const cost = included.reduce((sum, row) => sum + Number(row.amount ?? row.totalCost), 0)
      const quantityKg = included.reduce((sum, row) => {
        const quantity = Number(row.quantityKg ?? row.kg)
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0)
      }, 0)
      if (!(cost > 0)) continue

      intervals.push({
        km, distanceKm: km, cost, fuelCost: cost, quantityKg, costPerKm: cost / km,
        previousFullTank: previous.row, currentFullTank: current.row,
        capturedAt: current.row.capturedAt || current.row.createdAt || null,
        vehicleId: current.row.vehicleId ?? null,
      })
    }
  }

  intervals.sort((a, b) =>
    new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime() ||
    String(a.vehicleId ?? '').localeCompare(String(b.vehicleId ?? ''))
  )
  fullTanks.sort((a, b) =>
    new Date(a.capturedAt || a.createdAt).getTime() - new Date(b.capturedAt || b.createdAt).getTime() ||
    Number(a.odometer) - Number(b.odometer)
  )

  const size = Math.max(1, Number(windowSize) || 10)
  const observations = intervals.slice(-size)
  const rollingCostPerKm = observations.length
    ? observations.reduce((sum, interval) => sum + interval.costPerKm, 0) / observations.length
    : NaN
  const totalIntervalKm = intervals.reduce((sum, interval) => sum + interval.km, 0)
  const totalIntervalCost = intervals.reduce((sum, interval) => sum + interval.cost, 0)
  const averageCostPerKm = totalIntervalKm > 0 ? totalIntervalCost / totalIntervalKm : NaN

  return {
    rollingCostPerKm, averageCostPerKm, totalIntervalKm, totalIntervalCost,
    observations, intervals, completedIntervals: intervals.length,
    baselineFullTank: fullTanks[0] || null, latestFullTank: fullTanks[fullTanks.length - 1] || null,
  }
}
