import { calculateLoanEmi } from '../../domain/math/loan.js'
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const validTerms = values => Number.isFinite(Number(values?.principal)) && Number(values.principal) > 0 && Number.isInteger(Number(values?.tenureMonths)) && Number(values.tenureMonths) > 0 && Number.isFinite(Number(values?.annualInterestRatePercent)) && Number(values.annualInterestRatePercent) >= 0
const addMonths = (dateValue, count) => {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  const target = new Date(Date.UTC(year, month - 1 + count, 1))
  target.setUTCDate(Math.min(day, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()))
  return target.toISOString().slice(0, 10)
}
function buildSchedule({ principal, annualInterestRatePercent, tenureMonths, firstEmiDueDate, emiAmount }) {
  const rate = Number(annualInterestRatePercent) / 1200
  const contractualEmi = emiAmount ?? calculateLoanEmi({ principal, tenureMonths, annualInterestRatePercent })
  if (!Number.isFinite(contractualEmi) || contractualEmi <= 0) return []
  let balance = money(principal)
  const rows = []
  for (let month = 1; month <= Math.min(tenureMonths + 600, 1200) && balance > 0.005; month++) {
    const interest = money(balance * rate)
    const amount = money(Math.min(contractualEmi, balance + interest))
    const principalPaid = money(Math.min(balance, Math.max(0, amount - interest)))
    const openingBalance = balance
    balance = money(Math.max(0, balance - principalPaid))
    rows.push({ installment: month, dueDate: addMonths(firstEmiDueDate, month - 1), openingBalance, emi: amount, interest, principal: principalPaid, closingBalance: balance })
  }
  return rows
}
export const LoanCalculationService = Object.freeze({
  monthlyEmi(values = {}) {
    if (!validTerms(values)) return null
    return calculateLoanEmi({ principal: values.principal, tenureMonths: values.tenureMonths, annualInterestRatePercent: values.annualInterestRatePercent })
  },
  roundedPaymentAmount(values = {}) {
    const emi = this.monthlyEmi(values)
    return emi === null ? null : Math.round(emi)
  },
  schedule(values = {}, { principal = values.principal, tenureMonths = values.tenureMonths, firstEmiDueDate = values.firstEmiDueDate || values.startDate, emiAmount } = {}) {
    if (!validTerms({ ...values, principal, tenureMonths }) || !firstEmiDueDate) return []
    return buildSchedule({ principal: Number(principal), annualInterestRatePercent: Number(values.annualInterestRatePercent), tenureMonths: Number(tenureMonths), firstEmiDueDate, emiAmount })
  },
  previewPrepayment(values = {}, transactions = [], { amount, paymentDate } = {}) {
    if (!validTerms(values) || !paymentDate || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Enter a valid prepayment amount and date.')
    const firstDate = values.firstEmiDueDate || values.startDate
    const baseSchedule = this.schedule(values)
    const priorPayments = (transactions || []).filter(item => item.type === 'EMI_PAYMENT' && item.paymentDate < paymentDate)
    const paidInstallments = new Set(priorPayments.map(item => Number(item.installment)).filter(Number.isInteger))
    let outstanding = Number(values.principal)
    for (const row of baseSchedule) {
      if (row.dueDate >= paymentDate) break
      if (paidInstallments.has(row.installment)) outstanding = money(Math.max(0, outstanding - row.principal))
    }
    const outstandingBefore = money(outstanding)
    const prepayment = money(Math.min(Number(amount), outstandingBefore))
    const outstandingAfter = money(Math.max(0, outstandingBefore - prepayment))
    const emi = this.monthlyEmi(values)
    const remainingMonths = Math.max(1, Number(values.tenureMonths) - paidInstallments.size)
    const nextDueDate = addMonths(firstDate, paidInstallments.size)
    const revisedSchedule = outstandingAfter > 0 ? this.schedule(values, { principal: outstandingAfter, tenureMonths: remainingMonths, firstEmiDueDate: nextDueDate, emiAmount: emi }) : []
    const originalRemaining = this.schedule(values, { principal: outstandingBefore, tenureMonths: remainingMonths, firstEmiDueDate: nextDueDate, emiAmount: emi })
    const interestBefore = money(originalRemaining.reduce((sum, row) => sum + row.interest, 0))
    const interestAfter = money(revisedSchedule.reduce((sum, row) => sum + row.interest, 0))
    return { paymentDate, amount: prepayment, outstandingBefore, outstandingAfter, interestBefore, interestAfter, interestSaved: money(Math.max(0, interestBefore - interestAfter)), remainingMonthsBefore: originalRemaining.length, remainingMonthsAfter: revisedSchedule.length, monthsReduced: Math.max(0, originalRemaining.length - revisedSchedule.length), revisedSchedule, emiAmount: emi }
  },
})
