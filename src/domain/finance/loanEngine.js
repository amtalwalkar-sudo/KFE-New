const DAYS_IN_YEAR = 365

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0
const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const roundMoney = value => Math.round(finite(value) * 100) / 100
const dayCount = (from, to) => Math.max(0, Math.ceil((to - from) / 86400000))
const overdueDayCount = (from, to) => Math.max(0, Math.ceil((to - from) / 86400000))
const addMonths = (date, months) => { const result = new Date(date); const day = result.getDate(); result.setDate(1); result.setMonth(result.getMonth() + months); const last = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate(); result.setDate(Math.min(day, last)); return result }
const annualRateForLoan = loan => Math.max(0, finite(loan?.annualInterestRatePercent)) / 100

export function calculateEmi(principal, tenureMonths, annualInterestRatePercent) {
  const P = Math.max(0, finite(principal))
  const T = Math.max(1, Math.floor(finite(tenureMonths)))
  const annualRate = Math.max(0, finite(annualInterestRatePercent)) / 100
  if (!P) return 0
  if (!Number.isFinite(Number(annualInterestRatePercent))) throw new Error('Loan annual interest rate is required to calculate EMI.')
  const monthlyRate = annualRate / 12
  if (!monthlyRate) return roundMoney(P / T)
  const emi = P * monthlyRate * Math.pow(1 + monthlyRate, T) / (Math.pow(1 + monthlyRate, T) - 1)
  return roundMoney(emi)
}

function prepaymentsBeforeOrOn(prepayments, loanId, date) {
  const boundary = dateOf(date)?.getTime() ?? Infinity
  return live(prepayments)
    .filter(record => record.loanId === loanId && String(record.status || '').toLowerCase() === 'applied')
    .filter(record => (dateOf(record.paidOn)?.getTime() ?? Infinity) <= boundary)
    .sort((a, b) => (dateOf(a.paidOn)?.getTime() ?? 0) - (dateOf(b.paidOn)?.getTime() ?? 0))
}

function scheduleWithPrepayments(loan, prepayments = [], asOf = null) {
  const principal = Math.max(0, finite(loan.principal))
  const tenure = Math.max(1, Math.floor(finite(loan.tenureMonths)))
  const annualRate = annualRateForLoan(loan)
  const start = dateOf(loan.startDate)
  if (!principal || !start) return []
  const emi = calculateEmi(principal, tenure, loan.annualInterestRatePercent)
  const rows = []
  let openingPrincipal = principal
  let previousDate = start
  let sequence = 1
  const loanPrepayments = prepaymentsBeforeOrOn(prepayments, loan.id, asOf || new Date('9999-12-31T23:59:59Z'))

  while (sequence <= tenure + 120 && openingPrincipal > 0.005) {
    const dueDate = addMonths(previousDate, 1)
    const periodEnd = dueDate
    const applicablePrepayments = loanPrepayments.filter(record => {
      const paidOn = dateOf(record.paidOn)
      return paidOn && paidOn > previousDate && paidOn <= periodEnd
    })

    let interest = 0
    let segmentStart = previousDate
    let segmentPrincipal = openingPrincipal
    for (const prepayment of applicablePrepayments) {
      const paidOn = dateOf(prepayment.paidOn)
      interest += segmentPrincipal * annualRate * dayCount(segmentStart, paidOn) / DAYS_IN_YEAR
      segmentPrincipal = Math.max(0, segmentPrincipal - finite(prepayment.amount))
      segmentStart = paidOn
    }
    interest += segmentPrincipal * annualRate * dayCount(segmentStart, periodEnd) / DAYS_IN_YEAR

    const scheduledInterest = roundMoney(interest)
    const scheduledPrincipal = roundMoney(Math.min(segmentPrincipal, Math.max(0, emi - scheduledInterest)))
    const scheduledAmount = roundMoney(Math.min(segmentPrincipal + scheduledInterest, emi))
    const prepaymentAmount = roundMoney(applicablePrepayments.reduce((sum, record) => sum + finite(record.amount), 0))
    const closingPrincipal = roundMoney(Math.max(0, segmentPrincipal - scheduledPrincipal))

    rows.push({
      id: `${loan.id}:emi:${sequence}`,
      loanId: loan.id,
      emiNumber: sequence,
      dueDate: dueDate.toISOString(),
      originalEmiAmount: scheduledAmount,
      originalPrincipalComponent: scheduledPrincipal,
      originalInterestComponent: scheduledInterest,
      openingPrincipal: roundMoney(openingPrincipal),
      closingPrincipal,
      prepaymentApplied: prepaymentAmount,
    })

    openingPrincipal = closingPrincipal
    previousDate = dueDate
    sequence += 1
  }
  return rows
}

function allocationState(schedule, payments, asOf, annualRate) {
  const rows = schedule.map(row => ({
    ...row,
    paidAmount: 0,
    overdueInterestPaid: 0,
    scheduledInterestPaid: 0,
    scheduledPrincipalPaid: 0,
    allocations: [],
  }))
  const orderedPayments = live(payments)
    .filter(payment => payment.loanId === schedule[0]?.loanId && String(payment.status || '').toLowerCase() !== 'reversed')
    .filter(payment => dateOf(payment.paidOn))
    .sort((a, b) => (dateOf(a.paidOn)?.getTime() ?? 0) - (dateOf(b.paidOn)?.getTime() ?? 0) || String(a.id).localeCompare(String(b.id)))

  for (const payment of orderedPayments) {
    let remaining = finite(payment.amount)
    const paymentDate = dateOf(payment.paidOn)
    if (!paymentDate || remaining <= 0) continue
    for (const row of rows) {
      if (remaining <= 0 || dateOf(row.dueDate) > paymentDate) continue
      const unpaidInterest = Math.max(0, row.originalInterestComponent - row.scheduledInterestPaid)
      const unpaidPrincipal = Math.max(0, row.originalPrincipalComponent - row.scheduledPrincipalPaid)
      const overdueDays = overdueDayCount(dateOf(row.dueDate), paymentDate)
      const additionalOverdueInterest = roundMoney(unpaidInterest * annualRate * overdueDays / DAYS_IN_YEAR)
      const alreadyOverduePaid = row.overdueInterestPaid
      const overdueDue = Math.max(0, additionalOverdueInterest - alreadyOverduePaid)
      const overdueInterest = Math.min(remaining, overdueDue)
      remaining = roundMoney(remaining - overdueInterest)
      row.overdueInterestPaid = roundMoney(row.overdueInterestPaid + overdueInterest)

      const interest = Math.min(remaining, unpaidInterest)
      remaining = roundMoney(remaining - interest)
      row.scheduledInterestPaid = roundMoney(row.scheduledInterestPaid + interest)

      const principal = Math.min(remaining, unpaidPrincipal)
      remaining = roundMoney(remaining - principal)
      row.scheduledPrincipalPaid = roundMoney(row.scheduledPrincipalPaid + principal)
      row.paidAmount = roundMoney(row.paidAmount + overdueInterest + interest + principal)
      row.allocations.push({ paymentId: payment.id, paidOn: payment.paidOn, overdueInterest, scheduledInterest: interest, scheduledPrincipal: principal })
    }
    if (remaining > 0.005) {
      const error = new Error(`Loan payment ${payment.id} exceeds all currently payable EMI obligations. Record the excess as a separate prepayment after overdue obligations are settled.`)
      error.code = 'PAYMENT_EXCEEDS_EMI_OBLIGATIONS'
      throw error
    }
  }

  return rows
}

export function deriveLoanPosition({ loan, payments = [], prepayments = [], asOf = new Date() } = {}) {
  if (!loan || !dateOf(loan.startDate)) return { available: false, reason: 'INVALID_LOAN' }
  const effectiveAsOf = dateOf(asOf) || new Date()
  const annualRate = annualRateForLoan(loan)
  const annualInterestRatePercent = annualRate * 100
  const schedule = scheduleWithPrepayments(loan, prepayments, effectiveAsOf)
  const obligations = allocationState(schedule, payments, effectiveAsOf, annualRate)
  const overdue = obligations
    .filter(row => dateOf(row.dueDate) <= effectiveAsOf)
    .map(row => {
      const unpaidInterest = Math.max(0, row.originalInterestComponent - row.scheduledInterestPaid)
      const unpaidPrincipal = Math.max(0, row.originalPrincipalComponent - row.scheduledPrincipalPaid)
      const overdueDays = overdueDayCount(dateOf(row.dueDate), effectiveAsOf)
      const additionalOverdueInterest = roundMoney(unpaidInterest * annualRate * overdueDays / DAYS_IN_YEAR)
      const unpaidOverdueInterest = Math.max(0, additionalOverdueInterest - row.overdueInterestPaid)
      return { ...row, overdueDays, additionalOverdueInterest, unpaidPrincipal, unpaidScheduledInterest: unpaidInterest, overdueAmount: roundMoney(unpaidPrincipal + unpaidInterest + unpaidOverdueInterest) }
    })
    .filter(row => row.overdueAmount > 0.005)

  const scheduledDue = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + row.originalEmiAmount, 0)
  const actualPaid = live(payments).filter(payment => payment.loanId === loan.id && String(payment.status || '').toLowerCase() !== 'reversed' && dateOf(payment.paidOn) <= effectiveAsOf).reduce((sum, payment) => sum + finite(payment.amount), 0)
  const actualPrepayment = live(prepayments).filter(payment => payment.loanId === loan.id && String(payment.status || '').toLowerCase() === 'applied' && dateOf(payment.paidOn) <= effectiveAsOf).reduce((sum, payment) => sum + finite(payment.amount), 0)
  const scheduledInterest = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + row.originalInterestComponent, 0)
  const scheduledPrincipal = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + row.originalPrincipalComponent, 0)
  const paidPrincipal = obligations.reduce((sum, row) => sum + row.scheduledPrincipalPaid, 0)
  const outstandingPrincipal = Math.max(0, roundMoney((schedule[0]?.openingPrincipal || finite(loan.principal)) - paidPrincipal - actualPrepayment))
  const totalOverdue = roundMoney(overdue.reduce((sum, row) => sum + row.overdueAmount, 0))
  const totalRemainingInterest = roundMoney(obligations.reduce((sum, row) => sum + Math.max(0, row.originalInterestComponent - row.scheduledInterestPaid), 0))
  return {
    available: true,
    annualInterestRatePercent,
    emi: calculateEmi(loan.principal, loan.tenureMonths, loan.annualInterestRatePercent),
    schedule: obligations,
    overdue,
    totalOverdue,
    scheduledDue,
    scheduledInterest,
    scheduledPrincipal,
    actualPaid,
    actualPrepayment,
    actualFinancingOutflow: roundMoney(actualPaid + actualPrepayment),
    outstandingPrincipal: roundMoney(outstandingPrincipal),
    remainingInterest: totalRemainingInterest,
    scheduledFinalDate: schedule.at(-1)?.dueDate || null,
    totalInterest: roundMoney(schedule.reduce((sum, row) => sum + row.originalInterestComponent, 0)),
  }
}

export function calculatePrepaymentEstimate({ loan, payments = [], prepayments = [], amount = 0, paidOn = new Date() } = {}) {
  const position = deriveLoanPosition({ loan, payments, prepayments, asOf: paidOn })
  if (!position.available) return { available: false, reason: position.reason }
  if (position.totalOverdue > 0.005) return { available: false, reason: 'OVERDUE_EMI_MUST_BE_SETTLED_FIRST', overdueAmount: position.totalOverdue }
  const requested = Math.max(0, finite(amount))
  const applied = Math.min(requested, position.outstandingPrincipal)
  return { available: true, requestedAmount: roundMoney(requested), appliedAmount: roundMoney(applied), outstandingBefore: position.outstandingPrincipal, outstandingAfter: roundMoney(position.outstandingPrincipal - applied), closesLoan: applied >= position.outstandingPrincipal - 0.005, effect: applied >= position.outstandingPrincipal - 0.005 ? 'CLOSE_LOAN' : 'REDUCE_TENURE_KEEP_EMI', prepaymentCharge: 0 }
}

export function calculatePreBusinessRecovery({ position, businessStartDate, asOf = new Date() } = {}) {
  const start = dateOf(businessStartDate)
  if (!position?.available || !start) return 0
  const asOfDate = dateOf(asOf) || new Date()
  const preBusinessOverdue = (position.overdue || []).filter(row => dateOf(row.dueDate) < start && dateOf(row.dueDate) <= asOfDate)
  const burden = preBusinessOverdue.reduce((sum, row) => sum + row.overdueAmount, 0)
  return roundMoney(burden / 12)
}

export function paymentAllocationPreview({ loan, payments = [], prepayments = [], amount, paidOn } = {}) {
  const position = deriveLoanPosition({ loan, payments, prepayments, asOf: paidOn })
  if (!position.available) return { available: false, reason: position.reason }
  const target = Math.max(0, finite(amount))
  let remaining = target
  const allocations = []
  for (const row of position.overdue) {
    if (remaining <= 0) break
    const overdue = Math.min(remaining, Math.max(0, row.overdueAmount - row.unpaidPrincipal - row.unpaidScheduledInterest))
    remaining = roundMoney(remaining - overdue)
    const interest = Math.min(remaining, row.unpaidScheduledInterest)
    remaining = roundMoney(remaining - interest)
    const principal = Math.min(remaining, row.unpaidPrincipal)
    remaining = roundMoney(remaining - principal)
    allocations.push({ obligationId: row.id, overdueInterest: overdue, scheduledInterest: interest, scheduledPrincipal: principal })
  }
  if (remaining > 0.005) return { available: false, reason: 'PAYMENT_EXCEEDS_EMI_OBLIGATIONS' }
  return { available: true, allocations, allocatedAmount: roundMoney(target - remaining) }
}
