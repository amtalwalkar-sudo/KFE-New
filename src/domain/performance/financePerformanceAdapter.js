import { derivePerformance as deriveOperationalPerformance, previousRange as derivePreviousRange } from './performanceEngineV2.js'
import { CALCULATION_STATUS } from './calculationAuthority.js'
import { deriveAuthoritativeBreakEven } from './authoritativeBreakEven.js'
import { deriveLoanPosition, calculatePreBusinessLoanRecovery } from '../finance/loanEngine.js'
import { calculateHistoricalMaintenanceRecovery } from './performanceEngineV2.js'
import { istMonthRange } from '../time/ist.js'

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
  const fullMonthRange = istMonthRange(range?.to) || range
  const breakEvenMonthRange = fullMonthRange && fullMonthRange.to > currentAsOf ? { ...fullMonthRange, to: currentAsOf } : fullMonthRange
  const monthlyBase = deriveOperationalPerformance(snapshot, breakEvenMonthRange, derivePreviousRange(breakEvenMonthRange))
  const monthAsOf = asOf(breakEvenMonthRange)
  const monthFinance = activeLoan ? deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: monthAsOf }) : null
  const monthScheduledEmi = monthFinance?.schedule ? monthFinance.schedule.filter(row => inRange(row.dueDate, breakEvenMonthRange)).reduce((sum, row) => sum + money(row.originalEmiAmount), 0) : 0
  const monthPreBusinessRecovery = monthFinance ? calculatePreBusinessLoanRecovery({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, businessStartDate: businessStart, asOf: monthAsOf }) : 0
  const monthHistoricalMaintenanceRecovery = calculateHistoricalMaintenanceRecovery({ vehicles: snapshot?.vehicles || [], businessStartDate: businessStart, asOf: monthAsOf })
  const breakEven = deriveAuthoritativeBreakEven({ breakEvenInputs: snapshot?.breakEvenInputs || [], range: breakEvenMonthRange, loanScheduledObligation: monthScheduledEmi + monthPreBusinessRecovery + monthHistoricalMaintenanceRecovery, renewalProvision: monthlyBase.renewalProvision, fuelCostPerKm: monthlyBase.breakEvenInputs?.fuelCostPerKm ?? monthlyBase.fuelCostPerKm, fuelCostPerKmStatus: monthlyBase.breakEvenInputs?.fuelEvidence?.status || CALCULATION_STATUS.UNAVAILABLE, vehicleKm: monthlyBase.vehicleKm })
  const monthlyBreakEvenRevenue = breakEven.available ? breakEven.monthlyBreakEvenRevenue : NaN
  const authoritativeMaintenanceProvision = Number.isFinite(Number(base.maintenanceProvision)) ? Number(base.maintenanceProvision) : NaN
  const provisionRequired = Number.isFinite(authoritativeMaintenanceProvision) && Number.isFinite(Number(base.renewalProvision)) ? authoritativeMaintenanceProvision + Number(base.renewalProvision) : NaN
  const loanUnavailableReason = hasIncompleteActiveLoan ? 'INCOMPLETE_LOAN_INPUTS' : 'NO_ACTIVE_LOAN'
  const loanScheduledObligation = hasIncompleteActiveLoan ? NaN : currentScheduledEmi
  const actualLoanPaid = money(finance?.actualPaid)
  const actualPrepayment = money(finance?.actualPrepayment)
  const actualFinancingOutflow = money(finance?.actualFinancingOutflow)
  const availableCash = money(base.operatingProfit) - actualFinancingOutflow
  const loanProvisionForPeriod = finance && previousFinance ? Math.max(0, money(finance.provisionAccumulated) - money(previousFinance.provisionAccumulated)) : 0
  const totalIndicativeProvision = loanProvisionForPeriod + (Number.isFinite(authoritativeMaintenanceProvision) ? authoritativeMaintenanceProvision : 0) + (Number.isFinite(Number(base.renewalProvision)) ? Number(base.renewalProvision) : 0)
  const actualProfit = base.operatingProfit
  const indicativeProfit = Number.isFinite(Number(base.revenue)) ? Number(base.revenue) - totalIndicativeProvision : NaN
  return {
    ...base, loanScheduledObligation, loanPrincipal: money(finance?.outstandingPrincipal), loanInterest: currentScheduledInterest, loanProvisionAccumulated: money(finance?.provisionAccumulated), loanProvisionBalance: money(finance?.provisionBalance), actualLoanPaid, actualPrepayment, actualFinancingOutflow, availableCash, cashSurplusAfterFinancing: availableCash, maintenanceProvision: authoritativeMaintenanceProvision, historicalMaintenanceRecoveryMonthly: historicalMaintenanceRecovery, provisionRequired, provisionSetAside: provisionRequired, loanProvisionForPeriod, totalIndicativeProvision, actualProfit, indicativeProfit, provisionAdjustedProfit: Number.isFinite(provisionRequired) ? base.operatingProfit - provisionRequired : NaN, monthlyBreakEvenRevenue, breakEvenRevenue: monthlyBreakEvenRevenue,
    breakEvenInputs: { ...(base.breakEvenInputs || {}), fixedCosts: breakEven.fixedCosts, maintenanceProvisionPerKm: breakEven.maintenanceProvisionPerKm ?? base.breakEvenInputs?.maintenanceProvisionPerKm, preBusinessRecoveryMonthly: monthPreBusinessRecovery, fuelCostPerKm: breakEven.fuelCostPerKm ?? base.breakEvenInputs?.fuelCostPerKm, fuelCostPerKmSource: base.breakEvenInputs?.fuelCostPerKmSource || null, fuelEvidence: base.breakEvenInputs?.fuelEvidence || null },
    finance: { ...(finance || {}), available: !!finance?.available, reason: finance?.available ? null : loanUnavailableReason, annualInterestRatePercent: finance?.annualInterestRatePercent ?? null, preBusinessRecoveryMonthly, historicalMaintenanceRecoveryMonthly: historicalMaintenanceRecovery, businessStartDate: businessStart?.toISOString() || null, previousOutstandingPrincipal: previousFinance?.available ? previousFinance.outstandingPrincipal : null, overdueAmount: finance?.totalOverdue ?? 0, remainingInterest: finance?.remainingInterest ?? 0, scheduledFinalDate: finance?.scheduledFinalDate ?? null, totalInterest: finance?.totalInterest ?? 0 },
    authority: { ...(base.authority || {}), loan: 'CANONICAL_FINANCE_LOAN_ENGINE', breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN', breakEvenTrace: breakEven.trace || null, actualProfit: 'AUTHORITATIVE_REVENUE_MINUS_ACTUAL_OPERATING_EXPENSES', indicativeProfit: 'AUTHORITATIVE_REVENUE_MINUS_PERIOD_PROVISIONS' },
    completeness: { ...(base.completeness || {}), loan: !!finance?.available, breakEven: breakEven.available },
    calculationEvidence: { fuelCostPerKm: base.breakEvenInputs?.fuelEvidence || null, breakEven: breakEven.evidence || null },
    indicative: { monthlyBreakEvenRevenue: breakEven.indicativeMonthlyBreakEvenRevenue ?? null }, breakEvenTrace: breakEven.trace || null,
  }
}
