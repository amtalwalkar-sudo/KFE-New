import { calculateRollingFuelCostPerKm } from '../math/fuel.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'
import { authoritativeShiftRevenue } from './authoritativeRevenue.js'
import { istDateKey } from '../time/ist.js'

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
const dateKeyDate = key => { const [year, month, day] = String(key || '').split('-').map(Number); return [year, month, day].every(Number.isFinite) ? new Date(Date.UTC(year, month - 1, day)) : null }
const shiftKm = shift => { const start = odometer(shift?.startOdometer); const end = odometer(shift?.endOdometer); return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0 }
const revenueByDay = shifts => { const result = new Map(); for (const shift of live(shifts)) { const date = d(shift.shiftEndAt); if (!date) continue; const key = istDateKey(date); if (key) result.set(key, (result.get(key) || 0) + n(shift.revenue)) } return result }
const applicableMaintenanceRate = (inputs, date) => { const key = istDateKey(date); if (!key) return NaN; const row = live(inputs).filter(x => x.active !== false && x.status !== 'INACTIVE' && String(x.effectiveFrom || '') <= key).sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0]; return row && Number.isFinite(Number(row.maintenanceProvisionPerKm)) ? Number(row.maintenanceProvisionPerKm) : NaN }
const maintenanceProvisionForShifts = (shifts, inputs, r) => live(shifts).filter(x => inR(x.shiftEndAt || x.shiftStartAt, r)).reduce((sum, shift) => { const rate = applicableMaintenanceRate(inputs, shift.shiftEndAt || shift.shiftStartAt); return sum + (Number.isFinite(rate) ? shiftKm(shift) * rate : 0) }, 0)
const complianceProvisionForRecord = (record, shifts, r) => {
  const start = d(record?.validFrom), end = d(record?.validUntil), cost = n(record?.cost)
  if (!start || !end || end < start || cost <= 0) return 0
  const validityFrom = istDateKey(start), validityTo = istDateKey(end), reportFrom = istDateKey(r?.from) || validityFrom, reportTo = istDateKey(r?.to) || validityTo
  const overlapFrom = validityFrom > reportFrom ? validityFrom : reportFrom, overlapTo = validityTo < reportTo ? validityTo : reportTo
  if (!validityFrom || !validityTo || overlapTo < overlapFrom) return 0
  const dailyRevenue = revenueByDay(shifts), totalValidityRevenue = (() => { let total = 0; const a = dateKeyDate(validityFrom), b = dateKeyDate(validityTo); if (!a || !b) return 0; for (let cursor = a; cursor <= b; cursor = new Date(cursor.getTime() + 86400000)) total += dailyRevenue.get(cursor.toISOString().slice(0, 10)) || 0; return total })()
  const dailyProvision = cost / days(start, end); let provision = 0
  const a = dateKeyDate(overlapFrom), b = dateKeyDate(overlapTo); if (!a || !b) return 0
  for (let cursor = a; cursor <= b; cursor = new Date(cursor.getTime() + 86400000)) { const key = cursor.toISOString().slice(0, 10); const dayRevenue = dailyRevenue.get(key) || 0; provision += totalValidityRevenue > 0 ? cost * (dayRevenue / totalValidityRevenue) : dailyProvision }
  return provision
}
const renewal = (xs, shifts, r) => live(xs).reduce((sum, record) => sum + complianceProvisionForRecord(record, shifts, r), 0)

export function derivePerformance(s, r, p = previousRange(r)) {
  const S = live(s.shifts), T = live(s.trips), F = live(s.fuelLogs), M = live(s.maintenance), C = live(s.compliance)
  const calc = x => {
    const sh = S.filter(a => inR(a.shiftEndAt || a.shiftStartAt, x)), tr = T.filter(a => a.status === 'COMPLETED' && inR(a.tripEndAt || a.tripStartAt, x)), fu = F.filter(a => inR(a.capturedAt, x)), ma = M.filter(a => inR(a.performedOn, x))
    const revenue = authoritativeShiftRevenue(S, x), vehicleKm = sh.reduce((z, a) => { const start = odometer(a.startOdometer); const end = odometer(a.endOdometer); return Number.isFinite(start) && Number.isFinite(end) && end >= start ? z + (end - start) : z }, 0), businessKm = tr.reduce((z, a) => { const km = Number(a.tripKm); return Number.isFinite(km) && km >= 0 ? z + km : z }, 0), deadKm = vehicleKm - businessKm
    const fuelCost = fu.reduce((z, a) => z + n(a.amount), 0), fuelQty = fu.reduce((z, a) => z + n(a.quantityKg), 0), toll = sh.reduce((z, a) => z + n(a.toll), 0), parking = sh.reduce((z, a) => z + n(a.parking), 0), maintenance = ma.reduce((z, a) => z + n(a.cost), 0), workingHours = sh.reduce((z, a) => z + hrs(a.shiftStartAt, a.shiftEndAt), 0)
    const operatingCost = fuelCost + toll + parking + maintenance
    return { sh, tr, fu, ma, revenue, vehicleKm, businessKm, deadKm, fuelCost, fuelQty, toll, parking, maintenance, workingHours, operatingCost, operatingProfit: revenue - operatingCost }
  }
  const a = calc(r), q = calc(p), ren = renewal(C, S, r), pren = renewal(C, S, p)
  const asOfFuelLogs = F.filter(x => { const capturedAt = d(x.capturedAt); return capturedAt && capturedAt <= r.to })
  const fuelModel = calculateRollingFuelCostPerKm(asOfFuelLogs, 10)
  const observedFuelCostPerKm = a.vehicleKm > 0 && a.fuelCost > 0 ? a.fuelCost / a.vehicleKm : NaN
  const fuelCostPerKmSource = Number.isFinite(fuelModel.rollingCostPerKm)
    ? 'FULL_TANK_INTERVAL'
    : Number.isFinite(observedFuelCostPerKm)
      ? 'OBSERVED_PERIOD'
      : 'UNAVAILABLE'
  const fuelCostPerKm = Number.isFinite(fuelModel.rollingCostPerKm) ? fuelModel.rollingCostPerKm : observedFuelCostPerKm
  const fuelEvidenceStatus = fuelCostPerKmSource === 'FULL_TANK_INTERVAL'
    ? CALCULATION_STATUS.AUTHORITATIVE
    : fuelCostPerKmSource === 'OBSERVED_PERIOD'
      ? CALCULATION_STATUS.INDICATIVE
      : CALCULATION_STATUS.UNAVAILABLE
  const fuelEvidence = calculationEvidence({
    status: fuelEvidenceStatus,
    source: fuelCostPerKmSource,
    reason: fuelCostPerKmSource === 'OBSERVED_PERIOD' ? 'FULL_TANK_INTERVAL_NOT_YET_QUALIFIED' : fuelCostPerKmSource === 'UNAVAILABLE' ? 'NO_QUALIFIED_FUEL_RATE' : null,
  })
  const maintenanceProvision = maintenanceProvisionForShifts(S, s?.breakEvenInputs || [], r)
  const prevMaintenanceProvision = maintenanceProvisionForShifts(S, s?.breakEvenInputs || [], p)
  const maintenancePayments = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, r)).reduce((sum, x) => sum + n(x.amount), 0)
  const previousMaintenancePayments = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, p)).reduce((sum, x) => sum + n(x.amount), 0)
  const maintenanceProvisionBalance = maintenanceProvision - maintenancePayments
  const previousMaintenanceProvisionBalance = prevMaintenanceProvision - previousMaintenancePayments
  const complianceProvisionById = Object.fromEntries(live(C).map(record => [record.id, complianceProvisionForRecord(record, S, r)]))
  const compliancePaymentsById = Object.fromEntries(live(s?.settlements).filter(x => String(x.sourceType || '') === 'Compliance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, r)).reduce((map, payment) => { map[payment.sourceId] = (map[payment.sourceId] || 0) + n(payment.amount); return map }, {}))
  const complianceProvisionBalancesById = Object.fromEntries(Object.entries(complianceProvisionById).map(([id, value]) => [id, value - (compliancePaymentsById[id] || 0)]))
  const provision = maintenanceProvision + ren
  const wd = days(r.from, r.to), elapsed = wd, activeDays = new Set(a.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size, prevActive = new Set(q.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size
  const perDay = activeDays ? a.revenue / activeDays : NaN
  const provisionAdjustedProfit = a.operatingProfit - provision, prevProvisionAdjustedProfit = q.operatingProfit - prevProvision
  const costPerKm = a.vehicleKm ? a.operatingCost / a.vehicleKm : NaN
  return {
    period: { from: r.from, to: r.to, previousFrom: p.from, previousTo: p.to, timeZone: 'Asia/Kolkata' },
    authority: { revenue: 'SHIFT_END_REVENUE', vehicleKm: 'SHIFT_END_MINUS_START_ODOMETER', businessKm: 'VALIDATED_COMPLETED_TRIP_KM', deadKm: 'VEHICLE_KM_MINUS_BUSINESS_KM', costs: 'FUEL_LOGS_PLUS_SHIFT_TOLL_PARKING_PLUS_ACTUAL_MAINTENANCE', renewal: 'COMPLIANCE_VALIDITY_AND_COST', target: 'DRIVER_TARGET_STABILIZATION_SERVICE', breakEven: 'FINANCE_PERFORMANCE_ADAPTER' },
    completeness: { target: false, renewal: ren > 0, hourlyData: a.workingHours > 0, breakEven: false, fuelCostPerKm: Number.isFinite(fuelCostPerKm) },
    counts: { trips: a.tr.length, activeFinancialDays: activeDays, workingDays: wd, elapsedDays: elapsed, daysRemaining: Math.max(0, wd - elapsed) }, previousCounts: { trips: q.tr.length, activeFinancialDays: prevActive },
    revenue: a.revenue, previousRevenue: q.revenue, vehicleKm: a.vehicleKm, previousVehicleKm: q.vehicleKm, businessKm: a.businessKm, previousBusinessKm: q.businessKm, deadKm: a.deadKm, previousDeadKm: q.deadKm, fuelCost: a.fuelCost, fuelQty: a.fuelQty, fuelCostPerKm, fuelCostPerKmObservations: fuelModel.observations.length, toll: a.toll, parking: a.parking, actualMaintenance: a.maintenance, workingHours: a.workingHours, previousWorkingHours: q.workingHours, runningCost: a.operatingCost, previousRunningCost: q.operatingCost, actualOperatingCost: a.operatingCost, previousActualOperatingCost: q.operatingCost,
    costPerKm, maintenanceProvision, previousMaintenanceProvision: prevMaintenanceProvision, maintenancePayments, previousMaintenancePayments, maintenanceProvisionBalance, previousMaintenanceProvisionBalance, renewalProvision: ren, complianceProvisionById, compliancePaymentsById, complianceProvisionBalancesById, otherProvision: 0, provisionRequired: provision, provisionSetAside: provision, operatingProfit: a.operatingProfit, previousOperatingProfit: q.operatingProfit, provisionAdjustedProfit, previousProvisionAdjustedProfit: prevProvisionAdjustedProfit,
    monthlyBreakEvenRevenue: NaN, revenuePerKm: a.vehicleKm ? a.revenue / a.vehicleKm : NaN, revenuePerTrip: a.tr.length ? a.revenue / a.tr.length : NaN, revenuePerHour: a.workingHours ? a.revenue / a.workingHours : NaN, profitPerKm: a.vehicleKm ? a.operatingProfit / a.vehicleKm : NaN, profitPerHour: a.workingHours ? a.operatingProfit / a.workingHours : NaN, revenueGrowth: q.revenue ? (a.revenue - q.revenue) / Math.abs(q.revenue) * 100 : NaN, profitGrowth: q.operatingProfit ? (a.operatingProfit - q.operatingProfit) / Math.abs(q.operatingProfit) * 100 : NaN, revenuePerActiveDay: perDay, target: null,
    breakEvenInputs: { maintenanceProvisionPerKm: NaN, fixedCosts: NaN, fuelCostPerKm, fuelCostPerKmSource, fuelEvidence }, pace: { currentRevenuePerFinancialDay: perDay, requiredRevenuePerFinancialDay: NaN, paceVariance: NaN }, trips: a.tr, shifts: a.sh, fuelLogs: a.fu, maintenance: a.ma,
previous: { revenue: q.revenue, cost: q.operatingCost, operatingProfit: q.operatingProfit, provisionAdjustedProfit: prevProvisionAdjustedProfit, businessKm: q.businessKm, vehicleKm: q.vehicleKm, deadKm: q.deadKm, workingHours: q.workingHours }
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
