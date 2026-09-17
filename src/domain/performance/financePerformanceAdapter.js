import { derivePerformance as legacyDerivePerformance, previousRange as derivePreviousRange } from './performanceEngineV2.js'
import { deriveAuthoritativeBreakEven } from './authoritativeBreakEven.js'
import { deriveLoanPosition, calculatePreBusinessRecovery } from '../finance/loanEngine.js'
import { istMonthRange } from '../time/ist.js'

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const money = value => Number.isFinite(Number(value)) ? Number(value) : 0
const businessStartDate = snapshot => {
  const vehicles = live(snapshot?.vehicles).map(vehicle => dateOf(vehicle.acquiredOn)).filter(Boolean).sort((a, b) => a - b)
  return vehicles[0] || null
}
const asOf = range => dateOf(range?.to) || new Date()
const inRange = (value, range) => { const date = dateOf(value); return !!date && date >= range.from && date <= range.to }

export function deriveFinanceAwarePerformance(snapshot, range, previousPeriod) {
  const base = legacyDerivePerformance(snapshot, range, previousPeriod)
  const currentAsOf = asOf(range)
  const previousAsOf = asOf(previousPeriod)
  const loanRecords = live(snapshot?.loans)
  const paymentRecords = live(snapshot?.loanPayments)
  const prepaymentRecords = live(snapshot?.prepayments)
  const activeLoan = loanRecords
    .filter(loan => String(loan.status || '').toUpperCase() !== 'INACTIVE')
    .filter(loan => dateOf(loan.startDate) && dateOf(loan.startDate) <= currentAsOf)
    .filter(loan => Number.isFinite(Number(loan.principal)) && Number(loan.principal) > 0)
    .filter(loan => Number.isFinite(Number(loan.tenureMonths)) && Number(loan.tenureMonths) > 0)
    .sort((a, b) => (dateOf(b.startDate)?.getTime() || 0) - (dateOf(a.startDate)?.getTime() || 0))[0]

  if (!activeLoan) return { ...base, finance: { available: false, reason: 'NO_ACTIVE_LOAN' } }

  const finance = deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: currentAsOf })
  const previousFinance = deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: previousAsOf })
  const businessStart = businessStartDate(snapshot)
  const preBusinessRecoveryMonthly = calculatePreBusinessRecovery({ position: finance, businessStartDate: businessStart, asOf: currentAsOf })
  const currentScheduledEmi = finance.schedule.filter(row => inRange(row.dueDate, range)).reduce((sum, row) => sum + money(row.originalEmiAmount), 0)
  const currentScheduledInterest = finance.schedule.filter(row => inRange(row.dueDate, range)).reduce((sum, row) => sum + money(row.originalInterestComponent), 0)

  const breakEvenMonthRange = istMonthRange(range?.to) || range
  const monthlyBase = legacyDerivePerformance(snapshot, breakEvenMonthRange, derivePreviousRange(breakEvenMonthRange))
  const monthAsOf = asOf(breakEvenMonthRange)
  const monthFinance = deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: monthAsOf })
  const monthScheduledEmi = monthFinance.schedule
    .filter(row => inRange(row.dueDate, breakEvenMonthRange))
    .reduce((sum, row) => sum + money(row.originalEmiAmount), 0)
  const monthPreBusinessRecovery = calculatePreBusinessRecovery({ position: monthFinance, businessStartDate: businessStart, asOf: monthAsOf })
  const breakEven = deriveAuthoritativeBreakEven({
    breakEvenInputs: snapshot?.breakEvenInputs || [],
    range: breakEvenMonthRange,
    loanScheduledObligation: monthScheduledEmi + monthPreBusinessRecovery,
    renewalProvision: monthlyBase.renewalProvision,
    fuelCostPerKm: monthlyBase.breakEvenInputs?.fuelCostPerKm ?? monthlyBase.fuelCostPerKm,
    vehicleKm: monthlyBase.vehicleKm,
  })
  const monthlyBreakEvenRevenue = breakEven.available ? breakEven.monthlyBreakEvenRevenue : NaN

  const actualLoanPaid = money(finance.actualPaid)
  const actualPrepayment = money(finance.actualPrepayment)
  const actualFinancingOutflow = money(finance.actualFinancingOutflow)
  const availableCash = money(base.operatingProfit) - actualFinancingOutflow

  return {
    ...base,
    loanScheduledObligation: currentScheduledEmi,
    loanPrincipal: finance.outstandingPrincipal,
    loanInterest: currentScheduledInterest,
    actualLoanPaid,
    actualPrepayment,
    actualFinancingOutflow,
    availableCash,
    cashSurplusAfterFinancing: availableCash,
    monthlyBreakEvenRevenue,
    breakEvenRevenue: monthlyBreakEvenRevenue,
    breakEvenInputs: {
      ...(base.breakEvenInputs || {}),
      fixedCosts: breakEven.fixedCosts,
      preBusinessRecoveryMonthly: monthPreBusinessRecovery,
      fuelCostPerKm: breakEven.fuelCostPerKm,
    },
    finance: {
      ...finance,
      annualInterestRatePercent: 10,
      preBusinessRecoveryMonthly,
      businessStartDate: businessStart?.toISOString() || null,
      previousOutstandingPrincipal: previousFinance.available ? previousFinance.outstandingPrincipal : null,
      overdueAmount: finance.totalOverdue,
      remainingInterest: finance.remainingInterest,
      scheduledFinalDate: finance.scheduledFinalDate,
      totalInterest: finance.totalInterest,
    },
    authority: {
      ...(base.authority || {}),
      loan: 'CANONICAL_FINANCE_LOAN_ENGINE',
      breakEven: breakEven.available ? 'AUTHORITATIVE_MONTHLY_BREAK_EVEN' : base.authority?.breakEven,
    },
    completeness: {
      ...(base.completeness || {}),
      loan: finance.available,
      breakEven: breakEven.available,
    },
  }
}
