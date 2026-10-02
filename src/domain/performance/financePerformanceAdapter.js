import { derivePerformance as deriveOperationalPerformance, previousRange as derivePreviousRange } from './performanceEngineV2.js'
import { CALCULATION_STATUS } from './calculationAuthority.js'
import { deriveAuthoritativeBreakEven, getApplicableBreakEvenInput } from './authoritativeBreakEven.js'
import { deriveOperatingKmForecast } from './operatingKmForecast.js'
import { deriveLoanPosition, calculatePreBusinessLoanRecovery, calculatePreBusinessLoanRecoveryForRange } from '../finance/loanEngine.js'
import { calculateHistoricalMaintenanceRecovery, calculateHistoricalMaintenanceRecoveryForRange } from './performanceEngineV2.js'
import { istMonthRange, istDateKey } from '../time/ist.js'

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const money = value => Number.isFinite(Number(value)) ? Number(value) : 0
const businessStartDate = snapshot => {
  const value = snapshot?.businessSetup?.businessStartDate
  if (!value) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  return dateOf(dateOnly ? `${value}T00:00:00+05:30` : value)
}
const asOf = range => dateOf(range?.to) || new Date()
const inRange = (value, range) => { const date = dateOf(value); return !!date && date >= range.from && date <= range.to }
const calendarSerial = value => { const key=istDateKey(value); if(!key)return null; const [y,m,d]=key.split('-').map(Number); return Date.UTC(y,m-1,d)/86400000 }
const scheduledEmiAccruedForRange = (schedule, range) => {
  if (!Array.isArray(schedule)) return null
  const from=calendarSerial(range?.from),to=calendarSerial(range?.to)
  if(from==null||to==null||to<from)return null
  let total=0
  for(const row of schedule){
    const amount=Number(row.originalEmiAmount),start=calendarSerial(row.periodStart),due=calendarSerial(row.dueDate)
    if(!Number.isFinite(amount)||amount<0||start==null||due==null||due<start)return null
    const overlapFrom=Math.max(from,start),overlapTo=Math.min(to,due)
    if(overlapTo<overlapFrom)continue
    total+=amount*((overlapTo-overlapFrom+1)/(due-start+1))
  }
  return Math.round(total*100)/100
}

export function deriveFinanceAwarePerformance(snapshot, range, previousPeriod) {
  const base = deriveOperationalPerformance(snapshot, range, previousPeriod)
  const currentAsOf = asOf(range)
  const previousAsOf = asOf(previousPeriod)
  const loanRecords = live(snapshot?.loans)
  const paymentRecords = live(snapshot?.loanPayments)
  const prepaymentRecords = live(snapshot?.prepayments)
  const candidateLoans = loanRecords.filter(loan => { const status = String(loan.status || '').toUpperCase(); return !status || status === 'ACTIVE' }).filter(loan => !dateOf(loan.startDate) || dateOf(loan.startDate) <= currentAsOf)
  const activeLoan = candidateLoans.filter(loan => Number.isFinite(Number(loan.principal)) && Number(loan.principal) > 0).filter(loan => Number.isFinite(Number(loan.tenureMonths)) && Number(loan.tenureMonths) > 0).filter(loan => Number.isFinite(Number(loan.annualInterestRatePercent)) && Number(loan.annualInterestRatePercent) >= 0).filter(loan => dateOf(loan.startDate)).sort((a, b) => (dateOf(b.startDate)?.getTime() || 0) - (dateOf(a.startDate)?.getTime() || 0))[0]
  const hasIncompleteActiveLoan = candidateLoans.length > 0 && !activeLoan
  const finance = activeLoan ? deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: currentAsOf }) : null
  const previousFinance = activeLoan ? deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: previousAsOf }) : null
  const businessStart = businessStartDate(snapshot)
  const historicalMaintenanceRecovery = calculateHistoricalMaintenanceRecovery({ vehicles: snapshot?.vehicles || [], businessStartDate: businessStart, asOf: currentAsOf })
  const preBusinessRecoveryMonthly = finance ? calculatePreBusinessLoanRecovery({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, businessStartDate: businessStart, asOf: currentAsOf }) : 0
  const currentScheduledEmi = finance?.schedule ? finance.schedule.filter(row => inRange(row.dueDate, range)).reduce((sum, row) => sum + money(row.originalEmiAmount), 0) : 0
  const currentScheduledInterest = finance?.schedule ? finance.schedule.filter(row => inRange(row.dueDate, range)).reduce((sum, row) => sum + money(row.originalInterestComponent), 0) : 0
  const preBusinessRecoveryForPeriod = finance ? calculatePreBusinessLoanRecoveryForRange({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, businessStartDate: businessStart, range }) : 0
  const historicalMaintenanceRecoveryForPeriod = calculateHistoricalMaintenanceRecoveryForRange({ vehicles: snapshot?.vehicles || [], businessStartDate: businessStart, range: range })
  const fullMonthRange = istMonthRange(range?.to) || range
  // Break-even is a normalized monthly requirement, not month-to-date spend.
  // Use the complete target month for fixed/calendar obligations and a
  // normalized monthly vehicle-KM basis. The first business month is
  // prorated from Business Start Date.
  const breakEvenMonthRange = fullMonthRange
    ? {
        ...fullMonthRange,
        from: businessStart && businessStart > fullMonthRange.from ? businessStart : fullMonthRange.from,
      }
    : range
  const breakEvenEvidenceRange = {
    ...breakEvenMonthRange,
    to: breakEvenMonthRange?.to && breakEvenMonthRange.to > currentAsOf ? currentAsOf : breakEvenMonthRange?.to,
  }
  const breakEvenInput = getApplicableBreakEvenInput({
    breakEvenInputs: snapshot?.breakEvenInputs || [],
    range: breakEvenEvidenceRange,
  })
  const operatingKmForecastForBreakEven = deriveOperatingKmForecast({
    shifts: snapshot?.shifts || [],
    from: breakEvenEvidenceRange?.from,
    to: breakEvenMonthRange?.to,
    asOf: currentAsOf,
  })
  // Fuel evidence must respect the reporting as-of boundary even though the
  // monthly BE itself is normalized over the complete month.
  const monthlyEvidenceBase = deriveOperationalPerformance(
    snapshot,
    breakEvenEvidenceRange,
    derivePreviousRange(breakEvenEvidenceRange),
  )
  const calendarDays = value => value
    ? Math.max(1, Math.round((new Date(value.to).getTime() - new Date(value.from).getTime()) / 86400000) + 1)
    : null
  const configuredMonthlyKm = Number.isFinite(Number(breakEvenInput?.expectedMonthlyVehicleKm))
    ? Number(breakEvenInput.expectedMonthlyVehicleKm)
    : NaN
  const forecastMonthlyKm = Number(operatingKmForecastForBreakEven?.fullMonthForecastKm)
  // The frozen operating-KM forecast is the sole KM basis for indicative break-even.
  // Admin expectedMonthlyVehicleKm remains exposed as legacy configuration metadata,
  // but it must never bypass the authoritative 200-km/day convergence model.
  const normalizedMonthlyKm = forecastMonthlyKm
  const normalizedMonthlyKmSource = Number.isFinite(forecastMonthlyKm)
    ? 'CALCULATED_OPERATING_KM_FORECAST'
    : 'UNAVAILABLE'
  const monthlyBase = deriveOperationalPerformance(snapshot, breakEvenMonthRange, derivePreviousRange(breakEvenMonthRange))
  const monthAsOf = asOf(breakEvenMonthRange)
  const monthFinance = activeLoan ? deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: monthAsOf }) : null
  // Accrue each EMI over its canonical periodStart→dueDate validity interval, not only on the due date.
  const monthScheduledEmi = hasIncompleteActiveLoan ? NaN : activeLoan && monthFinance ? scheduledEmiAccruedForRange(monthFinance.schedule, breakEvenMonthRange) : activeLoan ? NaN : 0
  const monthPreBusinessRecovery = monthFinance ? calculatePreBusinessLoanRecoveryForRange({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, businessStartDate: businessStart, range: breakEvenMonthRange }) : 0
  const monthHistoricalMaintenanceRecovery = calculateHistoricalMaintenanceRecoveryForRange({ vehicles: snapshot?.vehicles || [], businessStartDate: businessStart, range: breakEvenMonthRange })
  const breakEven = deriveAuthoritativeBreakEven({ breakEvenInputs: snapshot?.breakEvenInputs || [], range: breakEvenMonthRange, loanScheduledObligation: monthScheduledEmi, preBusinessRecovery: monthPreBusinessRecovery, historicalMaintenanceRecovery: monthHistoricalMaintenanceRecovery, renewalProvision: monthlyBase.renewalProvision, fuelCostPerKm: monthlyEvidenceBase.breakEvenInputs?.fuelCostPerKm ?? monthlyEvidenceBase.fuelCostPerKm, fuelCostPerKmStatus: monthlyEvidenceBase.breakEvenInputs?.fuelEvidence?.status || CALCULATION_STATUS.UNAVAILABLE, vehicleKm: normalizedMonthlyKm, vehicleKmSource: normalizedMonthlyKmSource })
  const monthlyBreakEvenRevenue = breakEven.available ? breakEven.monthlyBreakEvenRevenue : NaN
  const breakEvenFuelCost = breakEven.available || breakEven.status === CALCULATION_STATUS.INDICATIVE
    ? Number(breakEven.fuelCostPerKm) * Number(breakEven.vehicleKm)
    : NaN
  const breakEvenMaintenanceProvision = breakEven.available || breakEven.status === CALCULATION_STATUS.INDICATIVE
    ? Number(breakEven.maintenanceProvisionPerKm) * Number(breakEven.vehicleKm)
    : NaN
  const breakEvenFinancialObligation = Number.isFinite(Number(monthScheduledEmi))
    ? Number(monthScheduledEmi) + Number(monthPreBusinessRecovery)
    : NaN
  const breakEvenComplianceProvision = Number(monthlyBase.renewalProvision)
  const breakEvenOtherRequired = Number(monthHistoricalMaintenanceRecovery)
  const authoritativeMaintenanceProvision = Number.isFinite(Number(base.maintenanceProvision)) ? Number(base.maintenanceProvision) : NaN
  const provisionRequired = Number.isFinite(authoritativeMaintenanceProvision) && Number.isFinite(Number(base.renewalProvision)) ? authoritativeMaintenanceProvision + Number(base.renewalProvision) : NaN
  const loanUnavailableReason = hasIncompleteActiveLoan ? 'INCOMPLETE_LOAN_INPUTS' : 'NO_ACTIVE_LOAN'
  const loanScheduledObligation = hasIncompleteActiveLoan ? NaN : currentScheduledEmi
  const actualLoanPaid = money(finance?.actualPaid)
  const actualPrepayment = money(finance?.actualPrepayment)
  const actualFinancingOutflow = money(finance?.actualFinancingOutflow)
  const availableCash = money(base.operatingProfit) - actualFinancingOutflow
  const loanProvisionForPeriod = finance && previousFinance ? Math.max(0, money(finance.provisionAccumulated) - money(previousFinance.provisionAccumulated)) : 0
  const totalIndicativeProvision = Number.isFinite(authoritativeMaintenanceProvision) && Number.isFinite(Number(base.renewalProvision)) ? loanProvisionForPeriod + authoritativeMaintenanceProvision + Number(base.renewalProvision) : NaN
  // Existing operating/indicative metrics remain authoritative for their original uses.
  // Performance headlines are separate presentation-level business-position metrics:
  // both explicitly include the full scheduled EMI for the selected period.
  const performanceActualProfit = Number.isFinite(Number(base.operatingProfit))
    ? Number(base.operatingProfit) - currentScheduledEmi
    : NaN
  const performanceProvisionalProfit = Number.isFinite(performanceActualProfit) && Number.isFinite(authoritativeMaintenanceProvision) && Number.isFinite(Number(base.renewalProvision))
    ? performanceActualProfit - authoritativeMaintenanceProvision - Number(base.renewalProvision) - preBusinessRecoveryForPeriod - historicalMaintenanceRecoveryForPeriod
    : NaN
  const actualProfit = base.operatingProfit
  const indicativeProfit = performanceProvisionalProfit
  return {
    ...base, performanceHeadlineActualProfit: performanceActualProfit, performanceHeadlineProvisionalProfit: performanceProvisionalProfit, performanceHeadlineScheduledEmi: currentScheduledEmi, preBusinessRecoveryMonthly, loanScheduledObligation, loanPrincipal: money(finance?.outstandingPrincipal), loanInterest: currentScheduledInterest, loanProvisionAccumulated: money(finance?.provisionAccumulated), loanProvisionBalance: money(finance?.provisionBalance), actualLoanPaid, actualPrepayment, actualFinancingOutflow, availableCash, cashSurplusAfterFinancing: availableCash, maintenanceProvision: authoritativeMaintenanceProvision, historicalMaintenanceRecoveryMonthly: historicalMaintenanceRecovery, historicalMaintenanceRecoveryForPeriod, preBusinessRecoveryForPeriod, provisionRequired, provisionSetAside: provisionRequired, loanProvisionForPeriod, totalIndicativeProvision, actualProfit, indicativeProfit, provisionAdjustedProfit: Number.isFinite(provisionRequired) ? base.operatingProfit - provisionRequired : NaN, monthlyBreakEvenRevenue, breakEvenRevenue: monthlyBreakEvenRevenue,
    breakEvenInputs: { ...(base.breakEvenInputs || {}), scheduledEmiMonthly: monthScheduledEmi, fixedCosts: breakEven.fixedCosts, maintenanceProvisionPerKm: breakEven.maintenanceProvisionPerKm ?? base.breakEvenInputs?.maintenanceProvisionPerKm, expectedMonthlyVehicleKm: Number.isFinite(configuredMonthlyKm) ? configuredMonthlyKm : null, vehicleKmBasis: breakEven.vehicleKm ?? null, vehicleKmBasisSource: breakEven.vehicleKmSource || normalizedMonthlyKmSource, normalizedMonthlyKmSource, preBusinessRecoveryMonthly: monthPreBusinessRecovery, historicalMaintenanceRecoveryMonthly: monthHistoricalMaintenanceRecovery, fuelCostPerKm: breakEven.fuelCostPerKm ?? base.breakEvenInputs?.fuelCostPerKm, fuelCostPerKmSource: base.breakEvenInputs?.fuelCostPerKmSource || null, fuelEvidence: base.breakEvenInputs?.fuelEvidence || null, fuelCostMonthly: breakEvenFuelCost, maintenanceProvisionMonthly: breakEvenMaintenanceProvision, financialObligationMonthly: breakEvenFinancialObligation, complianceProvisionMonthly: breakEvenComplianceProvision, otherRequiredMonthly: breakEvenOtherRequired },
    finance: { ...(finance || {}), available: !!finance?.available, reason: finance?.available ? null : loanUnavailableReason, annualInterestRatePercent: finance?.annualInterestRatePercent ?? null, preBusinessRecoveryMonthly, historicalMaintenanceRecoveryMonthly: historicalMaintenanceRecovery, historicalMaintenanceRecoveryForPeriod, businessStartDate: businessStart?.toISOString() || null, previousOutstandingPrincipal: previousFinance?.available ? previousFinance.outstandingPrincipal : null, overdueAmount: finance?.totalOverdue ?? 0, remainingInterest: finance?.remainingInterest ?? 0, scheduledFinalDate: finance?.scheduledFinalDate ?? null, totalInterest: finance?.totalInterest ?? 0 },
    authority: { ...(base.authority || {}), loan: 'CANONICAL_FINANCE_LOAN_ENGINE', breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN', breakEvenTrace: breakEven.trace || null, actualProfit: 'AUTHORITATIVE_REVENUE_MINUS_ACTUAL_OPERATING_EXPENSES', indicativeProfit: 'PROVISIONAL_PROFIT_AFTER_SCHEDULED_EMI_AND_NORMALIZED_HISTORICAL_RECOVERY' },
    completeness: { ...(base.completeness || {}), loan: !!finance?.available, breakEven: breakEven.available },
    calculationEvidence: { fuelCostPerKm: base.breakEvenInputs?.fuelEvidence || null, breakEven: breakEven.evidence || null },
    indicative: { monthlyBreakEvenRevenue: breakEven.indicativeMonthlyBreakEvenRevenue ?? null }, breakEvenTrace: breakEven.trace || null,
  }
}
