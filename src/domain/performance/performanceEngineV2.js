import { calculateRollingFuelCostPerKm } from '../math/fuel.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'
import { authoritativeShiftRevenue } from './authoritativeRevenue.js'
import { istDateKey } from '../time/ist.js'
import { deriveTollParkingExpenseTreatment } from '../work/revenueReconciliation.js'

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
const applicableMaintenanceRate = (inputs, date) => {
  const key = istDateKey(date)
  if (!key) return NaN
  // Maintenance provision is a KM-based bucket: every vehicle KM in the
  // period must be allocated at the rate effective on that KM's date.
  // Normalize the configured effective date to an IST calendar key so both
  // YYYY-MM-DD and full ISO timestamps resolve consistently.
  const row = live(inputs)
    .filter(x => x.active !== false && x.status !== 'INACTIVE')
    .map(x => ({ ...x, effectiveKey: istDateKey(x.effectiveFrom) || String(x.effectiveFrom || '').slice(0, 10) }))
    .filter(x => x.effectiveKey && x.effectiveKey <= key && x.maintenanceProvisionPerKm != null && x.maintenanceProvisionPerKm !== '' && Number.isFinite(Number(x.maintenanceProvisionPerKm)) && Number(x.maintenanceProvisionPerKm) >= 0)
    .sort((a, b) => String(b.effectiveKey).localeCompare(String(a.effectiveKey)) || String(b.updatedAt || b.createdAt || b.id || '').localeCompare(String(a.updatedAt || a.createdAt || a.id || '')))[0]
  return row ? Number(row.maintenanceProvisionPerKm) : NaN
}
const calendarParts = value => {
  const date = d(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = type => Number(parts.find(part => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}
const calendarSerial = value => {
  const parts = calendarParts(value)
  return parts && [parts.year, parts.month, parts.day].every(Number.isFinite) ? Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000 : null
}
const addRecoveryMonths = (value, months) => {
  const parts = calendarParts(value)
  if (!parts) return null
  const index = parts.year * 12 + (parts.month - 1) + months
  const year = Math.floor(index / 12)
  const month = index % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(parts.day, lastDay)) / 86400000
}
export function calculateHistoricalMaintenanceRecoveryForRange({ vehicles = [], businessStartDate, range, ratePerKm = 0.40, recoveryMonths = 12 } = {}) {
  const start = calendarSerial(businessStartDate)
  const rangeFrom = calendarSerial(range?.from)
  const rangeTo = calendarSerial(range?.to)
  const end = addRecoveryMonths(businessStartDate, recoveryMonths)
  if (start == null || rangeFrom == null || rangeTo == null || end == null || rangeTo < start || rangeFrom >= end) return 0
  const vehicle = live(vehicles).filter(item => item.active !== false && String(item.status || '').toUpperCase() !== 'INACTIVE').sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0]
  const openingKm = Number(vehicle?.openingOdometerKm)
  if (!Number.isFinite(openingKm) || openingKm < 0) return 0
  const monthlyBurden = (openingKm * ratePerKm) / recoveryMonths
  const from = Math.max(start, rangeFrom)
  const to = Math.min(end - 1, rangeTo)
  if (to < from) return 0
  let allocated = 0
  for (let index = 0; index < recoveryMonths; index += 1) {
    const periodStart = addRecoveryMonths(businessStartDate, index)
    const periodEnd = addRecoveryMonths(businessStartDate, index + 1)
    if (periodStart == null || periodEnd == null || periodEnd <= periodStart) continue
    const overlapFrom = Math.max(from, periodStart)
    const overlapToExclusive = Math.min(to + 1, periodEnd)
    if (overlapToExclusive <= overlapFrom) continue
    allocated += monthlyBurden * ((overlapToExclusive - overlapFrom) / (periodEnd - periodStart))
  }
  return Math.round(allocated * 100) / 100
}

export function calculateHistoricalMaintenanceRecovery({ vehicles = [], businessStartDate, asOf = new Date(), ratePerKm = 0.40, recoveryMonths = 12 } = {}) {
  const start = calendarSerial(businessStartDate)
  const current = calendarSerial(asOf)
  if (start == null || current == null || current < start) return 0
  const end = addRecoveryMonths(businessStartDate, recoveryMonths)
  if (end == null || current >= end) return 0
  const vehicle = live(vehicles).filter(item => item.active !== false && String(item.status || '').toUpperCase() !== 'INACTIVE').sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0]
  const openingKm = Number(vehicle?.openingOdometerKm)
  if (!Number.isFinite(openingKm) || openingKm < 0) return 0
  return Math.round(((openingKm * ratePerKm) / recoveryMonths) * 100) / 100
}
const maintenanceProvisionForShifts = (shifts, inputs, r) => { const xs=live(shifts).filter(x=>inR(x.shiftEndAt||x.shiftStartAt,r)); if(!xs.length)return 0; const rows=xs.map(shift=>({shift,rate:applicableMaintenanceRate(inputs,shift.shiftEndAt||shift.shiftStartAt)})); if(rows.some(x=>!Number.isFinite(x.rate)))return NaN; return rows.reduce((sum,x)=>sum+shiftKm(x.shift)*x.rate,0) }
const maintenanceProvisionThrough = (shifts, inputs, asOf) => {
  const boundary=d(asOf);if(!boundary)return NaN
  const xs=live(shifts).filter(x=>{const date=d(x.shiftEndAt||x.shiftStartAt);return date&&date<=boundary})
  if(!xs.length)return 0
  const rows=xs.map(shift=>({shift,rate:applicableMaintenanceRate(inputs,shift.shiftEndAt||shift.shiftStartAt)}))
  if(rows.some(x=>!Number.isFinite(x.rate)))return NaN
  return rows.reduce((sum,x)=>sum+shiftKm(x.shift)*x.rate,0)
}
const inclusiveCalendarDays = (fromKey, toKey) => {
  const from = dateKeyDate(fromKey), to = dateKeyDate(toKey)
  if (!from || !to || to < from) return 0
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1
}
const complianceProvisionForRecord = (record, shifts, r) => {
  const start = d(record?.validFrom), end = d(record?.validUntil), cost = n(record?.cost)
  if (!start || !end || end < start || cost <= 0) return 0
  // All validity and reporting boundaries are inclusive IST calendar dates.
  // Never derive day counts from elapsed milliseconds: timestamp offsets and
  // leap days must not change the number of covered calendar dates.
  const validityFrom = istDateKey(start), validityTo = istDateKey(end)
  const reportFrom = istDateKey(r?.from) || validityFrom
  const reportTo = istDateKey(r?.to) || validityTo
  if (!validityFrom || !validityTo || !reportFrom || !reportTo) return 0
  const overlapFrom = validityFrom > reportFrom ? validityFrom : reportFrom
  const overlapTo = validityTo < reportTo ? validityTo : reportTo
  if (overlapTo < overlapFrom) return 0
  const totalDays = inclusiveCalendarDays(validityFrom, validityTo)
  const overlapDays = inclusiveCalendarDays(overlapFrom, overlapTo)
  if (!totalDays || !overlapDays) return 0
  return cost * overlapDays / totalDays
}
const renewal = (xs, shifts, r) => live(xs).reduce((sum, record) => sum + complianceProvisionForRecord(record, shifts, r), 0)
const complianceProvisionThrough = (record, asOf) => {
  const start = d(record?.validFrom), end = d(record?.validUntil), boundary = d(asOf), cost = n(record?.cost)
  if (!start || !end || !boundary || end < start || cost <= 0) return 0
  const validityFrom = istDateKey(start), validityTo = istDateKey(end), asOfKey = istDateKey(boundary)
  if (!validityFrom || !validityTo || !asOfKey || asOfKey < validityFrom) return 0
  const accruedTo = asOfKey < validityTo ? asOfKey : validityTo
  const totalDays = inclusiveCalendarDays(validityFrom, validityTo)
  const accruedDays = inclusiveCalendarDays(validityFrom, accruedTo)
  return totalDays > 0 ? cost * accruedDays / totalDays : 0
}

export function derivePerformance(s, r, p = previousRange(r)) {
  const S = live(s.shifts), T = live(s.trips), F = live(s.fuelLogs), M = live(s.maintenance), C = live(s.compliance)
  const calc = x => {
    const sh = S.filter(a => inR(a.shiftEndAt || a.shiftStartAt, x)), tr = T.filter(a => a.status === 'COMPLETED' && inR(a.tripEndAt || a.tripStartAt, x)), fu = F.filter(a => inR(a.capturedAt, x)), ma = M.filter(a => inR(a.performedOn, x))
    const revenue = authoritativeShiftRevenue(S, x)
    const financial = sh.reduce((result, shift) => {
      const shiftTrips = T.filter(trip => trip.shiftId === shift.id && trip.status === 'COMPLETED')
      const expenses = deriveTollParkingExpenseTreatment({
        trips: shiftTrips,
        toll: shift.toll,
        parking: shift.parking,
        tollTreatment: shift.tollTreatment,
        parkingTreatment: shift.parkingTreatment,
        tollParkingCaptureMode: shift.tollParkingCaptureMode,
        tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment || 'INCLUDED',
      })
      result.financialRevenue += n(shift.revenue) - expenses.includedPassThrough
      result.toll += expenses.toll
      result.parking += expenses.parking
      result.passThroughToll += expenses.includedToll
      result.passThroughParking += expenses.includedParking
      result.excludedTollExpense += expenses.excludedTollExpense
      result.excludedParkingExpense += expenses.excludedParkingExpense
      return result
    }, { financialRevenue: 0, toll: 0, parking: 0, passThroughToll: 0, passThroughParking: 0, excludedTollExpense: 0, excludedParkingExpense: 0 })
    const vehicleKm = sh.reduce((z, a) => { const start = odometer(a.startOdometer); const end = odometer(a.endOdometer); return Number.isFinite(start) && Number.isFinite(end) && end >= start ? z + (end - start) : z }, 0)
    const tripKmIncomplete = tr.some(trip => {
      if (trip.tripKm == null || trip.tripKm === '') return true
      const km = Number(trip.tripKm)
      return !Number.isFinite(km) || km < 0
    })
    const summedBusinessKm = tr.reduce((sum, trip) => sum + Number(trip.tripKm), 0)
    const businessKmIntegrityStatus = tripKmIncomplete ? 'MISSING_TRIP_KM' : 'COMPLETE'
    const businessKm = tripKmIncomplete ? NaN : summedBusinessKm
    const openingPersonalKm = sh.reduce((sum, shift) => sum + n(shift.openingPersonalKm), 0)
    const openingDeadKm = sh.reduce((sum, shift) => sum + n(shift.openingDeadKm), 0)
    const deadKmIntegrityStatus = tripKmIncomplete ? 'MISSING_BUSINESS_KM' : businessKm > vehicleKm ? 'OVER_ESTIMATE' : 'RECONCILED'
    const deadKm = deadKmIntegrityStatus === 'RECONCILED' ? vehicleKm - businessKm : NaN
    const fuelCost = fu.reduce((z, a) => z + n(a.amount), 0), fuelQty = fu.reduce((z, a) => z + n(a.quantityKg), 0), toll = financial.toll, parking = financial.parking, maintenance = ma.reduce((z, a) => z + n(a.cost), 0), workingHours = sh.reduce((z, a) => z + hrs(a.shiftStartAt, a.shiftEndAt), 0)
    const operatingCost = fuelCost + financial.excludedTollExpense + financial.excludedParkingExpense + maintenance
    return { sh, tr, fu, ma, revenue, financialRevenue: financial.financialRevenue, passThroughToll: financial.passThroughToll, passThroughParking: financial.passThroughParking, excludedTollExpense: financial.excludedTollExpense, excludedParkingExpense: financial.excludedParkingExpense, vehicleKm, businessKm, businessKmIntegrityStatus, deadKm, deadKmIntegrityStatus, openingPersonalKm, openingDeadKm, fuelCost, fuelQty, toll, parking, maintenance, workingHours, operatingCost, operatingProfit: financial.financialRevenue - operatingCost }
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
  const maintenanceProvisionAccumulated = maintenanceProvisionThrough(S, s?.breakEvenInputs || [], r?.to)
  const maintenancePayments = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, r)).reduce((sum, x) => sum + n(x.amount), 0)
  const maintenancePaymentsAccumulated = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && d(x.settledOn || x.paidOn || x.createdAt) && d(x.settledOn || x.paidOn || x.createdAt) <= r.to).reduce((sum, x) => sum + n(x.amount), 0)
  // A settlement can exceed the provision accrued so far; the provision
  // bucket is cleared by the actual payment and must not become negative.
  const maintenanceProvisionBalance = Number.isFinite(maintenanceProvisionAccumulated) ? Math.max(0, maintenanceProvisionAccumulated - maintenancePaymentsAccumulated) : NaN
  const maintenanceProvisionExcessPayments = Number.isFinite(maintenanceProvisionAccumulated) ? Math.max(0, maintenancePaymentsAccumulated - maintenanceProvisionAccumulated) : NaN
  const historicalMaintenanceRecoveryMonthly = calculateHistoricalMaintenanceRecovery({ vehicles: s?.vehicles || [], businessStartDate: s?.businessSetup?.businessStartDate, asOf: r?.to })
  const prevMaintenanceProvision = maintenanceProvisionForShifts(S, s?.breakEvenInputs || [], p)
  const previousMaintenancePayments = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, p)).reduce((sum, x) => sum + n(x.amount), 0)
  const previousMaintenanceProvisionAccumulated = maintenanceProvisionThrough(S, s?.breakEvenInputs || [], p?.to)
  const previousMaintenancePaymentsAccumulated = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Maintenance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && d(x.settledOn || x.paidOn || x.createdAt) && d(x.settledOn || x.paidOn || x.createdAt) <= p.to).reduce((sum, x) => sum + n(x.amount), 0)
  const previousMaintenanceProvisionBalance = Number.isFinite(previousMaintenanceProvisionAccumulated) ? Math.max(0, previousMaintenanceProvisionAccumulated - previousMaintenancePaymentsAccumulated) : NaN
  const previousMaintenanceProvisionExcessPayments = Number.isFinite(previousMaintenanceProvisionAccumulated) ? Math.max(0, previousMaintenancePaymentsAccumulated - previousMaintenanceProvisionAccumulated) : NaN
  const complianceProvisionById = Object.fromEntries(live(C).map(record => [record.id, complianceProvisionForRecord(record, S, r)]))
  const complianceProvisionAccumulatedById = Object.fromEntries(live(C).map(record => [record.id, complianceProvisionThrough(record, r?.to)]))
  const compliancePaymentsById = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Compliance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && inR(x.settledOn || x.paidOn || x.createdAt, r)).reduce((map, payment) => { map[payment.sourceId] = (map[payment.sourceId] || 0) + n(payment.amount); return map }, {})
  const compliancePaymentsAccumulatedById = live(s?.settlements).filter(x => String(x.sourceType || '') === 'Compliance' && String(x.direction || 'OUT').toUpperCase() === 'OUT' && d(x.settledOn || x.paidOn || x.createdAt) && d(x.settledOn || x.paidOn || x.createdAt) <= r.to).reduce((map, payment) => { map[payment.sourceId] = (map[payment.sourceId] || 0) + n(payment.amount); return map }, {})
  const complianceProvisionBalancesById = Object.fromEntries(Object.entries(complianceProvisionAccumulatedById).map(([id, value]) => [id, Number.isFinite(value) ? Math.max(0, value - (compliancePaymentsAccumulatedById[id] || 0)) : NaN]))
  const complianceProvisionExcessPaymentsById = Object.fromEntries(Object.entries(complianceProvisionAccumulatedById).map(([id, value]) => [id, Number.isFinite(value) ? Math.max(0, (compliancePaymentsAccumulatedById[id] || 0) - value) : NaN]))
  const complianceProvisionBalance = Object.values(complianceProvisionBalancesById).reduce((sum, value) => sum + n(value), 0)
  const complianceProvisionExcessPayments = Object.values(complianceProvisionExcessPaymentsById).reduce((sum, value) => sum + n(value), 0)
  const provision = maintenanceProvision + ren
  const prevProvision = prevMaintenanceProvision + pren
  const wd = days(r.from, r.to), elapsed = wd, activeDays = new Set(a.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size, prevActive = new Set(q.sh.map(x => istDateKey(d(x.shiftEndAt || x.shiftStartAt))).filter(Boolean)).size
  const perDay = activeDays ? a.revenue / activeDays : NaN
  const provisionAdjustedProfit = a.operatingProfit - provision, prevProvisionAdjustedProfit = q.operatingProfit - prevProvision
  const costPerKm = a.vehicleKm ? a.operatingCost / a.vehicleKm : NaN
  return {
    period: { from: r.from, to: r.to, previousFrom: p.from, previousTo: p.to, timeZone: 'Asia/Kolkata' },
    authority: { revenue: 'SHIFT_END_REVENUE', vehicleKm: 'SHIFT_END_MINUS_START_ODOMETER', businessKm: 'VALIDATED_COMPLETED_TRIP_KM', deadKm: 'VEHICLE_KM_MINUS_BUSINESS_KM', costs: 'FUEL_LOGS_PLUS_BR11_TOLL_PARKING_PLUS_ACTUAL_MAINTENANCE', renewal: 'COMPLIANCE_VALIDITY_AND_COST', target: 'DRIVER_TARGET_STABILIZATION_SERVICE', breakEven: 'FINANCE_PERFORMANCE_ADAPTER' },
    completeness: { target: false, renewal: ren > 0, hourlyData: a.workingHours > 0, breakEven: false, fuelCostPerKm: Number.isFinite(fuelCostPerKm) },
    counts: { trips: a.tr.length, activeFinancialDays: activeDays, workingDays: wd, elapsedDays: elapsed, daysRemaining: Math.max(0, wd - elapsed) }, previousCounts: { trips: q.tr.length, activeFinancialDays: prevActive },
    revenue: a.revenue, financialRevenue: a.financialRevenue, previousFinancialRevenue: q.financialRevenue, passThroughToll: a.passThroughToll, passThroughParking: a.passThroughParking, excludedTollExpense: a.excludedTollExpense, excludedParkingExpense: a.excludedParkingExpense, previousRevenue: q.revenue, vehicleKm: a.vehicleKm, previousVehicleKm: q.vehicleKm, businessKm: a.businessKm, previousBusinessKm: q.businessKm, businessKmIntegrityStatus: a.businessKmIntegrityStatus, previousBusinessKmIntegrityStatus: q.businessKmIntegrityStatus, deadKm: a.deadKm, previousDeadKm: q.deadKm, deadKmIntegrityStatus: a.deadKmIntegrityStatus, previousDeadKmIntegrityStatus: q.deadKmIntegrityStatus, openingPersonalKm: a.openingPersonalKm, previousOpeningPersonalKm: q.openingPersonalKm, openingDeadKm: a.openingDeadKm, previousOpeningDeadKm: q.openingDeadKm, fuelCost: a.fuelCost, fuelQty: a.fuelQty, fuelCostPerKm, fuelCostPerKmObservations: fuelModel.observations.length, toll: a.toll, parking: a.parking, actualMaintenance: a.maintenance, workingHours: a.workingHours, previousWorkingHours: q.workingHours, runningCost: a.operatingCost, previousRunningCost: q.operatingCost, actualOperatingCost: a.operatingCost, previousActualOperatingCost: q.operatingCost,
    costPerKm, maintenanceProvision, maintenanceProvisionEvidenceStatus: Number.isFinite(maintenanceProvision) && Number.isFinite(maintenanceProvisionAccumulated) ? 'AUTHORITATIVE' : 'UNAVAILABLE', previousMaintenanceProvision: prevMaintenanceProvision, maintenanceProvisionAccumulated, previousMaintenanceProvisionAccumulated, historicalMaintenanceRecoveryMonthly, maintenancePayments, maintenancePaymentsAccumulated, previousMaintenancePayments, previousMaintenancePaymentsAccumulated, maintenanceProvisionBalance, maintenanceProvisionExcessPayments, previousMaintenanceProvisionBalance, previousMaintenanceProvisionExcessPayments, renewalProvision: ren, complianceProvisionById, complianceProvisionAccumulatedById, compliancePaymentsById, compliancePaymentsAccumulatedById, complianceProvisionBalancesById, complianceProvisionBalance, complianceProvisionExcessPaymentsById, complianceProvisionExcessPayments, otherProvision: 0, provisionRequired: provision, provisionSetAside: provision, operatingProfit: a.operatingProfit, previousOperatingProfit: q.operatingProfit, provisionAdjustedProfit, previousProvisionAdjustedProfit: prevProvisionAdjustedProfit,
    monthlyBreakEvenRevenue: NaN, revenuePerKm: a.vehicleKm ? a.financialRevenue / a.vehicleKm : NaN, revenuePerTrip: a.tr.length ? a.financialRevenue / a.tr.length : NaN, revenuePerHour: a.workingHours ? a.financialRevenue / a.workingHours : NaN, profitPerKm: a.vehicleKm ? a.operatingProfit / a.vehicleKm : NaN, profitPerHour: a.workingHours ? a.operatingProfit / a.workingHours : NaN, revenueGrowth: q.revenue ? (a.revenue - q.revenue) / Math.abs(q.revenue) * 100 : NaN, profitGrowth: q.operatingProfit ? (a.operatingProfit - q.operatingProfit) / Math.abs(q.operatingProfit) * 100 : NaN, revenuePerActiveDay: perDay, target: null,
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
