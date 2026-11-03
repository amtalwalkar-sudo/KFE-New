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
  scheduleWithTransactions(values = {}, transactions = []) {
    const base = this.schedule(values)
    if (!base.length) return []
    const rate = Number(values.annualInterestRatePercent) / 1200
    const emi = this.monthlyEmi(values)
    const prepayments = [...(transactions || [])].filter(item => item.type === 'PREPAYMENT').sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate)))
    const paidByInstallment = new Map((transactions || []).filter(item => item.type === 'EMI_PAYMENT').map(item => [Number(item.installment), item]))
    const applied = new Set()
    let balance = Number(values.principal)
    return base.map(row => {
      for (const item of prepayments) {
        if (!applied.has(item.id) && item.paymentDate <= row.dueDate) {
          balance = money(Math.max(0, balance - Number(item.amount || 0)))
          applied.add(item.id)
        }
      }
      const payment = paidByInstallment.get(row.installment)
      const interest = money(balance * rate)
      const amountPaid = payment ? Number(payment.amount) : emi
      const principalPaid = money(Math.min(balance, Math.max(0, amountPaid - interest)))
      const openingBalance = money(balance)
      balance = money(Math.max(0, balance - principalPaid))
      return { ...row, openingBalance, emi: money(amountPaid), interest, principal: principalPaid, closingBalance: balance, paid: !!payment, paymentDate: payment?.paymentDate || null }
    })
  },
  previewPrepayment(values = {}, transactions = [], { amount, paymentDate } = {}) {
    if (!validTerms(values) || !paymentDate || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Enter a valid prepayment amount and date.')
    const firstDate = values.firstEmiDueDate || values.startDate
    const baseSchedule = this.schedule(values)
    const priorEvents = (transactions || []).filter(item => item.paymentDate < paymentDate)
    const paidInstallments = new Set(priorEvents.filter(item => item.type === 'EMI_PAYMENT').map(item => Number(item.installment)).filter(Number.isInteger))
    const prepayments = priorEvents.filter(item => item.type === 'PREPAYMENT').sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate)))
    const payments = new Map(priorEvents.filter(item => item.type === 'EMI_PAYMENT').map(item => [Number(item.installment), item]))
    let outstanding = Number(values.principal), prepaymentIndex = 0
    for (const row of baseSchedule) {
      if (row.dueDate >= paymentDate) break
      while (prepaymentIndex < prepayments.length && prepayments[prepaymentIndex].paymentDate <= row.dueDate) {
        outstanding = money(Math.max(0, outstanding - Number(prepayments[prepaymentIndex].amount || 0)))
        prepaymentIndex++
      }
      const payment = payments.get(row.installment)
      if (payment) {
        const interest = money(outstanding * Number(values.annualInterestRatePercent) / 1200)
        outstanding = money(Math.max(0, outstanding - Math.max(0, Number(payment.amount) - interest)))
      }
    }
    while (prepaymentIndex < prepayments.length) {
      outstanding = money(Math.max(0, outstanding - Number(prepayments[prepaymentIndex].amount || 0)))
      prepaymentIndex++
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
