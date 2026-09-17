const finiteNumber = value => value != null && value !== '' && Number.isFinite(Number(value))
const first = (...values) => values.find(value => value != null && value !== '')

const normalizeRecord = (record, aliases, numericFields = []) => {
  if (!record) return null
  const normalized = { ...record }
  for (const [canonical, candidates] of Object.entries(aliases)) {
    const value = first(record[canonical], ...candidates.map(key => record[key]))
    if (value != null) normalized[canonical] = value
    for (const key of candidates) delete normalized[key]
  }
  for (const field of numericFields) {
    if (normalized[field] != null && normalized[field] !== '') {
      if (!finiteNumber(normalized[field])) return null
      normalized[field] = Number(normalized[field])
    }
  }
  return normalized
}

const normalizeLoan = loan => {
  const record = normalizeRecord(loan, {
    startDate: ['start_date', 'loanStartDate', 'loan_start_date'],
    tenureMonths: ['tenure_months', 'term_months'],
    annualInterestRate: ['annual_rate_percent'],
    principal: ['loanPrincipal', 'loan_principal'],
  }, ['principal', 'tenureMonths', 'annualInterestRate'])
  if (!record) return null
  if (!finiteNumber(record.tenureMonths) && finiteNumber(loan.tenureYears)) record.tenureMonths = Number(loan.tenureYears) * 12
  delete record.tenureYears
  // KFE loan rate is a domain constant. Legacy source records are normalized
  // to the frozen KFE rate rather than retaining a competing rate input.
  record.annualInterestRate = 10
  return record
}

const normalizeTrip = trip => normalizeRecord(trip, {
  tripStartAt: ['trip_start_at', 'startAt', 'start_at'],
  tripEndAt: ['trip_end_at', 'endAt', 'end_at'],
  tripKm: ['trip_km', 'distanceKm', 'distance_km'],
  revenue: ['fare', 'amount', 'totalFare', 'total_fare'],
  cancelledRevenue: ['cancelled_revenue', 'cancelledFare', 'cancelled_fare'],
}, ['tripKm', 'revenue', 'cancelledRevenue'])

const normalizeShift = shift => normalizeRecord(shift, {
  shiftStartAt: ['shift_start_at', 'startAt', 'start_at'],
  shiftEndAt: ['shift_end_at', 'endAt', 'end_at'],
  startOdometer: ['start_odometer', 'openingOdometer', 'opening_odometer'],
  endOdometer: ['end_odometer', 'closingOdometer', 'closing_odometer'],
  toll: ['tollCost', 'toll_cost'],
  parking: ['parkingCost', 'parking_cost'],
}, ['startOdometer', 'endOdometer', 'openingPersonalKm', 'openingDeadKm', 'openingPersonalToll', 'openingPersonalParking', 'totalDistance', 'revenue', 'toll', 'parking'])

const normalizeFuel = fuel => normalizeRecord(fuel, {
  capturedAt: ['createdAt', 'created_at'],
  amount: ['totalCost', 'total_cost'],
  quantityKg: ['kg', 'quantity_kg'],
}, ['odometer', 'pricePerKg', 'amount', 'quantityKg', 'latitude', 'longitude', 'accuracy'])

const normalizeMaintenance = maintenance => normalizeRecord(maintenance, {
  performedOn: ['date', 'performed_on'],
  cost: ['amount', 'costAmount', 'cost_amount'],
}, ['cost'])

const normalizeCompliance = record => normalizeRecord(record, {
  validFrom: ['valid_from'],
  validUntil: ['valid_until'],
  cost: ['amount', 'renewalCost', 'renewal_cost'],
}, ['cost'])

const normalizeLoanPayment = record => normalizeRecord(record, {
  loanId: ['loan_id'],
  paidOn: ['paid_on', 'paymentDate', 'payment_date'],
  amount: ['paidAmount', 'paid_amount'],
  charges: ['fees', 'fee'],
}, ['amount', 'charges'])

const normalizePrepayment = record => normalizeRecord(record, {
  loanId: ['loan_id'],
  paidOn: ['paid_on', 'paymentDate', 'payment_date'],
  amount: ['prepaymentAmount', 'prepayment_amount'],
}, ['amount'])

const normalizeDriverTarget = record => normalizeRecord(record, {
  effectiveFrom: ['effective_from'],
  effectiveUntil: ['effective_until'],
  desiredDriverProfit: ['desiredTakeHome', 'desiredProfit', 'desired_driver_profit', 'desired_take_home', 'desired_profit'],
}, ['desiredDriverProfit'])

const normalizeBreakEvenInput = record => normalizeRecord(record, {
  effectiveFrom: ['effective_from'],
  effectiveUntil: ['effective_until'],
  maintenanceProvisionPerKm: ['maintenance_provision_per_km'],
}, ['maintenanceProvisionPerKm'])

export const normalizeCalculationSnapshot = snapshot => ({
  shifts: (snapshot?.shifts || []).map(normalizeShift).filter(Boolean),
  trips: (snapshot?.trips || []).map(normalizeTrip).filter(Boolean),
  fuelLogs: (snapshot?.fuelLogs || []).map(normalizeFuel).filter(Boolean),
  vehicles: snapshot?.vehicles || [],
  drivers: snapshot?.drivers || [],
  compliance: (snapshot?.compliance?.length ? snapshot.compliance : (snapshot?.renewals || [])).map(normalizeCompliance).filter(Boolean),
  maintenance: (snapshot?.maintenance || []).map(normalizeMaintenance).filter(Boolean),
  driverCollectedData: snapshot?.driverCollectedData || [],
  loans: (snapshot?.loans?.length ? snapshot.loans : snapshot?.loan ? [snapshot.loan] : []).map(normalizeLoan).filter(Boolean),
  loanPayments: (snapshot?.loanPayments || []).map(normalizeLoanPayment).filter(Boolean),
  prepayments: (snapshot?.prepayments || []).map(normalizePrepayment).filter(Boolean),
  driverTargets: (snapshot?.driverTargets || []).map(normalizeDriverTarget).filter(Boolean),
  breakEvenInputs: (snapshot?.breakEvenInputs || []).map(normalizeBreakEvenInput).filter(Boolean),
})
