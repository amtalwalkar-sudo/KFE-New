import { derivePerformance as legacyDerivePerformance } from './performanceEngineV2.js'
import { deriveAuthoritativeBreakEven } from './authoritativeBreakEven.js'
import { deriveLoanPosition, calculatePreBusinessRecovery } from '../finance/loanEngine.js'

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const money = value => Number.isFinite(Number(value)) ? Number(value) : 0
const businessStartDate = snapshot => {
  const vehicles = live(snapshot?.vehicles).map(vehicle => dateOf(vehicle.acquiredOn)).filter(Boolean).sort((a, b) => a - b)
  return vehicles[0] || null
}
const asOf = range => dateOf(range?.to) || new Date()

export function deriveFinanceAwarePerformance(snapshot, range, previousRange) {
  const base = legacyDerivePerformance(snapshot, range, previousRange)
  const currentAsOf = asOf(range)
  const previousAsOf = asOf(previousRange)
  const loanRecords = live(snapshot?.loans)
  const paymentRecords = live(snapshot?.loanPayments)
  const prepaymentRecords = live(snapshot?.prepayments)
  const activeLoan = loanRecords
    .filter(loan => String(loan.status || '').toUpperCase() !== 'INACTIVE')
    .filter(loan => dateOf(loan.startDate) && dateOf(loan.startDate) <= currentAsOf)
    .sort((a, b) => (dateOf(b.startDate)?.getTime() || 0) - (dateOf(a.startDate)?.getTime() || 0))[0]

  if (!activeLoan) return { ...base, finance: { available: false, reason: 'NO_ACTIVE_LOAN' } }

  const finance = deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: currentAsOf })
  const previousFinance = deriveLoanPosition({ loan: activeLoan, payments: paymentRecords, prepayments: prepaymentRecords, asOf: previousAsOf })
  const preBusinessRecoveryMonthly = calculatePreBusinessRecovery({ position: finance, businessStartDate: businessStartDate(snapshot), asOf: currentAsOf })

  const breakEvenInputs = snapshot?.breakEvenInputs || []
  const fixedCosts = money(finance.scheduledDue) + preBusinessRecoveryMonthly + money(base.renewalProvision)
  const dynamicCosts = money(base.vehicleKm) * money(base.fuelCostPerKm) + money(base.vehicleKm) * money(base.breakEvenInputs?.maintenanceProvisionPerKm)
  const monthlyBreakEvenRevenue = fixedCosts + dynamicCosts
  const breakEvenAvailable = Number.isFinite(monthlyBreakEvenRevenue)
  const breakEven = deriveAuthoritativeBreakEven({
    breakEvenInputs,
    range,
    loanScheduledObligation: finance.scheduledDue + preBusinessRecoveryMonthly,
    renewalProvision: base.renewalProvision,
    fuelCostPerKm: base.breakEvenInputs?.fuelCostPerKm ?? base.fuelCostPerKm,
    vehicleKm: base.vehicleKm,
  })

  const actualLoanPaid = money(finance.actualPaid)
  const actualPrepayment = money(finance.actualPrepayment)
  const actualFinancingOutflow = money(finance.actualFinancingOutflow)
  const availableCash = money(base.operatingProfit) - actualFinancingOutflow

  return {
    ...base,
    loanScheduledObligation: finance.scheduledDue,
    loanPrincipal: finance.outstandingPrincipal,
    loanInterest: finance.scheduledInterest,
    actualLoanPaid,
    actualPrepayment,
    actualFinancingOutflow,
    availableCash,
    cashSurplusAfterFinancing: availableCash,
    monthlyBreakEvenRevenue: breakEvenAvailable ? monthlyBreakEvenRevenue : NaN,
    breakEvenRevenue: breakEvenAvailable ? monthlyBreakEvenRevenue : NaN,
    breakEvenInputs: {
      ...(base.breakEvenInputs || {}),
      fixedCosts,
      preBusinessRecoveryMonthly,
      fuelCostPerKm: base.breakEvenInputs?.fuelCostPerKm ?? base.fuelCostPerKm,
    },
    finance: {
      ...finance,
      annualInterestRatePercent: 10,
      preBusinessRecoveryMonthly,
      previousOutstandingPrincipal: previousFinance.available ? previousFinance.outstandingPrincipal : null,
      overdueAmount: finance.totalOverdue,
      remainingInterest: finance.remainingInterest,
      scheduledFinalDate: finance.scheduledFinalDate,
      totalInterest: finance.totalInterest,
    },
    authority: {
      ...(base.authority || {}),
      loan: 'CANONICAL_FINANCE_LOAN_ENGINE',
      breakEven: breakEvenAvailable ? 'CANONICAL_FINANCE_PLUS_AUTHORITATIVE_BREAK_EVEN' : base.authority?.breakEven,
    },
    completeness: {
      ...(base.completeness || {}),
      loan: finance.available,
      breakEven: breakEvenAvailable,
    },
  }
}
