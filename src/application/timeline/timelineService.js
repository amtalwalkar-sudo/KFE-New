import { OperationalRecordService } from '../../services/operationalRecordService.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { DriverTargetService } from '../performance/driverTargetService.js'
import { istDateKey, istDayRange } from '../../domain/time/ist.js'

const live = value => !value?.deletedAt && value?.deleted !== true
const completed = shift => shift?.status === 'COMPLETED'
const inRange = (value, range) => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) && time >= range.from.getTime() && time <= range.to.getTime()
}
const sum = (items, getter) => items.reduce((total, item) => total + (Number.isFinite(Number(getter(item))) ? Number(getter(item)) : 0), 0)
const shiftDate = shift => istDateKey(shift?.shiftStartAt || shift?.createdAt)

const operationalForRange = async range => {
  const shifts = (await ShiftTripRepository.getAllShifts()).filter(live).filter(shift => inRange(shift.shiftStartAt || shift.createdAt, range))
  const records = await Promise.all(shifts.map(shift => OperationalRecordService.reconstructShift(shift.id)))
  return records.filter(Boolean)
}

const toSummary = records => ({
  shifts: records,
  completedShifts: records.filter(record => completed(record.shift)),
  rides: sum(records, record => record.completedTrips.length),
  vehicleKm: sum(records, record => record.vehicleKm),
  businessKm: sum(records, record => record.businessKm),
  personalKm: sum(records, record => record.shift.openingPersonalKm),
  deadKm: sum(records, record => record.deadKm),
  fuelQuantityKg: sum(records, record => record.fuelQuantityKg),
  fuelCost: sum(records, record => record.fuelCost),
  toll: sum(records, record => record.toll),
  parking: sum(records, record => record.parking),
  authoritativeRevenue: sum(records.filter(record => completed(record.shift)), record => record.revenue),
})

export const TimelineService = Object.freeze({
  async getDay(date) {
    const range = istDayRange(date)
    if (!range) throw new Error('Invalid timeline day.')
    const records = await operationalForRange(range)
    const target = await DriverTargetService.getTarget(date)
    const trips = records.flatMap(record => record.trips.filter(trip => trip.status === 'COMPLETED' || trip.status === 'CANCELLED'))
    const fuel = records.flatMap(record => record.fuelLogs)
    const events = [
      ...trips.map(trip => ({ type: 'TRIP', id: trip.id, at: trip.tripStartAt, record: trip })),
      ...fuel.map(log => ({ type: 'FUEL', id: log.id, at: log.capturedAt || log.createdAt, record: log })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at))
    return { ...toSummary(records), target, events, range }
  },
  async getWeek(range) {
    const records = await operationalForRange(range)
    const summary = toSummary(records)
    const byDay = new Map()
    for (const record of records) {
      const key = shiftDate(record.shift)
      if (!key) continue
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(record)
    }
    return {
      ...summary,
      days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayRecords]) => ({ date, ...toSummary(dayRecords) })),
      range,
    }
  },
  async getMonth(range) {
    const records = await operationalForRange(range)
    const summary = toSummary(records)
    const byWeek = new Map()
    for (const record of records) {
      const date = new Date(record.shift.shiftStartAt || record.shift.createdAt)
      const dayRange = istDayRange(date)
      if (!dayRange) continue
      const day = new Date(dayRange.from.getTime() + 12 * 60 * 60 * 1000)
      const weekday = day.getUTCDay()
      const monday = new Date(day.getTime() - ((weekday + 6) % 7) * 86400000)
      const key = istDateKey(monday)
      if (!key) continue
      if (!byWeek.has(key)) byWeek.set(key, [])
      byWeek.get(key).push(record)
    }
    return {
      ...summary,
      weeks: [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, weekRecords]) => ({ start, ...toSummary(weekRecords) })),
      range,
    }
  },
  async getPersonal(range) {
    const records = await operationalForRange(range)
    const entries = records
      .filter(record => Number(record.shift.openingPersonalKm || 0) > 0)
      .map(record => ({
        id: `${record.shift.id}:personal`,
        shiftId: record.shift.id,
        date: shiftDate(record.shift),
        startAt: record.shift.shiftStartAt,
        endAt: record.shift.shiftEndAt,
        personalKm: Number(record.shift.openingPersonalKm || 0),
        toll: Number(record.shift.openingPersonalToll || 0),
        parking: Number(record.shift.openingPersonalParking || 0),
      }))
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    return { entries, totalKm: sum(entries, entry => entry.personalKm), totalToll: sum(entries, entry => entry.toll), totalParking: sum(entries, entry => entry.parking), range }
  },
})
