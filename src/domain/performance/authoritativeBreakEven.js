import { istDateKey } from '../time/ist.js'

const finite = v => Number.isFinite(Number(v)) ? Number(v) : null
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const businessDate = v => istDateKey(v)
const latest = (xs, range) => {
  const rangeFrom = businessDate(range?.from)
  const rangeTo = businessDate(range?.to)
  if (!rangeFrom || !rangeTo) return null
  return live(xs)
    .filter(x => x.active !== false && x.status !== 'INACTIVE')
    .filter(x => {
      const from = businessDate(x.effectiveFrom || x.validFrom || x.startDate) || '0000-01-01'
      const until = businessDate(x.effectiveUntil || x.validUntil || x.endDate) || '9999-12-31'
      return from <= rangeTo && until >= rangeFrom
    })
    .sort((a, b) => String(b.effectiveFrom || b.validFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.validFrom || a.startDate || '')))[0] || null
}

export function deriveAuthoritativeBreakEven({ breakEvenInputs = [], range, loanScheduledObligation = NaN, renewalProvision = NaN, fuelCostPerKm = NaN, vehicleKm = NaN } = {}) {
  const input = latest(breakEvenInputs, range)
  if (!input) return { available: false, reason: 'NO_APPLICABLE_BREAK_EVEN_INPUT', trace: { input: false, maintenanceProvisionPerKm: false, fuelCostPerKm: false, vehicleKm: false, loanScheduledObligation: false, renewalProvision: false } }
  const maintenanceProvisionPerKm = finite(input.maintenanceProvisionPerKm)
  const availability = {
    input: true,
    maintenanceProvisionPerKm: maintenanceProvisionPerKm != null,
    fuelCostPerKm: Number.isFinite(Number(fuelCostPerKm)),
    vehicleKm: Number.isFinite(Number(vehicleKm)),
    loanScheduledObligation: Number.isFinite(Number(loanScheduledObligation)),
    renewalProvision: Number.isFinite(Number(renewalProvision)),
  }
  const firstMissing = ['input', 'maintenanceProvisionPerKm', 'fuelCostPerKm', 'vehicleKm', 'loanScheduledObligation', 'renewalProvision'].find(key => !availability[key])
  if (firstMissing) return { available: false, reason: 'INCOMPLETE_BREAK_EVEN_INPUTS', trace: { ...availability, firstMissing } }
  const fixedCosts = Number(loanScheduledObligation) + Number(renewalProvision)
  const dynamicCosts = Number(vehicleKm) * Number(fuelCostPerKm) + Number(vehicleKm) * maintenanceProvisionPerKm
  return { available: true, monthlyBreakEvenRevenue: fixedCosts + dynamicCosts, maintenanceProvisionPerKm, fixedCosts, fuelCostPerKm: Number(fuelCostPerKm), vehicleKm: Number(vehicleKm), authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN', trace: { input: true, maintenanceProvisionPerKm: true, fuelCostPerKm: true, vehicleKm: true, loanScheduledObligation: true, renewalProvision: true, firstMissing: null } }
}
