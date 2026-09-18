import { SyntheticDataRepository } from '../../repositories/syntheticDataRepository.js'

export const SYNTHETIC_STAGES = Object.freeze([
  { key: 'week', title: '1 week', days: 7 },
  { key: 'month', title: '1 month', days: 30 },
  { key: 'sixMonths', title: '6 months', days: 182 },
  { key: 'year', title: '1 year', days: 365 },
  { key: 'fiveYears', title: '5 years', days: 1818 },
])

const START = new Date('2026-04-09T00:00:00Z')
const KFE_START = '2026-04-09'
const END = '2031-03-31'
const OPENING_ODO = 65000
const VEHICLE_ID = 'synthetic-vehicle-1'
const DRIVER_ID = 'synthetic-driver-1'
const LOAN_ID = 'synthetic-loan-1'
const CNG_PRICE = 82
const round = value => Math.round(Number(value) * 100) / 100
const dayAt = index => new Date(Date.UTC(START.getUTCFullYear(), START.getUTCMonth(), START.getUTCDate() + index))
const isoDate = value => value.toISOString().slice(0, 10)
const at = (date, hour, minute = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 5, minute - 30)).toISOString()
const id = (kind, value) => 'synthetic-' + kind + '-' + value
const addDays = (date, days) => new Date(date.getTime() + days * 86400000)

const complianceRows = () => {
  const rows = []
  const allocations = [['Insurance', 14000], ['Road Tax', 4000], ['Permit', 3000], ['Authorization', 1500], ['Fitness', 2500]]
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const from = addDays(START, cycle * 365)
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
  const stageEnd = dayAt(days - 1)
  const stageEndDate = isoDate(stageEnd)
  const vehicles = [{ id: VEHICLE_ID, registrationNumber: 'SYN-KFE-001', make: 'Synthetic', model: 'Test Vehicle', variant: 'CNG',
    acquiredOn: '2026-04-09', acquisitionValue: 0, openingOdometerKm: OPENING_ODO, fuelType: 'CNG', tankCapacity: 14,
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

  for (let i = 0; i < days; i += 1) {
    const date = dayAt(i)
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

  const loanPayments = []
  const paymentDates = ['2026-06-25','2026-07-20','2026-08-18','2026-09-15','2026-10-12','2026-11-18','2026-12-16',
    '2027-01-17','2027-02-15','2027-03-16','2027-04-15','2027-05-16','2027-06-15','2027-07-17','2027-08-15','2027-09-16',
    '2027-10-15','2027-11-17','2027-12-15','2028-01-17','2028-02-15','2028-03-16','2028-04-15','2028-05-17','2028-06-15',
    '2028-07-17','2028-08-15','2028-09-16','2028-10-15','2028-11-17','2028-12-15','2029-01-17','2029-02-15','2029-03-16',
    '2029-04-15','2029-05-17','2029-06-15','2029-07-17','2029-08-15','2029-09-16','2029-10-15','2029-11-17','2029-12-15',
    '2030-01-17','2030-02-15','2030-03-16','2030-04-15','2030-05-17','2030-06-15','2030-07-17','2030-08-15','2030-09-16',
    '2030-10-15','2030-11-17','2030-12-15','2031-01-17','2031-02-15','2031-03-16']
  paymentDates.forEach((paidOn, index) => {
    if (paidOn <= END) loanPayments.push({ id: id('loan-payment', index + 1), loanId: LOAN_ID, paidOn, amount: 11685.87,
      status: 'Paid', notes: index === 0 ? 'First EMI paid late; synthetic delayed-payment scenario.' : 'Synthetic delayed EMI payment.', synthetic: true })
  })

  const driverTargets = [{ id: id('target', 1), driverId: DRIVER_ID, effectiveFrom: KFE_START, effectiveUntil: END,
    desiredDriverProfit: 1000, targetHours: 12, targetKm: 300, active: true, synthetic: true }]
  const breakEvenInputs = [
    { id: id('break-even', 'pre-kfe'), effectiveFrom: '2026-04-01', effectiveUntil: '2026-04-08', maintenanceProvisionPerKm: 0.6, active: true, synthetic: true },
    { id: id('break-even', 'kfe'), effectiveFrom: KFE_START, effectiveUntil: END, maintenanceProvisionPerKm: 1.6, active: true, synthetic: true },
  ]
  const settings = [{ id: 'synthetic-setting-manifest', settingKey: 'synthetic_dataset_manifest',
    values: { synthetic: true, startDate: '2026-04-09', endDate: END, days, kfeStartDate: KFE_START, maintenancePreKfe: 0.6, maintenanceKfe: 1.6 },
    updatedAt: new Date().toISOString() }]
  const loan = [{ id: LOAN_ID, lender: 'Synthetic Bank', accountReference: 'SYN-LOAN-001', principal: 550000,
    tenureMonths: 60, startDate: '2026-04-09', annualInterestRatePercent: 10, status: 'Active', synthetic: true }]

  return {
    shifts, fuel_logs, odoGaps, days: daysStore, trips, gps_snapshots: [], movement_artifacts: [],
    vehicles, drivers, compliance_records: complianceRows().filter(row => row.validFrom <= stageEndDate), maintenance_records,
    loans: loan, loan_payments: loanPayments.filter(row => row.paidOn <= stageEndDate), prepayments: [], driver_targets: driverTargets, break_even_inputs: breakEvenInputs,
    settings, pending_mutations: [], audit_history: [],
  }
}

export const getSyntheticDataStatus = () => SyntheticDataRepository.getStatus()

export const loadSyntheticStage = async key => {
  const stage = SYNTHETIC_STAGES.find(item => item.key === key)
  if (!stage) throw new Error('Unknown synthetic data stage.')
  const snapshot = buildSyntheticSnapshot(stage.days)
  await SyntheticDataRepository.writeSnapshot(snapshot)
  SyntheticDataRepository.activate()
  return { stage: stage.title, counts: Object.fromEntries(Object.entries(snapshot).map(entry => [entry[0], entry[1].length])) }
}

export const clearSyntheticData = () => SyntheticDataRepository.clear()

export const SyntheticDataService = Object.freeze({ buildSyntheticSnapshot, loadSyntheticStage, getSyntheticDataStatus, clearSyntheticData, SYNTHETIC_STAGES })
