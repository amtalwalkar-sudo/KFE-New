import { calculateRollingFuelCostPerKm } from '../math/fuel.js'
import { deriveAuthoritativeBreakEven } from './authoritativeBreakEven.js'

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0
const d = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const inR = (v, r) => { const x = d(v); return !!x && x >= r.from && x <= r.to }
const days = (a, b) => Math.max(1, Math.ceil((b - a) / 86400000) + 1)
const hrs = (a, b) => { a = d(a); b = d(b); return a && b && b >= a ? (b - a) / 3600000 : 0 }
const money = v => Number.isFinite(v) ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—'
const num = v => Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const pct = v => Number.isFinite(v) ? `${v.toFixed(1)}%` : '—'
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
export const previousRange = r => { const x = Math.max(1, r.to - r.from + 1); return { from: new Date(r.from - x), to: new Date(r.from - 1) } }
const active = (xs, r) => live(xs).filter(x => x.active !== false && x.status !== 'INACTIVE' && (d(x.effectiveFrom || x.validFrom || x.startDate) || new Date(0)) <= r.to && (d(x.effectiveUntil || x.validUntil || x.endDate) || new Date('9999-12-31')) >= r.from)
const latest = (xs, r) => active(xs, r).sort((a, b) => String(b.effectiveFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.startDate || '')))[0]
const loan = (loans, pays, pre, r) => {
  const l = latest(loans, r)
  if (!l || !n(l.principal) || !d(l.startDate)) return { ok: false }
  const P = n(l.principal), annualRate = n(l.annualInterestRate) / 100, monthlyRate = annualRate / 12, T = Math.max(1, n(l.tenureMonths))
  const emi = monthlyRate ? P * monthlyRate * Math.pow(1 + monthlyRate, T) / (Math.pow(1 + monthlyRate, T) - 1) : P / T
  let bal = P, scheduled = 0, principal = 0, interest = 0, previousDate = d(l.startDate)
  for (let i = 0; i < T && bal > 0; i += 1) {
    const due = new Date(previousDate); due.setMonth(due.getMonth() + 1)
    const actualDays = Math.max(1, Math.ceil((due - previousDate) / 86400000))
    const int = bal * annualRate * actualDays / 365
    const pr = Math.min(bal, Math.max(0, emi - int))
    if (due >= r.from && due <= r.to) { scheduled += Math.min(bal + int, emi); principal += pr; interest += int }
    bal = Math.max(0, bal - pr)
    for (const x of live(pre).filter(x => x.loanId === l.id && x.status === 'Applied' && d(x.paidOn) && d(x.paidOn).getFullYear() === due.getFullYear() && d(x.paidOn).getMonth() === due.getMonth())) bal = Math.max(0, bal - n(x.amount))
    previousDate = due
  }
  const paid = live(pays).filter(x => x.loanId === l.id && x.status !== 'Reversed' && inR(x.paidOn, r)).reduce((s, x) => s + n(x.amount) + n(x.charges), 0)
  const prepaid = live(pre).filter(x => x.loanId === l.id && x.status === 'Applied' && inR(x.paidOn, r)).reduce((s, x) => s + n(x.amount), 0)
  return { ok: true, emi, scheduled, principal, interest, paid, prepaid, actualFinancingOutflow: paid + prepaid, balance: bal }
}
const renewal = (xs, r) => live(xs).reduce((s, x) => { const a = d(x.validFrom), b = d(x.validUntil), c = n(x.cost); if (!a || !b || !c || b < r.from || a > r.to) return s; const lo = a > r.from ? a : r.from, hi = b < r.to ? b : r.to; return s + c * days(lo, hi) / days(a, b) }, 0)
const monthRangeFor = (day, asOf = new Date()) => {
  const year = day.getUTCFullYear()
  const month = day.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 1) - 1)
  const currentMonthKey = asOf.toISOString().slice(0, 7)
  const monthKey = from.toISOString().slice(0, 7)
  const dayEnd = new Date(Date.UTC(year, month, day.getUTCDate(), 23, 59, 59, 999))
  const to = monthKey === currentMonthKey ? new Date(Math.min(monthEnd.getTime(), dayEnd.getTime())) : monthEnd
  return { from, to }
}

export function derivePerformance(s, r, p = previousRange(r)) {
  const S = live(s.shifts), T = live(s.trips), F = live(s.fuelLogs), M = live(s.maintenance), C = live(s.compliance), L = live(s.loans), LP = live(s.loanPayments), PP = live(s.prepayments)
  const calc = x => {
    const sh = S.filter(a => inR(a.shiftEndAt || a.shiftStartAt, x)), tr = T.filter(a => a.status === 'COMPLETED' && inR(a.tripEndAt || a.tripStartAt, x)), fu = F.filter(a => inR(a.capturedAt || a.createdAt, x)), ma = M.filter(a => inR(a.performedOn || a.date, x))
    const revenue = tr.reduce((z, a) => z + n(a.revenue), 0), vehicleKm = sh.reduce((z, a) => z + n(a.endOdometer) - n(a.startOdometer), 0), businessKm = tr.reduce((z, a) => z + n(a.tripKm), 0), deadKm = vehicleKm - businessKm
    const fuelCost = fu.reduce((z, a) => z + n(a.amount ?? a.totalCost), 0), fuelQty = fu.reduce((z, a) => z + n(a.quantityKg ?? a.kg), 0), toll = sh.reduce((z, a) => z + n(a.toll), 0), parking = sh.reduce((z, a) => z + n(a.parking), 0), maintenance = ma.reduce((z, a) => z + n(a.cost ?? a.amount), 0), workingHours = sh.reduce((z, a) => z + hrs(a.shiftStartAt, a.shiftEndAt), 0)
    const operatingCost = fuelCost + toll + parking + maintenance
    return { sh, tr, fu, ma, revenue, vehicleKm, businessKm, deadKm, fuelCost, fuelQty, toll, parking, maintenance, workingHours, operatingCost, operatingProfit: revenue - operatingCost }
  }
  const a = calc(r), q = calc(p), ln = loan(L, LP, PP, r), pln = loan(L, LP, PP, p), ren = renewal(C, r), pren = renewal(C, p)
  const asOfFuelLogs = F.filter(x => { const capturedAt = d(x.capturedAt || x.createdAt); return capturedAt && capturedAt <= r.to })
  const fuelModel = calculateRollingFuelCostPerKm(asOfFuelLogs, 10), fuelCostPerKm = fuelModel.rollingCostPerKm

  // Break-even is a monthly authority. For a current/open month it is calculated
  // from month start through the current calendar day; for a closed month it uses
  // the complete calendar month. Daily/period views derive from this value.
  const breakEvenDay = d(r.to) || d(r.from)
  const breakEvenRange = breakEvenDay ? monthRangeFor(breakEvenDay) : r
  const breakEvenFuelLogs = F.filter(x => { const capturedAt = d(x.capturedAt || x.createdAt); return capturedAt && capturedAt <= breakEvenRange.to })
  const breakEvenFuelModel = calculateRollingFuelCostPerKm(breakEvenFuelLogs, 10)
  const breakEvenLoan = loan(L, LP, PP, breakEvenRange)
  const breakEvenRenewal = renewal(C, breakEvenRange)
  const breakEvenVehicleKm = calc(breakEvenRange).vehicleKm
  const authoritativeBreakEven = deriveAuthoritativeBreakEven({
    breakEvenInputs: s.breakEvenInputs,
    range: breakEvenRange,
    loanScheduledObligation: breakEvenLoan.ok ? breakEvenLoan.scheduled : NaN,
    renewalProvision: breakEvenRenewal,
    fuelCostPerKm: breakEvenFuelModel.rollingCostPerKm,
    vehicleKm: breakEvenVehicleKm,
  })
  const maintenanceRate = authoritativeBreakEven.available ? authoritativeBreakEven.maintenanceProvisionPerKm : NaN
  const maintenanceProvision = a.vehicleKm * maintenanceRate, provision = maintenanceProvision + ren, prevMaintenanceProvision = q.vehicleKm * maintenanceRate, prevProvision = prevMaintenanceProvision + pren
  const wd = days(r.from, r.to), elapsed = Math.max(1, Math.min(wd, Math.ceil((Math.min(Date.now(), r.to) - r.from) / 86400000))), activeDays = new Set(a.tr.map(x => (d(x.tripEndAt || x.tripStartAt) || {}).toISOString?.().slice(0, 10)).filter(Boolean)).size, prevActive = new Set(q.tr.map(x => (d(x.tripEndAt || x.tripStartAt) || {}).toISOString?.().slice(0, 10)).filter(Boolean)).size
  const perDay = activeDays ? a.revenue / activeDays : NaN, projected = activeDays ? perDay * wd : NaN
  const breakEven = authoritativeBreakEven.available ? authoritativeBreakEven.breakEvenRevenue : NaN
  const actualLoanPaid = ln.ok ? ln.paid : 0, actualPrepayment = ln.ok ? ln.prepaid : 0, actualFinancingOutflow = ln.ok ? ln.actualFinancingOutflow : 0
  const availableCash = a.operatingProfit - actualFinancingOutflow, provisionAdjustedProfit = a.operatingProfit - provision, prevActualFinancingOutflow = pln.ok ? pln.actualFinancingOutflow : 0, prevAvailableCash = q.operatingProfit - prevActualFinancingOutflow, prevProvisionAdjustedProfit = q.operatingProfit - prevProvision
  return {
    period: { from: r.from, to: r.to, previousFrom: p.from, previousTo: p.to },
    authority: { revenue: 'COMPLETED_TRIP_RECORDS', vehicleKm: 'SHIFT_END_MINUS_START_ODOMETER', businessKm: 'VALIDATED_COMPLETED_TRIP_KM', deadKm: 'VEHICLE_KM_MINUS_BUSINESS_KM', costs: 'FUEL_LOGS_PLUS_SHIFT_TOLL_PARKING_PLUS_ACTUAL_MAINTENANCE', loan: 'LOAN_SCHEDULE_PLUS_LOAN_PAYMENT_RECORDS_PLUS_APPLIED_PREPAYMENTS', renewal: 'COMPLIANCE_VALIDITY_AND_COST', target: 'DRIVER_TARGET_STABILIZATION_SERVICE', breakEven: authoritativeBreakEven.authority || 'BREAK_EVEN_INPUTS_PLUS_CANONICAL_PERFORMANCE_COSTS' },
    completeness: { target: false, loan: ln.ok, renewal: ren > 0, hourlyData: a.workingHours > 0, breakEven: authoritativeBreakEven.available, fuelCostPerKm: Number.isFinite(fuelCostPerKm) },
    counts: { trips: a.tr.length, activeFinancialDays: activeDays, workingDays: wd, elapsedDays: elapsed, daysRemaining: Math.max(0, wd - elapsed) }, previousCounts: { trips: q.tr.length, activeFinancialDays: prevActive },
    revenue: a.revenue, previousRevenue: q.revenue, vehicleKm: a.vehicleKm, previousVehicleKm: q.vehicleKm, businessKm: a.businessKm, previousBusinessKm: q.businessKm, deadKm: a.deadKm, previousDeadKm: q.deadKm, fuelCost: a.fuelCost, fuelQty: a.fuelQty, fuelCostPerKm, fuelCostPerKmObservations: fuelModel.observations.length, toll: a.toll, parking: a.parking, actualMaintenance: a.maintenance, workingHours: a.workingHours, previousWorkingHours: q.workingHours, runningCost: a.operatingCost, previousRunningCost: q.operatingCost, actualOperatingCost: a.operatingCost, previousActualOperatingCost: q.operatingCost,
    maintenanceProvision, previousMaintenanceProvision: prevMaintenanceProvision, loanScheduledObligation: ln.ok ? ln.scheduled : NaN, loanPrincipal: ln.ok ? ln.principal : NaN, loanInterest: ln.ok ? ln.interest : NaN, actualLoanPaid, actualPrepayment, actualFinancingOutflow, renewalProvision: ren, otherProvision: 0, provisionRequired: provision, provisionSetAside: provision, operatingProfit: a.operatingProfit, previousOperatingProfit: q.operatingProfit, provisionAdjustedProfit, previousProvisionAdjustedProfit: prevProvisionAdjustedProfit, availableCash, previousAvailableCash: prevAvailableCash,
    cashSurplusAfterFinancing: availableCash, previousCashSurplusAfterFinancing: prevAvailableCash, breakEvenRevenue: breakEven, revenuePerKm: a.vehicleKm ? a.revenue / a.vehicleKm : NaN, revenuePerTrip: a.tr.length ? a.revenue / a.tr.length : NaN, revenuePerHour: a.workingHours ? a.revenue / a.workingHours : NaN, profitPerKm: a.vehicleKm ? a.operatingProfit / a.vehicleKm : NaN, profitPerHour: a.workingHours ? a.operatingProfit / a.workingHours : NaN, revenueGrowth: q.revenue ? (a.revenue - q.revenue) / Math.abs(q.revenue) * 100 : NaN, profitGrowth: q.operatingProfit ? (a.operatingProfit - q.operatingProfit) / Math.abs(q.operatingProfit) * 100 : NaN, revenuePerActiveDay: perDay, projectedRevenue: projected, target: null,
    breakEvenInputs: { maintenanceProvisionPerKm: maintenanceRate, fixedCosts: authoritativeBreakEven.fixedCosts, fuelCostPerKm: breakEvenFuelModel.rollingCostPerKm }, pace: { currentRevenuePerActiveDay: perDay, requiredRevenuePerActiveDay: NaN, paceVariance: NaN, projectedRevenue: projected, targetGap: NaN }, trips: a.tr, shifts: a.sh, fuelLogs: a.fu, maintenance: a.ma,
    loan: ln, previous: { revenue: q.revenue, cost: q.operatingCost, operatingProfit: q.operatingProfit, provisionAdjustedProfit: prevProvisionAdjustedProfit, availableCash: prevAvailableCash, cashSurplusAfterFinancing: prevAvailableCash, businessKm: q.businessKm, vehicleKm: q.vehicleKm, deadKm: q.deadKm, workingHours: q.workingHours }
  }
}

export function layerRows(card, layer, m) {
  const r = (a, b) => [a, b]
  if (card === 'target') return layer === 0 ? [r('Achieved revenue', money(m.revenue)), r('Target', m.target == null ? 'Not configured' : money(m.target)), r('Achievement', m.target != null ? pct(m.revenue / m.target * 100) : '—')] : layer === 1 ? [r('Current pace', money(m.pace.currentRevenuePerActiveDay)), r('Required pace', money(m.pace.requiredRevenuePerActiveDay)), r('Projection', money(m.pace.projectedRevenue))] : layer === 2 ? [r('Working days', num(m.counts.workingDays)), r('Elapsed', num(m.counts.elapsedDays)), r('Remaining', num(m.counts.daysRemaining))] : layer === 3 ? [r('Previous revenue', money(m.previous.revenue)), r('Current revenue', money(m.revenue)), r('Growth', pct(m.revenueGrowth))] : [r('Revenue detail', num(m.counts.trips)), r('Revenue / trip', money(m.revenuePerTrip))]
  if (card === 'revenue') return layer === 0 ? [r('Total revenue', money(m.revenue)), r('Previous', money(m.previous.revenue)), r('Growth', pct(m.revenueGrowth))] : layer === 1 ? [r('Revenue / trip', money(m.revenuePerTrip)), r('Trips', num(m.counts.trips))] : layer === 2 ? [r('Revenue / KM', money(m.revenuePerKm)), r('Revenue / hour', money(m.revenuePerHour)), r('Vehicle KM', num(m.vehicleKm)), r('Dead KM', num(m.deadKm))] : layer === 3 ? [r('Current revenue', money(m.revenue)), r('Previous revenue', money(m.previous.revenue)), r('Growth', pct(m.revenueGrowth))] : m.trips.map(t => r(t.operator || 'Ride', money(n(t.revenue))))
  if (card === 'cost') return layer === 0 ? [r('Operating cost', money(m.runningCost)), r('Fuel', money(m.fuelCost)), r('Maintenance', money(m.actualMaintenance)), r('Toll', money(m.toll)), r('Parking', money(m.parking))] : layer === 1 ? [r('Fuel quantity', num(m.fuelQty)), r('Cost / vehicle KM', money(m.costPerKm)), r('Fuel cost / KM', money(m.fuelCostPerKm))] : layer === 2 ? [r('Current cost', money(m.runningCost)), r('Previous cost', money(m.previous.cost))] : layer === 3 ? [r('Break-even revenue', money(m.breakEvenRevenue)), r('Revenue', money(m.revenue)), r('Gap', money(m.revenue - m.breakEvenRevenue))] : m.shifts.map(s => r('Shift', `KM ${num(n(s.endOdometer) - n(s.startOdometer))}`))
  if (card === 'profit') return layer === 0 ? [r('Operating profit', money(m.operatingProfit)), r('Operating cost', money(m.runningCost)), r('Revenue', money(m.revenue))] : layer === 1 ? [r('Available cash', money(m.availableCash)), r('Actual financing outflow', money(m.actualFinancingOutflow))] : layer === 2 ? [r('Actual loan paid', money(m.actualLoanPaid)), r('Actual prepayment', money(m.actualPrepayment)), r('Scheduled loan obligation', money(m.loanScheduledObligation)), r('Loan principal', money(m.loanPrincipal)), r('Loan interest', money(m.loanInterest))] : layer === 3 ? [r('Maintenance provision', money(m.maintenanceProvision)), r('Renewal provision', money(m.renewalProvision)), r('Other provision', money(m.otherProvision))] : layer === 4 ? [r('Current operating profit', money(m.operatingProfit)), r('Previous operating profit', money(m.previous.operatingProfit)), r('Growth', pct(m.profitGrowth))] : m.trips.map(t => r(t.operator || 'Ride', money(n(t.revenue))))
  return []
}
