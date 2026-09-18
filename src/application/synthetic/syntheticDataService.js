import { SyntheticDataRepository } from '../../repositories/syntheticDataRepository.js'
import { setSyntheticDateContext, clearSyntheticDateContext } from '../../domain/time/ist.js'

export const SYNTHETIC_STAGES = Object.freeze([
  { key: 'week', title: '1 week', days: 7 },
  { key: 'month', title: '1 month', days: 30 },
  { key: 'sixMonths', title: '6 months', days: 182 },
  { key: 'year', title: '1 year', days: 365 },
  { key: 'fiveYears', title: '5 years', days: 1818 },
])

const ACQUISITION_START = new Date('2026-04-09T00:00:00Z')
const BUSINESS_START = new Date('2026-05-01T00:00:00Z')
const KFE_START = '2026-05-01'
const OPENING_ODO = 65000
const VEHICLE_ID = 'synthetic-vehicle-1'
const DRIVER_ID = 'synthetic-driver-1'
const LOAN_ID = 'synthetic-loan-1'
const CNG_PRICE = 82
const round = value => Math.round(Number(value) * 100) / 100
const dayAt = (index, start = BUSINESS_START) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + index))
const isoDate = value => value.toISOString().slice(0, 10)
const at = (date, hour, minute = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 5, minute - 30)).toISOString()
const id = (kind, value) => 'synthetic-' + kind + '-' + value
const addDays = (date, days) => new Date(date.getTime() + days * 86400000)
const nowIstDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce((out, part) => { if (part.type !== 'literal') out[part.type] = part.value; return out }, {})
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) }
}
const dateFromKey = key => new Date(`${key}T00:00:00Z`)
const activeStageWindow = days => {
  const now = new Date()
  const todayKey = nowIstDate().date
  const today = dateFromKey(todayKey)
  const dataEnd = addDays(today, -1)
  const requestedStart = addDays(dataEnd, -(days - 1))
  const start = requestedStart < BUSINESS_START ? BUSINESS_START : requestedStart
  const generatedDays = Math.max(1, Math.floor((dataEnd.getTime() - start.getTime()) / 86400000) + 1)
  return { start, today, todayKey, dataEnd, now, generatedDays }
}
const capToNow = value => {
  const date = new Date(value)
  const now = new Date()
  return date.getTime() > now.getTime() ? now.toISOString() : value
}

const complianceRows = () => {
  const rows = []
  const allocations = [['Insurance', 14000], ['Road Tax', 4000], ['Permit', 3000], ['Authorization', 1500], ['Fitness', 2500]]
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const from = addDays(BUSINESS_START, cycle * 365)
    const until = addDays(from, 364)
    for (const item of allocations) rows.push({
      id: id('compliance', cycle + '-' + item[0].toLowerCase().replace(/ /g, '-')),
      vehicleId: VEHICLE_ID, complianceType: item[0], referenceNumber: 'SYN-' + cycle + '-' + item[0],
      validFrom: isoDate(from), validUntil: isoDate(until), cost: item[1],
      notes: 'Synthetic annual allocation; total annual renewals = ₹25,000.', synthetic: true,
    })
  }
  return rows
}

export const buildSyntheticSnapshot = days => {
  const window = activeStageWindow(days)
  const stageEnd = window.dataEnd
  const stageEndDate = window.todayKey
  const stageStart = window.start
  const generatedDays = window.generatedDays
  const vehicles = [{ id: VEHICLE_ID, registrationNumber: 'SYN-KFE-001', make: 'Synthetic', model: 'Test Vehicle', variant: 'CNG',
    acquiredOn: isoDate(ACQUISITION_START), acquisitionValue: 0, openingOdometerKm: OPENING_ODO, fuelType: 'CNG', tankCapacity: 14,
    status: 'Active', active: true, synthetic: true }]
  const drivers = [{ id: DRIVER_ID, name: 'Synthetic Driver', phone: '0000000000', licenseNumber: 'SYN-LICENSE',
    licenseExpiry: '2031-04-08', joinedOn: '2026-04-09', status: 'Active', vehicleId: VEHICLE_ID, synthetic: true }]
  const shifts = [], trips = [], fuel_logs = [], odoGaps = [], maintenance_records = [], daysStore = []
  let odometer = OPENING_ODO
  let maintenanceBase = OPENING_ODO

  const preKfeKm = 200
  maintenance_records.push({ id: id('maintenance', 'pre-kfe'), vehicleId: VEHICLE_ID, performedOn: '2026-04-09',
    maintenanceType: 'Service', odometerKm: OPENING_ODO + preKfeKm, cost: round(preKfeKm * 0.6),
    vendor: 'Synthetic Workshop', validityType: 'None', notes: 'Pre-KFE synthetic history at ₹0.60/km.', synthetic: true })
  odometer += preKfeKm

  for (let i = 0; i < generatedDays; i += 1) {
    const date = dayAt(i, stageStart)
    const dayIndex = i
    const isCity = ((dayIndex * 37) % 100) < 30
    const vehicleKm = isCity ? 200 : 400
    const gapKm = dayIndex === 0 ? 0 : 12 + ((dayIndex * 7) % 19)
    const startOdo = odometer + gapKm
    if (gapKm > 0) odoGaps.push({ id: id('gap', i), previousOdometer: odometer, newOdometer: startOdo, gapDistance: gapKm,
      reason: 'SYNTHETIC_PRE_SHIFT_MOVEMENT', category: dayIndex % 3 === 0 ? 'PERSONAL_TRIPS' : 'DEAD_MILES',
      createdAt: at(date, 6, 50), updatedAt: at(date, 6, 50), synthetic: true })

    const endOdo = startOdo + vehicleKm
    const shiftId = id('shift', i)
    const toll = isCity ? 80 + ((dayIndex * 11) % 121) : 180 + ((dayIndex * 17) % 321)
    const parking = isCity ? 40 + ((dayIndex * 5) % 81) : 70 + ((dayIndex * 13) % 131)
    const treatment = dayIndex % 2 === 0 ? 'INCLUDED' : 'EXCLUDED'
    const tripCount = isCity ? 7 : 4
    const rideKmTarget = isCity ? 160 : 315
    let remaining = rideKmTarget
    let supportingFare = 0

    for (let t = 0; t < tripCount; t += 1) {
      const tripKm = t === tripCount - 1 ? remaining : Math.max(12, Math.round((remaining / (tripCount - t)) * (0.8 + ((dayIndex + t) % 5) * 0.1)))
      remaining -= tripKm
      const includedCharges = treatment === 'INCLUDED' && t === tripCount - 1 ? toll + parking : 0
      const fare = round(Math.max(120, tripKm * (isCity ? 11.5 : 7.5)) + includedCharges)
      supportingFare += fare
      const startMinutes = 8 * 60 + t * Math.floor(9 * 60 / tripCount)
      const endMinutes = startMinutes + (isCity ? 35 + ((dayIndex + t) % 25) : 70 + ((dayIndex + t) % 35))
      const tripStartAt = at(date, Math.floor(startMinutes / 60), startMinutes % 60)
      const tripEndAt = at(date, Math.floor(endMinutes / 60), endMinutes % 60)
      trips.push({ id: id('trip', i + '-' + t), shiftId, dayId: id('day', isoDate(date)), operator: ['Uber', 'Ola', 'Rapido', 'Savaari'][t % 4],
        tripStartAt, tripEndAt, status: 'COMPLETED', tripStartLocation: { placeName: isCity ? 'Mumbai City' : 'Mumbai Intercity' },
        tripEndLocation: { placeName: isCity ? 'Mumbai City' : ['Nashik', 'Pune', 'Thane'][dayIndex % 3] }, tripKm,
        tripKmAuthority: 'MANUAL', tripKmProvenance: 'SYNTHETIC', revenue: fare, revenueAuthority: 'SUPPORTING_ONLY',
        revenueProvenance: treatment === 'INCLUDED' ? 'SYNTHETIC_FARE_INCLUDES_TOLL_PARKING' : 'SYNTHETIC_FARE_EXCLUDES_TOLL_PARKING',
        cancelledRevenue: null, cancelReason: null, synthetic: true, createdAt: tripStartAt, updatedAt: tripEndAt })
    }

    const baseRevenue = round(175 * 12 * (0.9 + ((dayIndex * 13) % 21) / 100))
    const shiftRevenue = treatment === 'INCLUDED' ? round(baseRevenue + toll + parking) : baseRevenue
    const shiftStartAt = at(date, 7)
    const shiftEndAt = at(date, 19)
    shifts.push({ id: shiftId, startOdometer: startOdo, endOdometer: endOdo, openingPersonalKm: 0, openingDeadKm: gapKm,
      openingPersonalToll: 0, openingPersonalParking: 0, totalDistance: vehicleKm, revenue: shiftRevenue, toll, parking,
      tollParkingRevenueTreatment: treatment, shiftStartAt, shiftEndAt, status: 'COMPLETED', synthetic: true, createdAt: shiftStartAt, updatedAt: shiftEndAt })

    const quantity = round(vehicleKm / (isCity ? 20 : 30))
    fuel_logs.push({ id: id('fuel', i), odometer: endOdo, pricePerKg: CNG_PRICE, amount: round(quantity * CNG_PRICE),
      quantityKg: quantity, isFullTank: true, latitude: null, longitude: null, accuracy: null,
      provenance: 'SYNTHETIC_TANK_FULL_TO_FULL', capturedAt: shiftEndAt, createdAt: shiftEndAt, updatedAt: shiftEndAt, synthetic: true })
    if (endOdo - maintenanceBase >= 10000) {
      maintenance_records.push({ id: id('maintenance', i), vehicleId: VEHICLE_ID, performedOn: isoDate(date),
        maintenanceType: ['Service', 'Tyres', 'Repair', 'Battery'][dayIndex % 4], odometerKm: endOdo,
        cost: round((endOdo - maintenanceBase) * 1.6), vendor: 'Synthetic Workshop', validityType: 'None',
        notes: 'KFE synthetic maintenance at ₹1.60/km.', synthetic: true })
      maintenanceBase = endOdo
    }
    daysStore.push({ id: id('day', isoDate(date)), dayStartAt: at(date, 0), status: 'COMPLETED', synthetic: true })
    odometer = endOdo
  }

  // Synthetic baseline intentionally contains no EMI payments. The business/loan is
  // treated as unpaid through the real current date so overdue/loan-position logic
  // can be exercised interactively in Synthetic Mode.
  const loanPayments = []

  const driverTargets = [{ id: id('target', 1), driverId: DRIVER_ID, effectiveFrom: KFE_START, effectiveUntil: stageEndDate,
    desiredDriverProfit: 1000, targetHours: 12, targetKm: 300, active: true, synthetic: true }]
  const breakEvenInputs = [
    { id: id('break-even', 'pre-kfe'), effectiveFrom: '2026-04-01', effectiveUntil: '2026-04-08', maintenanceProvisionPerKm: 0.6, active: true, synthetic: true },
    { id: id('break-even', 'kfe'), effectiveFrom: KFE_START, effectiveUntil: stageEndDate, maintenanceProvisionPerKm: 1.6, active: true, synthetic: true },
  ]
  const settings = [{ id: 'synthetic-setting-manifest', settingKey: 'synthetic_dataset_manifest',
    values: { synthetic: true, startDate: KFE_START, endDate: stageEndDate, days: generatedDays, requestedStageDays: days, kfeStartDate: KFE_START, maintenancePreKfe: 0.6, maintenanceKfe: 1.6, currentDateTime: window.now.toISOString(), emiPaidThrough: null },
    updatedAt: new Date().toISOString() }]
  const loan = [{ id: LOAN_ID, lender: 'Synthetic Bank', accountReference: 'SYN-LOAN-001', principal: 550000,
    tenureMonths: 60, startDate: KFE_START, annualInterestRatePercent: 10, status: 'Active', synthetic: true }]

  return {
    shifts, fuel_logs, odoGaps, days: daysStore, trips, gps_snapshots: [], movement_artifacts: [],
    vehicles, drivers, compliance_records: complianceRows().filter(row => row.validFrom <= stageEndDate), maintenance_records,
    loans: loan, loan_payments: loanPayments.filter(row => row.paidOn <= stageEndDate), prepayments: [], driver_targets: driverTargets, break_even_inputs: breakEvenInputs,
    settings, pending_mutations: [], audit_history: [],
  }
}

export const getSyntheticDataStatus = () => SyntheticDataRepository.getStatus()
export const getActiveDataSource = () => SyntheticDataRepository.activeDataSource()

export const loadSyntheticStage = async key => {
  const stage = SYNTHETIC_STAGES.find(item => item.key === key)
  if (!stage) throw new Error('Unknown synthetic data stage.')
  const snapshot = buildSyntheticSnapshot(stage.days)
  await SyntheticDataRepository.writeSnapshot(snapshot)
  SyntheticDataRepository.activate()
  const manifest = snapshot.settings?.find(record => record.id === 'synthetic-setting-manifest')?.values
  setSyntheticDateContext({ startDate: manifest?.startDate || KFE_START, endDate: manifest?.endDate || new Date().toISOString().slice(0, 10), endAt: manifest?.currentDateTime || new Date().toISOString() })
  return { stage: stage.title, counts: Object.fromEntries(Object.entries(snapshot).map(entry => [entry[0], entry[1].length])) }
}

export const clearSyntheticData = async () => {
  const result = await SyntheticDataRepository.clear()
  clearSyntheticDateContext()
  return result
}

export const SyntheticDataService = Object.freeze({ buildSyntheticSnapshot, loadSyntheticStage, getSyntheticDataStatus, getActiveDataSource, clearSyntheticData, SYNTHETIC_STAGES })
