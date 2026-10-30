/**
 * Application boundary for Admin's domain-derived read models.
 *
 * Admin presentation submits user intent and renders these results; it does
 * not import financial calculation engines or domain time utilities directly.
 */
import {
  deriveLoanPosition,
  calculatePrepaymentEstimate,
  paymentAllocationPreview,
} from '../../domain/finance/loanEngine.js'
import { getKfeReferenceNow, istDateKey, reportingRangeFor } from '../../domain/time/ist.js'
import { getApplicableDriverTarget } from '../../domain/performance/driverTarget.js'
import { getApplicableMaintenanceRateRecord } from '../../domain/performance/maintenanceRate.js'

const live = rows => (Array.isArray(rows) ? rows : []).filter(row => !row?.deletedAt && row?.deleted !== true)
const finiteAmount = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const paymentDirection = row => String(row?.direction || (row?.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase()

// Admin projections live at the application boundary; the Vue screen only renders them.
const sourcePaymentPosition = ({ record, payments = [] } = {}) => {
  const values = record?.values || record || {}
  const cost = finiteAmount(values.cost)
  if (cost == null || cost < 0) return { available: false, cost: null, paid: null, remaining: null }
  const linked = live(payments).filter(row => row.sourceId === record?.id && paymentDirection(row) === 'OUT')
  const amounts = linked.map(row => finiteAmount(row.amount))
  if (amounts.some(value => value == null || value < 0)) return { available: false, cost, paid: null, remaining: null }
  const paid = amounts.reduce((sum, value) => sum + value, 0)
  return { available: true, cost, paid, remaining: cost - paid }
}

const observedRevenueDuringValidity = ({ record, shifts = [], asOf = getKfeReferenceNow() } = {}) => {
  const values = record?.values || record || {}
  const from = istDateKey(values.validFrom)
  const until = istDateKey(values.validUntil)
  const today = istDateKey(asOf)
  if (!from || !until || !today || from > until) return { total: 0, days: 0, average: 0 }
  const byDay = new Map()
  for (const shift of live(shifts)) {
    const key = istDateKey(shift.shiftEndAt || shift.shiftStartAt)
    if (!key || key < from || key > until || key > today) continue
    const revenue = finiteAmount(shift.revenue)
    if (revenue == null) continue
    byDay.set(key, (byDay.get(key) || 0) + revenue)
  }
  const total = [...byDay.values()].reduce((sum, value) => sum + value, 0)
  const days = byDay.size
  return { total, days, average: days ? total / days : 0 }
}

const loanFinancialSummary = ({ loan, position } = {}) => ({
  principal: finiteAmount(loan?.principal) ?? 0,
  paid: finiteAmount(position?.actualPaid) ?? 0,
  prepaid: finiteAmount(position?.actualPrepayment) ?? 0,
  remaining: finiteAmount(position?.outstandingPrincipal) ?? 0,
  emi: finiteAmount(position?.emi) ?? 0,
  pending: Math.max(0, (finiteAmount(position?.scheduledDue) ?? 0) - (finiteAmount(position?.actualPaid) ?? 0)),
  overdue: finiteAmount(position?.totalOverdue) ?? 0,
  provisionBalance: finiteAmount(position?.provisionBalance) ?? 0,
})

const loanAmortizationRows = ({ schedule = [], asOf = getKfeReferenceNow() } = {}) => {
  const today = istDateKey(asOf)
  return (Array.isArray(schedule) ? schedule : []).map(row => {
    const paid = Math.max(0, finiteAmount(row.scheduledInterestPaid) ?? 0) + Math.max(0, finiteAmount(row.scheduledPrincipalPaid) ?? 0)
    const due = Math.max(0, (finiteAmount(row.originalEmiAmount) ?? 0) - paid)
    const fullyPaid = due <= 1
    const dueDate = istDateKey(row.dueDate)
    const isPastDue = Boolean(dueDate && today && dueDate < today)
    const isDue = Boolean(dueDate && today && dueDate <= today)
    return { ...row, dueDateKey: dueDate, paidScheduledAmount: paid, remainingScheduledAmount: due,
      paymentState: fullyPaid ? 'Paid' : isPastDue ? 'Overdue' : paid > 0 ? 'Partially paid' : isDue ? 'Due' : 'Upcoming' }
  })
}

const effectiveDriverTarget = ({ records = [], driverId, month } = {}) => {
  if (!driverId || !month) return null
  const boundary = String(month).length === 7 ? `${month}-01` : month
  const candidates = live(records).filter(record => (record.values || record).driverId === driverId)
  const selected = getApplicableDriverTarget(candidates.map(record => ({ ...record, ...(record.values || {}) })), boundary)
  return selected ? candidates.find(record => record.id === selected.id) || null : null
}

const effectiveMaintenanceRate = ({ records = [], asOf = getKfeReferenceNow() } = {}) => {
  const candidates = live(records)
  const selected = getApplicableMaintenanceRateRecord(candidates.map(record => ({ ...record, ...(record.values || {}) })), asOf)
  return selected ? candidates.find(record => record.id === selected.id) || null : null
}

export const AdminReadModelService = Object.freeze({
  getEffectiveDriverTarget(input) { return effectiveDriverTarget(input) },
  getEffectiveMaintenanceRate(input) { return effectiveMaintenanceRate(input) },
  getSourceFinancialPosition(input) { return sourcePaymentPosition(input) },
  getComplianceRevenueSummary(input) { return observedRevenueDuringValidity(input) },
  getLoanFinancialSummary(input) { return loanFinancialSummary(input) },
  getLoanAmortizationSchedule(input) { return loanAmortizationRows(input) },
  currentMonthRange() { return reportingRangeFor('MONTH', getKfeReferenceNow()) },
  referenceNow() {
    return getKfeReferenceNow()
  },

  dateKey(value) {
    return istDateKey(value)
  },

  getLoanPosition(input) {
    return deriveLoanPosition(input)
  },

  estimatePrepayment(input) {
    return calculatePrepaymentEstimate(input)
  },

  previewPaymentAllocation(input) {
    return paymentAllocationPreview(input)
  },
})
