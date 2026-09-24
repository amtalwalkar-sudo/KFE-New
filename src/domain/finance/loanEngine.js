const DAYS_IN_YEAR = 365
const KFE_TIME_ZONE = 'Asia/Kolkata'

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0
const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }

const rupeesToPaise = value => Math.round(finite(value) * 100)
const paiseToRupees = value => finite(value) / 100
const roundPaise = value => Math.round(finite(value))

const istCalendarParts = value => {
  const date = dateOf(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KFE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = type => Number(parts.find(part => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

// KFE interest accrues by calendar-day count in IST, not elapsed 24-hour
// periods. The end calendar date is counted only when it differs from the
// start date. JavaScript's proleptic Gregorian calendar handles leap years.
const calendarDaySerial = value => {
  const parts = istCalendarParts(value)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000 : null
}
const calendarDayCount = (from, to) => {
  const start = calendarDaySerial(from)
  const end = calendarDaySerial(to)
  return start == null || end == null ? 0 : Math.max(0, Math.round(end - start))
}
const dayCount = calendarDayCount
const overdueDayCount = calendarDayCount

const addMonths = (date, months) => {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const last = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, last))
  return result
}
const annualRateForLoan = loan => Math.max(0, finite(loan?.annualInterestRatePercent)) / 100

export function calculateEmi(principal, tenureMonths, annualInterestRatePercent) {
  const principalPaise = Math.max(0, rupeesToPaise(principal))
  const T = Math.max(1, Math.floor(finite(tenureMonths)))
  const annualRate = Math.max(0, finite(annualInterestRatePercent)) / 100
  if (!principalPaise) return 0
  if (!Number.isFinite(Number(annualInterestRatePercent))) throw new Error('Loan annual interest rate is required to calculate EMI.')
  const monthlyRate = annualRate / 12
  if (!monthlyRate) return paiseToRupees(roundPaise(principalPaise / T))
  const emiPaise = principalPaise * monthlyRate * Math.pow(1 + monthlyRate, T) / (Math.pow(1 + monthlyRate, T) - 1)
  return paiseToRupees(roundPaise(emiPaise))
}

function prepaymentsBeforeOrOn(prepayments, loanId, date) {
  const boundary = dateOf(date)?.getTime() ?? Infinity
  return live(prepayments)
    .filter(record => record.loanId === loanId && String(record.status || '').toLowerCase() === 'applied')
    .filter(record => (dateOf(record.paidOn)?.getTime() ?? Infinity) <= boundary)
    .sort((a, b) => (dateOf(a.paidOn)?.getTime() ?? 0) - (dateOf(b.paidOn)?.getTime() ?? 0))
}

function scheduleWithPrepayments(loan, prepayments = [], asOf = null) {
  const principalPaise = Math.max(0, rupeesToPaise(loan.principal))
  const tenure = Math.max(1, Math.floor(finite(loan.tenureMonths)))
  const annualRate = annualRateForLoan(loan)
  const start = dateOf(loan.startDate)
  if (!principalPaise || !start) return []
  const emiPaise = rupeesToPaise(calculateEmi(loan.principal, tenure, loan.annualInterestRatePercent))
  const rows = []
  let openingPrincipalPaise = principalPaise
  let previousDate = start
  let sequence = 1
  const loanPrepayments = prepaymentsBeforeOrOn(prepayments, loan.id, asOf || new Date('9999-12-31T23:59:59Z'))

  while (sequence <= tenure + 120 && openingPrincipalPaise > 0) {
    const dueDate = addMonths(previousDate, 1)
    const periodEnd = dueDate
    const applicablePrepayments = loanPrepayments.filter(record => {
      const paidOn = dateOf(record.paidOn)
      return paidOn && paidOn > previousDate && paidOn <= periodEnd
    })

    let interestPaise = 0
    let segmentStart = previousDate
    let segmentPrincipalPaise = openingPrincipalPaise
    for (const prepayment of applicablePrepayments) {
      const paidOn = dateOf(prepayment.paidOn)
      interestPaise += roundPaise(segmentPrincipalPaise * annualRate * dayCount(segmentStart, paidOn) / DAYS_IN_YEAR)
      segmentPrincipalPaise = Math.max(0, segmentPrincipalPaise - rupeesToPaise(prepayment.amount))
      segmentStart = paidOn
    }
    interestPaise += roundPaise(segmentPrincipalPaise * annualRate * dayCount(segmentStart, periodEnd) / DAYS_IN_YEAR)

    const scheduledInterestPaise = interestPaise
    const scheduledPrincipalPaise = Math.min(segmentPrincipalPaise, Math.max(0, emiPaise - scheduledInterestPaise))
    const scheduledAmountPaise = Math.min(segmentPrincipalPaise + scheduledInterestPaise, emiPaise)
    const prepaymentAmountPaise = applicablePrepayments.reduce((sum, record) => sum + rupeesToPaise(record.amount), 0)
    const closingPrincipalPaise = Math.max(0, segmentPrincipalPaise - scheduledPrincipalPaise)

    rows.push({
      periodStart: previousDate.toISOString(),
      id: `${loan.id}:emi:${sequence}`,
      loanId: loan.id,
      emiNumber: sequence,
      dueDate: dueDate.toISOString(),
      originalEmiAmount: paiseToRupees(scheduledAmountPaise),
      originalPrincipalComponent: paiseToRupees(scheduledPrincipalPaise),
      originalInterestComponent: paiseToRupees(scheduledInterestPaise),
      openingPrincipal: paiseToRupees(openingPrincipalPaise),
      closingPrincipal: paiseToRupees(closingPrincipalPaise),
      prepaymentApplied: paiseToRupees(prepaymentAmountPaise),
    })

    openingPrincipalPaise = closingPrincipalPaise
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
    .filter(payment => dateOf(payment.paidOn).getTime() <= (dateOf(asOf)?.getTime() ?? Infinity))
    .sort((a, b) => (dateOf(a.paidOn)?.getTime() ?? 0) - (dateOf(b.paidOn)?.getTime() ?? 0) || String(a.id).localeCompare(String(b.id)))

  for (const payment of orderedPayments) {
    let remainingPaise = rupeesToPaise(payment.amount)
    const paymentDate = dateOf(payment.paidOn)
    if (!paymentDate || remainingPaise <= 0) continue
    for (const row of rows) {
      if (remainingPaise <= 0 || dateOf(row.dueDate) > paymentDate) continue
      const unpaidInterestPaise = Math.max(0, rupeesToPaise(row.originalInterestComponent) - rupeesToPaise(row.scheduledInterestPaid))
      const unpaidPrincipalPaise = Math.max(0, rupeesToPaise(row.originalPrincipalComponent) - rupeesToPaise(row.scheduledPrincipalPaid))
      const overdueDays = overdueDayCount(dateOf(row.dueDate), paymentDate)
      const additionalOverdueInterestPaise = roundPaise(unpaidInterestPaise * annualRate * overdueDays / DAYS_IN_YEAR)
      const alreadyOverduePaidPaise = rupeesToPaise(row.overdueInterestPaid)
      const overdueDuePaise = Math.max(0, additionalOverdueInterestPaise - alreadyOverduePaidPaise)
      const overdueInterestPaise = Math.min(remainingPaise, overdueDuePaise)
      remainingPaise -= overdueInterestPaise
      row.overdueInterestPaid = paiseToRupees(alreadyOverduePaidPaise + overdueInterestPaise)

      const interestPaise = Math.min(remainingPaise, unpaidInterestPaise)
      remainingPaise -= interestPaise
      row.scheduledInterestPaid = paiseToRupees(rupeesToPaise(row.scheduledInterestPaid) + interestPaise)

      const principalPaise = Math.min(remainingPaise, unpaidPrincipalPaise)
      remainingPaise -= principalPaise
      row.scheduledPrincipalPaid = paiseToRupees(rupeesToPaise(row.scheduledPrincipalPaid) + principalPaise)
      row.paidAmount = paiseToRupees(rupeesToPaise(row.paidAmount) + overdueInterestPaise + interestPaise + principalPaise)
      row.allocations.push({ paymentId: payment.id, paidOn: payment.paidOn, overdueInterest: paiseToRupees(overdueInterestPaise), scheduledInterest: paiseToRupees(interestPaise), scheduledPrincipal: paiseToRupees(principalPaise) })
    }
    if (remainingPaise > 0) {
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
      const unpaidInterestPaise = Math.max(0, rupeesToPaise(row.originalInterestComponent) - rupeesToPaise(row.scheduledInterestPaid))
      const unpaidPrincipalPaise = Math.max(0, rupeesToPaise(row.originalPrincipalComponent) - rupeesToPaise(row.scheduledPrincipalPaid))
      const overdueDays = overdueDayCount(dateOf(row.dueDate), effectiveAsOf)
      const additionalOverdueInterestPaise = roundPaise(unpaidInterestPaise * annualRate * overdueDays / DAYS_IN_YEAR)
      const unpaidOverdueInterestPaise = Math.max(0, additionalOverdueInterestPaise - rupeesToPaise(row.overdueInterestPaid))
      const overdueAmountPaise = unpaidPrincipalPaise + unpaidInterestPaise + unpaidOverdueInterestPaise
      return { ...row, overdueDays, additionalOverdueInterest: paiseToRupees(additionalOverdueInterestPaise), unpaidOverdueInterest: paiseToRupees(unpaidOverdueInterestPaise), unpaidPrincipal: paiseToRupees(unpaidPrincipalPaise), unpaidScheduledInterest: paiseToRupees(unpaidInterestPaise), overdueAmount: paiseToRupees(overdueAmountPaise) }
    })
    .filter(row => rupeesToPaise(row.overdueAmount) > 0)

  const scheduledDuePaise = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + rupeesToPaise(row.originalEmiAmount), 0)
  // EMI is a fixed-validity obligation. Accrue its daily share across every
  // calendar day in each EMI period, including holidays/non-working days.
  const provisionAccumulatedPaise = obligations.reduce((sum, row) => {
    const start = dateOf(row.periodStart)
    const due = dateOf(row.dueDate)
    if (!start || !due || effectiveAsOf < start) return sum
    const end = effectiveAsOf < due ? effectiveAsOf : due
    const totalDays = Math.max(1, calendarDayCount(start, due) + 1)
    const elapsedDays = Math.max(0, Math.min(totalDays, calendarDayCount(start, end) + 1))
    return sum + Math.round(rupeesToPaise(row.originalEmiAmount) * elapsedDays / totalDays)
  }, 0)
  const actualPaidPaise = live(payments).filter(payment => payment.loanId === loan.id && String(payment.status || '').toLowerCase() !== 'reversed' && dateOf(payment.paidOn) <= effectiveAsOf).reduce((sum, payment) => sum + rupeesToPaise(payment.amount), 0)
  const actualPrepaymentPaise = live(prepayments).filter(payment => payment.loanId === loan.id && String(payment.status || '').toLowerCase() === 'applied' && dateOf(payment.paidOn) <= effectiveAsOf).reduce((sum, payment) => sum + rupeesToPaise(payment.amount), 0)
  const loanProvisionBalancePaise = provisionAccumulatedPaise - actualPaidPaise
  const scheduledInterestPaise = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + rupeesToPaise(row.originalInterestComponent), 0)
  const scheduledPrincipalPaise = obligations.filter(row => dateOf(row.dueDate) <= effectiveAsOf).reduce((sum, row) => sum + rupeesToPaise(row.originalPrincipalComponent), 0)
  const paidPrincipalPaise = obligations.reduce((sum, row) => sum + rupeesToPaise(row.scheduledPrincipalPaid), 0)
  const outstandingPrincipalPaise = Math.max(0, rupeesToPaise(schedule[0]?.openingPrincipal || loan.principal) - paidPrincipalPaise - actualPrepaymentPaise)
  const totalOverduePaise = overdue.reduce((sum, row) => sum + rupeesToPaise(row.overdueAmount), 0)
  const totalRemainingInterestPaise = obligations.reduce((sum, row) => sum + Math.max(0, rupeesToPaise(row.originalInterestComponent) - rupeesToPaise(row.scheduledInterestPaid)), 0)

  return {
    available: true,
    annualInterestRatePercent,
    emi: calculateEmi(loan.principal, loan.tenureMonths, loan.annualInterestRatePercent),
    schedule: obligations,
    overdue,
    totalOverdue: paiseToRupees(totalOverduePaise),
    scheduledDue: paiseToRupees(scheduledDuePaise),
    scheduledInterest: paiseToRupees(scheduledInterestPaise),
    scheduledPrincipal: paiseToRupees(scheduledPrincipalPaise),
    actualPaid: paiseToRupees(actualPaidPaise),
    actualPrepayment: paiseToRupees(actualPrepaymentPaise),
    actualFinancingOutflow: paiseToRupees(actualPaidPaise + actualPrepaymentPaise),
    provisionAccumulated: paiseToRupees(provisionAccumulatedPaise),
    provisionBalance: paiseToRupees(loanProvisionBalancePaise),
    outstandingPrincipal: paiseToRupees(outstandingPrincipalPaise),
    remainingInterest: paiseToRupees(totalRemainingInterestPaise),
    scheduledFinalDate: schedule.at(-1)?.dueDate || null,
    totalInterest: paiseToRupees(schedule.reduce((sum, row) => sum + rupeesToPaise(row.originalInterestComponent), 0)),
  }
}

export function calculatePrepaymentEstimate({ loan, payments = [], prepayments = [], amount = 0, paidOn = new Date() } = {}) {
  const position = deriveLoanPosition({ loan, payments, prepayments, asOf: paidOn })
  if (!position.available) return { available: false, reason: position.reason }
  if (rupeesToPaise(position.totalOverdue) > 0) return { available: false, reason: 'OVERDUE_EMI_MUST_BE_SETTLED_FIRST', overdueAmount: position.totalOverdue }
  const requestedPaise = Math.max(0, rupeesToPaise(amount))
  const outstandingPaise = rupeesToPaise(position.outstandingPrincipal)
  const appliedPaise = Math.min(requestedPaise, outstandingPaise)
  return { available: true, requestedAmount: paiseToRupees(requestedPaise), appliedAmount: paiseToRupees(appliedPaise), outstandingBefore: position.outstandingPrincipal, outstandingAfter: paiseToRupees(outstandingPaise - appliedPaise), closesLoan: appliedPaise >= outstandingPaise, effect: appliedPaise >= outstandingPaise ? 'CLOSE_LOAN' : 'REDUCE_TENURE_KEEP_EMI', prepaymentCharge: 0 }
}

const calendarRecoverySerial = value => {
  const parts = istCalendarParts(value)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000 : null
}
const addRecoveryMonths = (value, months) => {
  const parts = istCalendarParts(value)
  if (!parts) return null
  const index = parts.year * 12 + (parts.month - 1) + months
  const year = Math.floor(index / 12)
  const month = index % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(parts.day, lastDay)) / 86400000
}
const recoveryMonthlyAmount = (burdenPaise, businessStartDate, asOf, months = 12) => {
  const start = calendarRecoverySerial(businessStartDate)
  const current = calendarRecoverySerial(asOf)
  const end = addRecoveryMonths(businessStartDate, months)
  if (start == null || current == null || end == null || current < start || current >= end) return 0
  return paiseToRupees(Math.round(burdenPaise / months))
}
export function calculatePreBusinessLoanRecovery({ loan, payments = [], prepayments = [], businessStartDate, asOf = new Date(), recoveryMonths = 12 } = {}) {
  const start = dateOf(businessStartDate)
  const origin = dateOf(loan?.startDate)
  if (!loan || !start || !origin || origin >= start) return 0
  const positionAtStart = deriveLoanPosition({ loan, payments, prepayments, asOf: start })
  if (!positionAtStart.available) return 0
  const burdenPaise = rupeesToPaise(positionAtStart.outstandingPrincipal) + rupeesToPaise(positionAtStart.totalOverdue)
  return recoveryMonthlyAmount(burdenPaise, businessStartDate, asOf, recoveryMonths)
}
export function calculatePreBusinessRecovery({ position, businessStartDate, asOf = new Date() } = {}) {
  if (!position?.available || !businessStartDate) return 0
  const start = dateOf(businessStartDate)
  const preBusinessOverdue = (position.overdue || []).filter(row => dateOf(row.dueDate) < start)
  const burdenPaise = preBusinessOverdue.reduce((sum, row) => sum + rupeesToPaise(row.overdueAmount), 0)
  return recoveryMonthlyAmount(burdenPaise, businessStartDate, asOf, 12)
}

export function paymentAllocationPreview({ loan, payments = [], prepayments = [], amount, paidOn } = {}) {
  const position = deriveLoanPosition({ loan, payments, prepayments, asOf: paidOn })
  if (!position.available) return { available: false, reason: position.reason }
  const targetPaise = Math.max(0, rupeesToPaise(amount))
  let remainingPaise = targetPaise
  const allocations = []
  for (const row of position.overdue) {
    if (remainingPaise <= 0) break
    const overduePaise = Math.min(remainingPaise, Math.max(0, rupeesToPaise(row.overdueAmount) - rupeesToPaise(row.unpaidPrincipal) - rupeesToPaise(row.unpaidScheduledInterest)))
    remainingPaise -= overduePaise
    const interestPaise = Math.min(remainingPaise, rupeesToPaise(row.unpaidScheduledInterest))
    remainingPaise -= interestPaise
    const principalPaise = Math.min(remainingPaise, rupeesToPaise(row.unpaidPrincipal))
    remainingPaise -= principalPaise
    allocations.push({ obligationId: row.id, overdueInterest: paiseToRupees(overduePaise), scheduledInterest: paiseToRupees(interestPaise), scheduledPrincipal: paiseToRupees(principalPaise) })
  }
  if (remainingPaise > 0) return { available: false, reason: 'PAYMENT_EXCEEDS_EMI_OBLIGATIONS' }
  return { available: true, allocations, allocatedAmount: paiseToRupees(targetPaise - remainingPaise) }
}
