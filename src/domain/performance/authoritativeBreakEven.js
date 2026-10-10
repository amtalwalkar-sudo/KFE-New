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
      const until = businessDate(x.effectiveUntil || x.validUntil || x.endDate) || '9999-12-31'
      return from <= rangeTo && rangeTo <= until
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
  loanInputAvailable = null,
  loanNotApplicable = false,
  preBusinessRecovery = NaN,
  historicalMaintenanceRecovery = NaN,
  renewalProvision = NaN,
  complianceInputAvailable = null,
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
    loan: (loanInputAvailable == null ? loan != null : !!loanInputAvailable) && loan != null,
    compliance: (complianceInputAvailable == null ? compliance != null : !!complianceInputAvailable) && compliance != null,
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
    components.loan && preBusiness != null ? loan + preBusiness : null,
    components.compliance ? compliance : null,
    historicalMaintenance,
  ].filter(value => value != null && Number.isFinite(value))
  const fixedCosts = fixedParts.length ? fixedParts.reduce((sum, value) => sum + value, 0) : null
  const hasKm = km != null && km >= 0
  const fuelCost = components.fuel && hasKm ? fuelRate * km : 0
  const maintenanceCost = components.maintenance && hasKm ? maintenanceProvisionPerKm * km : 0
  const hasCalculableVariableCost = hasKm && ((components.fuel && fuelRate != null) || (components.maintenance && maintenanceProvisionPerKm != null))
  const hasCalculableSubtotal = fixedCosts != null || hasCalculableVariableCost
  const monthlyBreakEvenRevenue = hasCalculableSubtotal ? (fixedCosts ?? 0) + fuelCost + maintenanceCost : null
  const missingComponents = Object.keys(components).filter(key => !components[key] && !(key === 'loan' && loanNotApplicable))
  if (!hasKm && (components.fuel || components.maintenance)) missingComponents.push('vehicleKmForVariableCosts')
  const fuelIsAuthoritative = components.fuel &&
    fuelCostPerKmStatus === CALCULATION_STATUS.AUTHORITATIVE
  const recoveryEvidenceComplete = preBusiness != null && historicalMaintenance != null
  const allRequiredEvidence = missingComponents.length === 0 && recoveryEvidenceComplete && hasKm && fuelIsAuthoritative &&
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
    reason: missingComponents.length ? 'PARTIAL_BREAK_EVEN_COMPONENTS' : !recoveryEvidenceComplete ? 'PROVISIONAL_RECOVERY_EVIDENCE' : 'PROVISIONAL_FUEL_OR_KM_EVIDENCE',
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
      reason: missingComponents.length ? 'PARTIAL_BREAK_EVEN_COMPONENTS' : !recoveryEvidenceComplete ? 'PROVISIONAL_RECOVERY_EVIDENCE' : 'PROVISIONAL_FUEL_OR_KM_EVIDENCE',
      dependencies: { ...dependencies, recoveryEvidenceComplete },
    }),
    trace: { ...dependencies, firstMissing: missingComponents[0] || (!recoveryEvidenceComplete ? (!preBusiness ? 'preBusinessRecovery' : 'historicalMaintenanceRecovery') : !hasKm ? 'vehicleKm' : 'fuelCostPerKmEvidence') },
  }
}
