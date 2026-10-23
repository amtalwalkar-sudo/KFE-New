import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { calculateRollingFuelCostPerKm } from '../../domain/math/fuel.js'
import { istDayRange, istMonthRange } from '../../domain/time/ist.js'

const timestamp = value => {
  if (value == null || value === '') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.getTime() : null
}
const eventTime = trip => timestamp(trip?.tripStartAt || trip?.createdAt || trip?.tripEndAt)
const fuelTime = fuel => timestamp(fuel?.capturedAt || fuel?.createdAt)
export const isWithinPeriod = (value, range) => {
  const time = timestamp(value)
  return time != null && (!range || (time >= range.from.getTime() && time <= range.to.getTime()))
}
const finiteDurationMs = (start, end) => {
  const a = timestamp(start), b = timestamp(end)
  return a != null && b != null && b >= a ? b - a : null
}
const isTerminalTrip = trip => trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED'
const eligibleRevenue = trip => {
  if (trip?.status === 'CANCELLED') {
    const fee = trip.cancelledRevenue
    return fee == null || fee === '' || !Number.isFinite(Number(fee)) ? 0 : Math.max(0, Number(fee))
  }
  if (trip?.status !== 'COMPLETED' || trip?.fareDetailsSkipped === true) return 0
  const fare = trip?.revenue
  return fare == null || fare === '' || !Number.isFinite(Number(fare)) ? 0 : Math.max(0, Number(fare))
}
const pickupDurationMs = trip => {
  if (!isTerminalTrip(trip)) return null
  // Passenger pickup ends when ride starts. If cancelled before pickup, use cancellation/end time.
  const end = timestamp(trip.tripStartAt) ?? timestamp(trip.tripEndAt)
  return finiteDurationMs(trip.createdAt, end)
}
const rideDurationMs = trip => {
  if (!isTerminalTrip(trip)) return null
  // A cancellation before passenger pickup still consumes time; completed rides use passenger ride time.
  const start = timestamp(trip.tripStartAt) ?? (trip.status === 'CANCELLED' ? timestamp(trip.createdAt) : null)
  return finiteDurationMs(start, trip.tripEndAt)
}
const validFullTankIntervals = logs => {
  const groups = new Map()
  for (const row of Array.isArray(logs) ? logs : []) {
    const at = fuelTime(row)
    const vehicleId = row?.vehicleId == null || String(row.vehicleId).trim() === '' ? null : String(row.vehicleId)
    if (at == null || !vehicleId || row?.isFullTank !== true
      || !Number.isFinite(Number(row.odometer)) || Number(row.odometer) < 0
      || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) continue
    if (!groups.has(vehicleId)) groups.set(vehicleId, [])
    groups.get(vehicleId).push(row)
  }
  const intervals = []
  for (const [vehicleId, rows] of groups) {
    rows.sort((a,b) => fuelTime(a)-fuelTime(b) || Number(a.odometer)-Number(b.odometer))
    for (let i=1;i<rows.length;i++) {
      const previous=rows[i-1], current=rows[i]
      const km=Number(current.odometer)-Number(previous.odometer)
      const cost=Number(current.amount)
      const stored=Number(current.quantityKg)
      const quantityKg=Number.isFinite(stored)&&stored>0 ? stored : (Number(current.pricePerKg)>0 ? cost/Number(current.pricePerKg) : null)
      const at=fuelTime(current)
      if (!(km>0) || !(cost>0) || !(quantityKg>0)) continue
      intervals.push({vehicleId, at, km, cost, quantityKg, mileageKmPerKg:km/quantityKg, costPerKm:cost/km})
    }
  }
  return intervals.sort((a,b)=>a.at-b.at)
}

export const ActivityTimelineService = Object.freeze({
  async get({ period, anchor }) {
    let range = null
    if (period === 'today') range = istDayRange(anchor)
    else if (period === 'month') range = istMonthRange(anchor, new Date())
    else if (period === 'week') {
      const dayRange = istDayRange(anchor)
      if (!dayRange) throw new Error('Invalid timeline date.')
      const day = new Date(dayRange.from.getTime() + 12*60*60*1000)
      const monday = new Date(day.getTime() - ((day.getUTCDay()+6)%7)*86400000)
      const sunday = new Date(monday.getTime()+6*86400000)
      range = {from:istDayRange(monday).from,to:istDayRange(sunday).to}
    } else if (period !== 'all') throw new Error('Unknown timeline period.')
    if (!range) range = {from:new Date(0),to:new Date()}
    if (!range) throw new Error('Invalid timeline date.')

    const [allTrips, allFuel, allShifts] = await Promise.all([
      ShiftTripRepository.getAllTrips(),
      FuelRepository.getAll(),
      ShiftTripRepository.getAllShifts()
    ])
    const trips = allTrips.filter(isTerminalTrip).filter(trip => isWithinPeriod(eventTime(trip), range))
      .sort((a,b)=>(eventTime(b)||0)-(eventTime(a)||0))
    const fuel = allFuel.filter(row => isWithinPeriod(fuelTime(row), range))
      .sort((a,b)=>(fuelTime(b)||0)-(fuelTime(a)||0))
    const tripHoursMs = trips.reduce((sum,trip)=>sum+(rideDurationMs(trip)??0),0)
    const pickupHoursMs = trips.reduce((sum,trip)=>sum+(pickupDurationMs(trip)??0),0)
    const timedTrips = trips.filter(trip=>rideDurationMs(trip)!=null)
    const timedRevenue = timedTrips.reduce((sum,trip)=>sum+eligibleRevenue(trip),0)
    // Use the selected period's end-time intervals, while allowing the prior full-tank
    // reading to serve as a baseline. Existing fuel records remain the sole data source.
    const intervals = validFullTankIntervals(allFuel).filter(item => isWithinPeriod(item.at, range))
    const distance = intervals.reduce((sum,item)=>sum+item.km,0)
    const fuelCost = intervals.reduce((sum,item)=>sum+item.cost,0)
    const quantityKg = intervals.reduce((sum,item)=>sum+item.quantityKg,0)
    const locationTripIds = [...new Set(trips.map(trip=>trip.id))]
    const shiftIds = new Set(allShifts.filter(shift => isWithinPeriod(shift.shiftStartAt || shift.createdAt, range)).map(shift=>shift.id))
    return {
      range, trips, fuel, shifts: allShifts.filter(shift=>shiftIds.has(shift.id)),
      metrics: {
        tripHours: tripHoursMs/3600000,
        averageFarePerHour: tripHoursMs>0 ? timedRevenue/(tripHoursMs/3600000) : null,
        totalPickupTravelMinutes: pickupHoursMs/60000,
        averageCostPerKm: distance>0 ? fuelCost/distance : null,
        averageMileageKmPerKg: quantityKg>0 ? distance/quantityKg : null,
        fuelIntervals: intervals.length,
      },
      locationTripIds,
    }
  },
  // Exported pure helpers make edge-case behavior directly contract-testable.
  pickupDurationMs, rideDurationMs, eligibleRevenue, validFullTankIntervals, isWithinPeriod,
})
