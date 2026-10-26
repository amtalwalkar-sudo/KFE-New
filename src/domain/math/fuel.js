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
const vehicleIdOf = row => row?.vehicleId == null || String(row.vehicleId).trim() === '' ? null : String(row.vehicleId)

/**
 * Calculate fuel economy only from consecutive confirmed full-tank records
 * attached to the same registered vehicle. Partial fills remain operational
 * records but are excluded from the authoritative interval, matching the
 * frozen fuel-accounting contract. Derived metrics are read-model values, not
 * separately persisted facts.
 */
export function calculateRollingFuelCostPerKm(logs = [], windowSize = 10) {
  const groups = new Map()
  for (const row of (Array.isArray(logs) ? logs : []).filter(validFuel)) {
    const vehicleId = vehicleIdOf(row)
    if (!vehicleId) continue
    if (!groups.has(vehicleId)) groups.set(vehicleId, [])
    groups.get(vehicleId).push(row)
  }

  const fullTankRecords = [...groups.values()].flat().filter(fullTank).sort((a, b) => new Date(timestamp(a)) - new Date(timestamp(b)) || Number(a.odometer) - Number(b.odometer))
  const intervals = []
  for (const [vehicleId, vehicleRows] of groups) {
    const ordered = vehicleRows.slice().sort((a, b) =>
      new Date(timestamp(a)) - new Date(timestamp(b)) || Number(a.odometer) - Number(b.odometer))
    const full = ordered.filter(fullTank)
    for (let i = 1; i < full.length; i += 1) {
      const previous = full[i - 1]
      const current = full[i]
      const km = Number(current.odometer) - Number(previous.odometer)
      const cost = Number(current.amount ?? current.totalCost)
      const storedKg = Number(current.quantityKg ?? current.kg)
      const quantityKg = Number.isFinite(storedKg) && storedKg > 0
        ? storedKg
        : (calculateFuelQuantityKg(cost, current.pricePerKg ?? current.price_per_kg) || 0)
      if (!(km > 0) || !(cost > 0)) continue
      intervals.push({
        startOdometer: Number(previous.odometer),
        endOdometer: Number(current.odometer),
        km,
        cost,
        quantityKg,
        mileageKmPerKg: quantityKg > 0 ? km / quantityKg : null,
        costPerKm: cost / km,
        capturedAt: timestamp(current),
        vehicleId
      })
    }
  }

  intervals.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0))
  const observations = intervals.slice(-Math.max(1, Number(windowSize) || 10))
  const totalKm = observations.reduce((sum, interval) => sum + interval.km, 0)
  const totalCost = observations.reduce((sum, interval) => sum + interval.cost, 0)
  const totalQuantityKg = observations.reduce((sum, interval) => sum + interval.quantityKg, 0)
  const latest = observations.at(-1) || null

  return {
    rollingCostPerKm: observations.length
      ? observations.reduce((sum, interval) => sum + interval.costPerKm, 0) / observations.length
      : NaN,
    latestMileageKm: latest?.km ?? null,
    latestCostPerKm: latest?.costPerKm ?? null,
    latestMileageKmPerKg: latest?.mileageKmPerKg ?? null,
    averageCostPerKm: totalKm > 0 ? totalCost / totalKm : NaN,
    averageMileageKmPerKg: totalQuantityKg > 0 ? totalKm / totalQuantityKg : NaN,
    averageMileageKm: observations.length ? totalKm / observations.length : NaN,
    observations,
    completedIntervals: intervals.length,
    baselineFullTank: fullTankRecords[0] || null,
    latestFullTank: fullTankRecords.at(-1) || null
  }
}

/**
 * Derive Timeline fuel headers in the domain calculation layer.
 * The cost/km interval is attributed to the later full-tank fill, using the
 * existing fuel-accounting rule. All records are supplied so a previous full
 * tank can act as the baseline even when it falls before the selected period.
 * Partial fills count toward period expenditure, but never create a mileage
 * interval by themselves.
 */
export function calculateFuelPeriodSummary(logs = [], range) {
  const from = range?.from instanceof Date ? range.from.getTime() : new Date(range?.from).getTime()
  const to = range?.to instanceof Date ? range.to.getTime() : new Date(range?.to).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return { totalFuelAmount: 0, averageCostPerKm: null, intervalKm: 0, intervalCount: 0 }
  }

  const rows = Array.isArray(logs) ? logs : []
  const inPeriod = rows.filter(row => {
    const at = timestamp(row)
    const ms = at ? new Date(at).getTime() : NaN
    const amount = Number(row?.amount ?? row?.totalCost)
    return Number.isFinite(ms) && ms >= from && ms <= to && Number.isFinite(amount) && amount > 0
  })
  const totalFuelAmount = inPeriod.reduce((sum, row) => sum + Number(row.amount ?? row.totalCost), 0)
  const intervals = calculateRollingFuelCostPerKm(rows, Math.max(1, rows.length)).observations.filter(interval => {
    const ms = new Date(interval.capturedAt).getTime()
    return Number.isFinite(ms) && ms >= from && ms <= to
  })
  const intervalKm = intervals.reduce((sum, interval) => sum + interval.km, 0)
  const intervalCost = intervals.reduce((sum, interval) => sum + interval.cost, 0)
  return {
    totalFuelAmount,
    averageCostPerKm: intervalKm > 0 ? intervalCost / intervalKm : null,
    intervalKm,
    intervalCount: intervals.length,
  }
}
