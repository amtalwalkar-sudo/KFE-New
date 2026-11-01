export function calculateFuelQuantityKg(amountRupees, pricePerKg) {
  const amount = Number(amountRupees)
  const price = Number(pricePerKg)
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null
  return amount / price
}

const timestamp = row => {
  const capturedAt = row?.capturedAt
  if (capturedAt && Number.isFinite(new Date(capturedAt).getTime())) return capturedAt
  const createdAt = row?.createdAt
  return createdAt && Number.isFinite(new Date(createdAt).getTime()) ? createdAt : null
}
const validFuel = row => {
  const at = timestamp(row)
  const date = at ? new Date(at) : null
  return Boolean(row && !row.deletedAt && row.deleted !== true && date && Number.isFinite(date.getTime())
    && row.odometer !== null && row.odometer !== undefined && row.odometer !== ''
    && Number.isFinite(Number(row.odometer)) && Number(row.odometer) >= 0
    && Number.isFinite(Number(row.amount ?? row.totalCost)) && Number(row.amount ?? row.totalCost) > 0)
}
const fullTank = row => row?.isFullTank === true
const vehicleIdOf = row => row?.vehicleId == null || String(row.vehicleId).trim() === '' ? null : String(row.vehicleId)

/**
 * Build only the intervals needed by the active fuel-cost calculation.
 * Partial refills are retained as spending facts but never create mileage
 * intervals. A full-tank interval is attributed to its later full-tank fill.
 */
function deriveFullTankIntervals(logs = []) {
  const groups = new Map()
  for (const row of (Array.isArray(logs) ? logs : []).filter(validFuel)) {
    const vehicleId = vehicleIdOf(row)
    if (!vehicleId) continue
    if (!groups.has(vehicleId)) groups.set(vehicleId, [])
    groups.get(vehicleId).push(row)
  }

  const intervals = []
  for (const [vehicleId, vehicleRows] of groups) {
    const full = vehicleRows.filter(fullTank).sort((a, b) =>
      new Date(timestamp(a)) - new Date(timestamp(b)) || Number(a.odometer) - Number(b.odometer))
    for (let i = 1; i < full.length; i += 1) {
      const previous = full[i - 1]
      const current = full[i]
      const km = Number(current.odometer) - Number(previous.odometer)
      const cost = Number(current.amount ?? current.totalCost)
      if (!(km > 0) || !(cost > 0)) continue
      intervals.push({ km, cost, capturedAt: timestamp(current), vehicleId })
    }
  }

  return intervals.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0))
}

/**
 * Derive Timeline and Performance fuel headers from saved source facts.
 * All records are supplied so a previous full tank can act as the baseline
 * even when it falls before the selected period. Partial fills count toward
 * total period spending but never create a mileage interval.
 */
export function calculateFuelPeriodSummary(logs = [], range) {
  const from = range?.from instanceof Date ? range.from.getTime() : new Date(range?.from).getTime()
  const to = range?.to instanceof Date ? range.to.getTime() : new Date(range?.to).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return { totalFuelAmount: 0, averageCostPerKm: null, intervalKm: 0, intervalCount: 0 }
  }

  const rows = (Array.isArray(logs) ? logs : []).filter(row => !row?.deletedAt && row?.deleted !== true)
  const inPeriod = rows.filter(row => {
    if (!validFuel(row)) return false
    const at = timestamp(row)
    const ms = at ? new Date(at).getTime() : NaN
    return Number.isFinite(ms) && ms >= from && ms <= to
  })
  const totalFuelAmount = inPeriod.reduce((sum, row) => sum + Number(row.amount ?? row.totalCost), 0)
  const intervals = deriveFullTankIntervals(rows).filter(interval => {
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
