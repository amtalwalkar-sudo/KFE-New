const finite = v => Number.isFinite(Number(v)) ? Number(v) : null
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const latest = (xs, range) => live(xs)
  .filter(x => x.active !== false && x.status !== 'INACTIVE')
  .filter(x => {
    const from = dateOf(x.effectiveFrom || x.validFrom || x.startDate) || new Date(0)
    const until = dateOf(x.effectiveUntil || x.validUntil || x.endDate) || new Date('9999-12-31T23:59:59.999Z')
    return from <= range.to && until >= range.from
  })
  .sort((a, b) => String(b.effectiveFrom || b.validFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.validFrom || a.startDate || '')))[0] || null

export function deriveAuthoritativeBreakEven({ breakEvenInputs = [], range, loanScheduledObligation = NaN, renewalProvision = NaN, fuelCostPerKm = NaN, vehicleKm = NaN } = {}) {
  const input = latest(breakEvenInputs, range)
  if (!input) return { available: false, reason: 'NO_APPLICABLE_BREAK_EVEN_INPUT' }
  const maintenanceProvisionPerKm = finite(input.maintenanceProvisionPerKm)
  if (maintenanceProvisionPerKm == null || !Number.isFinite(Number(vehicleKm)) || !Number.isFinite(Number(fuelCostPerKm)) || !Number.isFinite(Number(loanScheduledObligation)) || !Number.isFinite(Number(renewalProvision))) {
    return { available: false, reason: 'INCOMPLETE_BREAK_EVEN_INPUTS' }
  }
  const fixedCosts = Number(loanScheduledObligation) + Number(renewalProvision)
  const dynamicCosts = Number(vehicleKm) * Number(fuelCostPerKm) + Number(vehicleKm) * maintenanceProvisionPerKm
  return {
    available: true,
    breakEvenRevenue: fixedCosts + dynamicCosts,
    maintenanceProvisionPerKm,
    fixedCosts,
    fuelCostPerKm: Number(fuelCostPerKm),
    vehicleKm: Number(vehicleKm),
    authority: 'BREAK_EVEN_INPUTS_PLUS_CANONICAL_PERFORMANCE_COSTS'
  }
}
