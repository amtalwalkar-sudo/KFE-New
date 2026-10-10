import { istDateKey } from '../time/ist.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'

const finite = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const businessDate = v => istDateKey(v)
const latest = (xs, range) => {
  const rangeTo = businessDate(range?.to)
  if (!rangeTo) return null
  return live(xs)
    .filter(x => x.active !== false && x.status !== 'INACTIVE')
    .filter(x => {
      const from = businessDate(x.effectiveFrom || x.validFrom || x.startDate) || '0000-01-01'
      return from <= rangeTo
    })
    .sort((a, b) => {
      const dateCompare = String(b.effectiveFrom || b.validFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.validFrom || a.startDate || ''))
      if (dateCompare !== 0) return dateCompare
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    })[0] || null
}

export function deriveAuthoritativeBreakEven({
  breakEvenInputs = [],
  range,
  loanScheduledObligation = NaN,
  loanInputAvailable = false,
  preBusinessRecovery = 0,
  historicalMaintenanceRecovery = 0,
  renewalProvision = NaN,
  complianceInputAvailable = false,
  fuelCostPerKm = NaN,
  fuelCostPerKmStatus = CALCULATION_STATUS.UNAVAILABLE,
  vehicleKm = NaN,
  vehicleKmSource = 'UNAVAILABLE',
} = {}) {
  const input = latest(breakEvenInputs, range)
  const maintenanceProvisionPerKm = finite(input?.maintenanceProvisionPerKm)
  const fuelRate = finite(fuelCostPerKm)
  const km = finite(vehicleKm)
  const loan = finite(loanScheduledObligation)
  const preBusiness = finite(preBusinessRecovery)
  const historicalMaintenance = finite(historicalMaintenanceRecovery)
  const compliance = finite(renewalProvision)
  const components = {
    loan: !!loanInputAvailable && loan != null,
    compliance: !!complianceInputAvailable && compliance != null,
    maintenance: maintenanceProvisionPerKm != null,
    fuel: fuelRate != null && fuelRate >= 0,
  }
  const hasAnyEnteredComponent = Object.values(components).some(Boolean)
  if (!hasAnyEnteredComponent) {
    return {
      available: false,
      status: CALCULATION_STATUS.UNAVAILABLE,
      reason: 'NO_BREAK_EVEN_COMPONENTS_ENTERED',
      evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason: 'NO_BREAK_EVEN_COMPONENTS_ENTERED', dependencies: components }),
      trace: { components, missingComponents: Object.keys(components).filter(key => !components[key]) },
    }
  }

  // Missing categories are omitted from the provisional estimate, not treated as
  // confirmed zero-cost categories. The component flags keep that distinction visible.
  const fixedParts = [
    components.loan ? loan + (preBusiness ?? 0) : 0,
    components.compliance ? compliance : 0,
    components.loan ? (historicalMaintenance ?? 0) : 0,
  ]
  const fixedCosts = fixedParts.reduce((sum, value) => sum + value, 0)
  const hasKm = km != null && km >= 0
  const fuelCost = components.fuel && hasKm ? fuelRate * km : 0
  const maintenanceCost = components.maintenance && hasKm ? maintenanceProvisionPerKm * km : 0
  const monthlyBreakEvenRevenue = fixedCosts + fuelCost + maintenanceCost
  const missingComponents = Object.keys(components).filter(key => !components[key])
  const fuelIsAuthoritative = components.fuel &&
    fuelCostPerKmStatus === CALCULATION_STATUS.AUTHORITATIVE
  const allRequiredEvidence = missingComponents.length === 0 && hasKm && fuelIsAuthoritative &&
    (components.maintenance || !maintenanceProvisionPerKm) &&
    (components.loan || loanScheduledObligation === 0) &&
    (components.compliance || renewalProvision === 0)

  const dependencies = {
    ...components,
    input: !!input,
    maintenanceProvisionPerKm: maintenanceProvisionPerKm != null,
    fuelCostPerKm: fuelRate != null,
    fuelCostPerKmEvidence: fuelIsAuthoritative,
    vehicleKm: hasKm,
    vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
    loanScheduledObligation: loan != null,
    preBusinessRecovery: preBusiness != null,
    historicalMaintenanceRecovery: historicalMaintenance != null,
    renewalProvision: compliance != null,
    missingComponents,
  }

  if (allRequiredEvidence) {
    return {
      available: true,
      status: CALCULATION_STATUS.AUTHORITATIVE,
      monthlyBreakEvenRevenue,
      maintenanceProvisionPerKm,
      fixedCosts,
      fuelCostPerKm: fuelRate,
      vehicleKm: km,
      vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
      authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'FULL_TANK_INTERVAL', dependencies }),
      trace: { ...dependencies, firstMissing: null },
    }
  }

  return {
    available: false,
    status: CALCULATION_STATUS.INDICATIVE,
    reason: missingComponents.length ? 'PARTIAL_BREAK_EVEN_COMPONENTS' : 'PROVISIONAL_FUEL_OR_KM_EVIDENCE',
    indicativeMonthlyBreakEvenRevenue: monthlyBreakEvenRevenue,
    maintenanceProvisionPerKm,
    fixedCosts,
    fuelCostPerKm: fuelRate,
    vehicleKm: km,
    vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
    authority: 'INDICATIVE_MONTHLY_BREAK_EVEN',
    evidence: calculationEvidence({
      status: CALCULATION_STATUS.INDICATIVE,
      source: fuelIsAuthoritative ? 'PARTIAL_COMPONENTS' : fuelCostPerKmStatus === CALCULATION_STATUS.INDICATIVE ? 'OBSERVED_PERIOD' : 'PARTIAL_COMPONENTS',
      reason: missingComponents.length ? 'PARTIAL_BREAK_EVEN_COMPONENTS' : 'PROVISIONAL_FUEL_OR_KM_EVIDENCE',
      dependencies,
    }),
    trace: { ...dependencies, firstMissing: missingComponents[0] || (!hasKm ? 'vehicleKm' : 'fuelCostPerKmEvidence') },
  }
}
