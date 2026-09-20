import { calculateRollingFuelCostPerKm } from '../math/fuel.js'
import { deriveAuthoritativeBreakEven } from './authoritativeBreakEven.js'
import { authoritativeShiftRevenue } from './authoritativeRevenue.js'
import { istDateKey, istMonthKey, istMonthRange, istCalendarDaysInclusive, addIstMonths } from '../time/ist.js'

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0
const odometer = v => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : NaN }
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
const calendarDaysInLoanPeriod = (from, toExclusive) => istCalendarDaysInclusive(from, new Date(toExclusive.getTime() - 1))
const loan = (loans, pays, pre, r) => {
  const l = latest(loans, r)
  if (!l || !n(l.principal) || !d(l.startDate) || !n(l.tenureMonths)) return { ok: false }
  const P = n(l.principal), annualRate = n(l.annualInterestRate ?? l.annualInterestRatePercent) / 100, monthlyRate = annualRate / 12, T = Math.max(1, n(l.tenureMonths))
  const emi = monthlyRate ? P * monthlyRate * Math.pow(1 + monthlyRate, T) / (Math.pow(1 + monthlyRate, T) - 1) : P / T
  let bal = P, scheduled = 0, principal = 0, interest = 0, previousDate = d(l.startDate)
  for (let i = 0; i < T && bal > 0; i += 1) {
    const due = addIstMonths(previousDate, 1)
    const actualDays = calendarDaysInLoanPeriod(previousDate, due)
    const int = bal * annualRate * actualDays / 365
    const pr = Math.min(bal, Math.max(0, emi - int))
    const overlapStart = previousDate > r.from ? previousDate : r.from
    const rangeEndExclusive = new Date(r.to.getTime() + 1)
    const overlapEndExclusive = due < rangeEndExclusive ? due : rangeEndExclusive
    if (overlapEndExclusive > overlapStart) interest += bal * annualRate * calendarDaysInLoanPeriod(overlapStart, overlapEndExclusive) / 365
    if (due >= r.from && due <= r.to) { scheduled += Math.min(bal + int, emi); principal += pr }
    bal = Math.max(0, bal - pr)
    const dueMonth = istMonthKey(due)
    for (const x of live(pre).filter(x => x.loanId === l.id && x.status === 'Applied' && d(x.paidOn) && istMonthKey(x.paidOn) === dueMonth)) bal = Math.max(0, bal - n(x.amount))
    previousDate = due
  }
  const paid = live(pays).filter(x => x.loanId === l.id && x.status !== 'Reversed' && inR(x.paidOn, r)).reduce((s, x) => s + n(x.amount) + n(x.charges), 0)
  const prepaid = live(pre).filter(x => x.loanId === l.id && x.status === 'Applied' && inR(x.paidOn, r)).reduce((s, x) => s + n(x.amount), 0)
  return { ok: true, emi, scheduled, principal, interest, paid, prepaid, actualFinancingOutflow: paid + prepaid, balance: bal }
}
const renewal = (xs, r) => live(xs).reduce((s, x) => { const a = d(x.validFrom), b = d(x.validUntil), c = n(x.cost); if (!a || !b || !c || b < r.from || a > r.to) return s; const lo = a > r.from ? a : r.from, hi = b < r.to ? b : r.to; return s + c * days(lo, hi) / days(a, b) }, 0)

export function derivePerformance(s, r, p = previousRange(r)) {
  const S = live(s.shifts), T = live(s.trips), F = live(s.fuelLogs), M = live(s.maintenance), C = live(s.compliance), L = live(s.loans), LP = live(s.loanPayments), PP = live(s.prepayments)
  const calc = x => {
    const sh = S.filter(a => inR(a.shiftEndAt || a.shiftStartAt, x)), tr = T.filter(a => a.status === 'COMPLETED' && inR(a.tripEndAt || a.tripStartAt, x)), fu = F.filter(a => inR(a.capturedAt, x)), ma = M.filter(a => inR(a.performedOn, x))
    const revenue = authoritativeShiftRevenue(S, x), vehicleKm = sh.reduce((z, a) => { const start = odometer(a.startOdometer); const end = odometer(a.endOdometer); return Number.isFinite(start) && Number.isFinite(end) && end >= start ? z + (end - start) : z }, 0), businessKm = tr.reduce((z, a) => { const km = Number(a.tripKm); return Number.isFinite(km) && km >= 0 ? z + km : z }, 0), deadKm = Math.max(0, vehicleKm - businessKm)
    const fuelCost = fu.reduce((z, a) => z + n(a.amount), 0), fuelQty = fu.reduce((z, a) => z + n(a.quantityKg), 0), toll = sh.reduce((z, a) => z + n(a.toll), 0), parking = sh.reduce((z, a) => z + n(a.parking), 0), maintenance = ma.reduce((z, a) => z + n(a.cost), 0), workingHours = sh.reduce((z, a) => z + hrs(a.shiftStartAt, a.shiftEndAt), 0)
    const operatingCost = fuelCost + toll + parking + maintenance
    return { sh, tr, fu, ma, revenue, vehicleKm, businessKm, deadKm, fuelCost, fuelQty, toll, parking, maintenance, workingHours, operatingCost, operatingProfit: revenue - operatingCost }
  }
  const a = calc(r), q = calc(p), ln = loan(L, LP, PP, r), pln = loan(L, LP, PP, p), ren = renewal(C, r), pren = renewal(C, p)
  const asOfFuelLogs = F.filter(x => { const capturedAt = d(x.capturedAt); return capturedAt && capturedAt <= r.to })
  const fuelModel = calculateRollingFuelCostPerKm(asOfFuelLogs, 10)
  // A full-tank interval is the preferred fuel-efficiency authority. When
  // there is not yet a second full-tank odometer reading, use the observed
  // fuel spend / vehicle KM for the selected period so a valid fuel log does
  // not make the entire break-even pipeline unavailable.
  const observedFuelCostPerKm = a.vehicleKm > 0 && a.fuelCost > 0 ? a.fuelCost / a.vehicleKm : NaN
  const fuelCostPerKmSource = Number.isFinite(fuelModel.rollingCostPerKm) ? 'FULL_TANK_INTERVAL' : Number.isFinite(observedFuelCostPerKm) ? 'OBSERVED_PERIOD' : 'UNAVAILABLE'
  const fuelCostPerKm = Number.isFinite(fuelModel.rollingCostPerKm) ? fuelModel.rollingCostPerKm : observedFuelCostPerKm
  const breakEvenDay = d(r.to) || d(r.from)
  const fullMonthRange = breakEvenDay ? istMonthRange(breakEvenDay) : r
  const breakEvenRange = fullMonthRange && fullMonthRange.to > r.to ? { ...fullMonthRange, to: r.to } : fullMonthRange || r
  const breakEvenFuelLogs = F.filter(x => { const capturedAt = d(x.capturedAt); return capturedAt && capturedAt <= breakEvenRange.to })
  const breakEvenFuelModel = calculateRollingFuelCostPerKm(breakEvenFuelLogs, 10)
  const breakEvenLoan = loan(L, LP, PP, breakEvenRange)
  const breakEvenRenewal = renewal(C, breakEvenRange)
  const breakEvenVehicleKm = calc(breakEvenRange).vehicleKm
  const breakEvenFuelSpend = breakEvenFuelLogs.reduce((sum, x) => sum + n(x.amount ?? x.totalCost), 0)
  const breakEvenObservedFuelCostPerKm = breakEvenVehicleKm > 0 && breakEvenFuelSpend > 0
    ? breakEvenFuelSpend / breakEvenVehicleKm
    : NaN
  const breakEvenFuelCostPerKmSource = Number.isFinite(breakEvenFuelModel.rollingCostPerKm) ? 'FULL_TANK_INTERVAL' : Number.isFinite(breakEvenObservedFuelCostPerKm) ? 'OBSERVED_PERIOD' : 'UNAVAILABLE'
  const breakEvenFuelCostPerKm = Number.isFinite(breakEvenFuelModel.rollingCostPerKm)
    ? breakEvenFuelModel.rollingCostPerKm
    : breakEvenObservedFuelCostPerKm
  const authoritativeBreakEven = deriveAuthoritativeBreakEven({ breakEvenInputs: s.breakEvenInputs, range: breakEvenRange, loanScheduledObligation: breakEvenLoan.ok ? breakEvenLoan.scheduled : NaN, renewalProvision: breakEvenRenewal, fuelCostPerKm: breakEvenFuelCostPerKm, vehicleKm: breakEvenVehicleKm })
  const maintenanceRate = authoritativeBreakEven.available ? authoritativeBreakEven.maintenanceProvisionPerKm : NaN
  const maintenanceProvision = a.vehicleKm * maintenanceRate, provision = maintenanceProvision + ren, prevMaintenanceProvision = q.vehicleKm * maintenanceRate, prevProvision = prevMaintenanceProvision + pren
  const wd = days(r.from, r.to), elapsed = wd, activeDays = new Set(a.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size, prevActive = new Set(q.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size
  const perDay = activeDays ? a.revenue / activeDays : NaN
  const monthlyBreakEvenRevenue = authoritativeBreakEven.available ? authoritativeBreakEven.monthlyBreakEvenRevenue : NaN
  const actualLoanPaid = ln.ok ? ln.paid : 0, actualPrepayment = ln.ok ? ln.prepaid : 0, actualFinancingOutflow = ln.ok ? ln.actualFinancingOutflow : 0
  const availableCash = a.operatingProfit - actualFinancingOutflow, provisionAdjustedProfit = a.operatingProfit - provision, prevActualFinancingOutflow = pln.ok ? pln.actualFinancingOutflow : 0, prevAvailableCash = q.operatingProfit - prevActualFinancingOutflow, prevProvisionAdjustedProfit = q.operatingProfit - prevProvision
  const costPerKm = a.vehicleKm ? a.operatingCost / a.vehicleKm : NaN
  return {
    period: { from: r.from, to: r.to, previousFrom: p.from, previousTo: p.to, timeZone: 'Asia/Kolkata' },
    authority: { revenue: 'SHIFT_END_REVENUE', vehicleKm: 'SHIFT_END_MINUS_START_ODOMETER', businessKm: 'VALIDATED_COMPLETED_TRIP_KM', deadKm: 'VEHICLE_KM_MINUS_BUSINESS_KM', costs: 'FUEL_LOGS_PLUS_SHIFT_TOLL_PARKING_PLUS_ACTUAL_MAINTENANCE', loan: 'LOAN_SCHEDULE_PLUS_LOAN_PAYMENT_RECORDS_PLUS_APPLIED_PREPAYMENTS', renewal: 'COMPLIANCE_VALIDITY_AND_COST', target: 'DRIVER_TARGET_STABILIZATION_SERVICE', breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN' },
    completeness: { target: false, loan: ln.ok, renewal: ren > 0, hourlyData: a.workingHours > 0, breakEven: authoritativeBreakEven.available, fuelCostPerKm: Number.isFinite(fuelCostPerKm) },
    counts: { trips: a.tr.length, activeFinancialDays: activeDays, workingDays: wd, elapsedDays: elapsed, daysRemaining: Math.max(0, wd - elapsed) }, previousCounts: { trips: q.tr.length, activeFinancialDays: prevActive },
    revenue: a.revenue, previousRevenue: q.revenue, vehicleKm: a.vehicleKm, previousVehicleKm: q.vehicleKm, businessKm: a.businessKm, previousBusinessKm: q.businessKm, deadKm: a.deadKm, previousDeadKm: q.deadKm, fuelCost: a.fuelCost, fuelQty: a.fuelQty, fuelCostPerKm, fuelCostPerKmObservations: fuelModel.observations.length, toll: a.toll, parking: a.parking, actualMaintenance: a.maintenance, workingHours: a.workingHours, previousWorkingHours: q.workingHours, runningCost: a.operatingCost, previousRunningCost: q.operatingCost, actualOperatingCost: a.operatingCost, previousActualOperatingCost: q.operatingCost,
    costPerKm, maintenanceProvision, previousMaintenanceProvision: prevMaintenanceProvision, loanScheduledObligation: ln.ok ? ln.scheduled : NaN, loanPrincipal: ln.ok ? ln.principal : NaN, loanInterest: ln.ok ? ln.interest : NaN, actualLoanPaid, actualPrepayment, actualFinancingOutflow, renewalProvision: ren, otherProvision: 0, provisionRequired: provision, provisionSetAside: provision, operatingProfit: a.operatingProfit, previousOperatingProfit: q.operatingProfit, provisionAdjustedProfit, previousProvisionAdjustedProfit: prevProvisionAdjustedProfit, availableCash, previousAvailableCash: prevAvailableCash,
    cashSurplusAfterFinancing: availableCash, previousCashSurplusAfterFinancing: prevAvailableCash, monthlyBreakEvenRevenue, revenuePerKm: a.vehicleKm ? a.revenue / a.vehicleKm : NaN, revenuePerTrip: a.tr.length ? a.revenue / a.tr.length : NaN, revenuePerHour: a.workingHours ? a.revenue / a.workingHours : NaN, profitPerKm: a.vehicleKm ? a.operatingProfit / a.vehicleKm : NaN, profitPerHour: a.workingHours ? a.operatingProfit / a.workingHours : NaN, revenueGrowth: q.revenue ? (a.revenue - q.revenue) / Math.abs(q.revenue) * 100 : NaN, profitGrowth: q.operatingProfit ? (a.operatingProfit - q.operatingProfit) / Math.abs(q.operatingProfit) * 100 : NaN, revenuePerActiveDay: perDay, target: null,
    breakEvenInputs: { maintenanceProvisionPerKm: maintenanceRate, fixedCosts: authoritativeBreakEven.fixedCosts, fuelCostPerKm: breakEvenFuelCostPerKm, fuelCostPerKmSource: breakEvenFuelCostPerKmSource }, pace: { currentRevenuePerFinancialDay: perDay, requiredRevenuePerFinancialDay: NaN, paceVariance: NaN }, trips: a.tr, shifts: a.sh, fuelLogs: a.fu, maintenance: a.ma,
    loan: ln, previous: { revenue: q.revenue, cost: q.operatingCost, operatingProfit: q.operatingProfit, provisionAdjustedProfit: prevProvisionAdjustedProfit, availableCash: prevAvailableCash, cashSurplusAfterFinancing: prevAvailableCash, businessKm: q.businessKm, vehicleKm: q.vehicleKm, deadKm: q.deadKm, workingHours: q.workingHours }
  }
}

export function layerRows(card, layer, m) {
  const r = (a, b) => [a, b]
  if (card === 'target') return layer === 0 ? [r('Revenue in selected period', money(m.revenue)), r('Current daily target', m.target == null ? 'Not configured' : money(m.target)), r('Current pace', m.target != null ? money(m.revenuePerActiveDay) : '—')] : layer === 1 ? [r('Current pace / financial day', money(m.pace.currentRevenuePerFinancialDay)), r('Required / financial day', money(m.pace.requiredRevenuePerFinancialDay)), r('Pace variance / financial day', money(m.pace.paceVariance))] : layer === 2 ? [r('Calendar days', num(m.counts.workingDays)), r('Elapsed', num(m.counts.elapsedDays)), r('Remaining', num(m.counts.daysRemaining))] : layer === 3 ? [r('Previous revenue', money(m.previous.revenue)), r('Current revenue', money(m.revenue)), r('Growth', pct(m.revenueGrowth))] : [r('Revenue detail', num(m.counts.trips)), r('Revenue / trip', money(m.revenuePerTrip))]
  if (card === 'revenue') return layer === 0 ? [r('Total shift revenue', money(m.revenue)), r('Previous', money(m.previous.revenue)), r('Growth', pct(m.revenueGrowth))] : layer === 1 ? [r('Revenue / trip', money(m.revenuePerTrip)), r('Trips', num(m.counts.trips))] : layer === 2 ? [r('Revenue / KM', money(m.revenuePerKm)), r('Revenue / hour', money(m.revenuePerHour)), r('Vehicle KM', num(m.vehicleKm)), r('Dead KM', num(m.deadKm))] : layer === 3 ? [r('Current revenue', money(m.revenue)), r('Previous revenue', money(m.previous.revenue)), r('Growth', pct(m.revenueGrowth))] : m.shifts.map(s => r('Shift revenue', money(n(s.revenue))))
  if (card === 'cost') return layer === 0 ? [r('Operating cost', money(m.runningCost)), r('Fuel', money(m.fuelCost)), r('Maintenance', money(m.actualMaintenance)), r('Toll', money(m.toll)), r('Parking', money(m.parking))] : layer === 1 ? [r('Fuel quantity', num(m.fuelQty)), r('Cost / vehicle KM', money(m.costPerKm)), r('Fuel cost / KM', money(m.fuelCostPerKm))] : layer === 2 ? [r('Current cost', money(m.runningCost)), r('Previous cost', money(m.previous.cost))] : layer === 3 ? [r('Monthly break-even revenue', money(m.monthlyBreakEvenRevenue)), r('Revenue', money(m.revenue)), r('Gap', money(m.revenue - m.monthlyBreakEvenRevenue))] : m.shifts.map(s => { const start = odometer(s.startOdometer); const end = odometer(s.endOdometer); const km = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : NaN; return r('Shift', `KM ${num(km)}`) })
  if (card === 'profit') return layer === 0 ? [r('Operating profit', money(m.operatingProfit)), r('Operating cost', money(m.runningCost)), r('Revenue', money(m.revenue))] : layer === 1 ? [r('Available cash', money(m.availableCash)), r('Actual financing outflow', money(m.actualFinancingOutflow))] : layer === 2 ? [r('Actual loan paid', money(m.actualLoanPaid)), r('Actual prepayment', money(m.actualPrepayment)), r('Scheduled loan obligation', money(m.loanScheduledObligation)), r('Loan principal', money(m.loanPrincipal)), r('Loan interest', money(m.loanInterest))] : layer === 3 ? [r('Maintenance provision', money(m.maintenanceProvision)), r('Renewal provision', money(m.renewalProvision)), r('Other provision', money(m.otherProvision))] : layer === 4 ? [r('Current operating profit', money(m.operatingProfit)), r('Previous operating profit', money(m.previous.operatingProfit)), r('Growth', pct(m.profitGrowth))] : m.shifts.map(s => r('Shift revenue', money(n(s.revenue))))
  return []
}
