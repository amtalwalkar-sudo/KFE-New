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

export function getApplicableBreakEvenInput({ breakEvenInputs = [], range } = {}) { return latest(breakEvenInputs, range) }

export function deriveAuthoritativeBreakEven({ breakEvenInputs = [], range, loanScheduledObligation = NaN, preBusinessRecovery = 0, historicalMaintenanceRecovery = 0, renewalProvision = NaN, fuelCostPerKm = NaN, fuelCostPerKmStatus = CALCULATION_STATUS.UNAVAILABLE, vehicleKm = NaN, vehicleKmSource = 'UNAVAILABLE' } = {}) {
  const input = latest(breakEvenInputs, range)
  if (!input) {
    return {
      available: false,
      status: CALCULATION_STATUS.UNAVAILABLE,
      reason: 'NO_APPLICABLE_BREAK_EVEN_INPUT',
      evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason: 'NO_APPLICABLE_BREAK_EVEN_INPUT' }),
      trace: { input: false, maintenanceProvisionPerKm: false, fuelCostPerKm: false, fuelCostPerKmEvidence: false, vehicleKm: false, loanScheduledObligation: false, renewalProvision: false },
    }
  }
  const maintenanceProvisionPerKm = finite(input.maintenanceProvisionPerKm)
  const availability = {
    input: true,
    maintenanceProvisionPerKm: maintenanceProvisionPerKm != null,
    fuelCostPerKm: Number.isFinite(Number(fuelCostPerKm)),
    fuelCostPerKmEvidence: fuelCostPerKmStatus === CALCULATION_STATUS.AUTHORITATIVE,
    vehicleKm: Number.isFinite(Number(vehicleKm)),
    vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
    loanScheduledObligation: Number.isFinite(Number(loanScheduledObligation)),
    preBusinessRecovery: Number.isFinite(Number(preBusinessRecovery)),
    historicalMaintenanceRecovery: Number.isFinite(Number(historicalMaintenanceRecovery)),
    renewalProvision: Number.isFinite(Number(renewalProvision)),
  }
  const firstMissing = ['input', 'maintenanceProvisionPerKm', 'fuelCostPerKm', 'fuelCostPerKmEvidence', 'vehicleKm', 'loanScheduledObligation', 'preBusinessRecovery', 'historicalMaintenanceRecovery', 'renewalProvision'].find(key => !availability[key])
  const numericComplete = ['input', 'maintenanceProvisionPerKm', 'fuelCostPerKm', 'vehicleKm', 'loanScheduledObligation', 'preBusinessRecovery', 'renewalProvision'].every(key => availability[key])
  if (!numericComplete) {
    return {
      available: false,
      status: CALCULATION_STATUS.UNAVAILABLE,
      reason: 'INCOMPLETE_BREAK_EVEN_INPUTS',
      evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason: 'INCOMPLETE_BREAK_EVEN_INPUTS', dependencies: availability }),
      trace: { ...availability, firstMissing },
    }
  }
  const fixedCosts = Number(loanScheduledObligation) + Number(preBusinessRecovery) + Number(historicalMaintenanceRecovery) + Number(renewalProvision)
  const dynamicCosts = Number(vehicleKm) * Number(fuelCostPerKm) + Number(vehicleKm) * maintenanceProvisionPerKm
  const monthlyBreakEvenRevenue = fixedCosts + dynamicCosts
  if (fuelCostPerKmStatus !== CALCULATION_STATUS.AUTHORITATIVE) {
    return {
      available: false,
      status: CALCULATION_STATUS.INDICATIVE,
      reason: 'PROVISIONAL_FUEL_EVIDENCE',
      indicativeMonthlyBreakEvenRevenue: monthlyBreakEvenRevenue,
      maintenanceProvisionPerKm,
      fixedCosts,
      fuelCostPerKm: Number(fuelCostPerKm),
      vehicleKm: Number(vehicleKm),
      vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
      authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      evidence: calculationEvidence({ status: CALCULATION_STATUS.INDICATIVE, source: fuelCostPerKmStatus === CALCULATION_STATUS.INDICATIVE ? 'OBSERVED_PERIOD' : null, reason: 'PROVISIONAL_FUEL_EVIDENCE', dependencies: availability }),
      trace: { ...availability, firstMissing: 'fuelCostPerKmEvidence' },
    }
  }
  return {
    available: true,
    status: CALCULATION_STATUS.AUTHORITATIVE,
    monthlyBreakEvenRevenue,
    maintenanceProvisionPerKm,
    fixedCosts,
    fuelCostPerKm: Number(fuelCostPerKm),
    vehicleKm: Number(vehicleKm),
    vehicleKmSource: String(vehicleKmSource || 'UNAVAILABLE'),
    authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
    evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'FULL_TANK_INTERVAL', dependencies: availability }),
    trace: { ...availability, firstMissing: null },
  }
}
