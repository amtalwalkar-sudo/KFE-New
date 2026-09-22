const LIVE = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const amountOf = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
const inRange = (value, range) => { const date = dateOf(value); return !!date && (!range?.from || date >= range.from) && (!range?.to || date <= range.to) }
const fact = ({ id, factType, basis, direction, amount, occurredOn = null, sourceType, sourceId = null, evidenceStatus = 'AUTHORITATIVE', status = 'AVAILABLE', metadata = {} }) => ({
  id, factType, basis, direction, amount, occurredOn, sourceType, sourceId, evidenceStatus, status, metadata,
})

/**
 * FAH-3 financial fact model.
 *
 * This is a canonical financial representation layer, not a second calculation
 * engine. Amounts already calculated by the authoritative performance/finance
 * domains are mapped into explicit facts. Facts distinguish actual expense,
 * obligation, payment, provision, capex and cash settlement.
 *
 * Important: an expense fact is not silently promoted to a cash fact. Cash,
 * receivable and payable positions require explicit settlement/position records.
 */
export function deriveFinancialFactModel({ snapshot = {}, metrics = {}, range = {} } = {}) {
  const facts = []
  const add = value => { if (value) facts.push(value) }

  const revenue = amountOf(metrics.revenue)
  if (revenue != null) {
    add(fact({
      id: `revenue:${range?.to?.toISOString?.() || 'period'}`,
      factType: 'REVENUE',
      basis: 'ACTUAL',
      direction: 'IN',
      amount: revenue,
      occurredOn: range?.to?.toISOString?.() || null,
      sourceType: 'SHIFT_END_REVENUE',
      evidenceStatus: 'AUTHORITATIVE',
      metadata: { authority: 'SHIFT_END_REVENUE' },
    }))
  }

  const operatingCosts = [
    ['FUEL_EXPENSE', metrics.fuelCost, 'FUEL_LOGS'],
    ['TOLL_EXPENSE', metrics.toll, 'SHIFT_TOLL'],
    ['PARKING_EXPENSE', metrics.parking, 'SHIFT_PARKING'],
    ['MAINTENANCE_EXPENSE', metrics.actualMaintenance, 'MAINTENANCE_RECORDS'],
  ]
  for (const [factType, amount, sourceType] of operatingCosts) {
    const value = amountOf(amount)
    if (value != null) add(fact({
      id: `${factType.toLowerCase()}:${range?.to?.toISOString?.() || 'period'}`,
      factType,
      basis: 'ACTUAL',
      direction: 'OUT',
      amount: value,
      occurredOn: range?.to?.toISOString?.() || null,
      sourceType,
      evidenceStatus: 'AUTHORITATIVE',
    }))
  }

  const scheduledObligation = amountOf(metrics.loanScheduledObligation)
  if (scheduledObligation != null) add(fact({
    id: `financing-obligation:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'FINANCING_OBLIGATION',
    basis: 'OBLIGATION',
    direction: 'OUT',
    amount: scheduledObligation,
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'CANONICAL_LOAN_ENGINE',
    evidenceStatus: metrics.completeness?.loan ? 'AUTHORITATIVE' : 'UNAVAILABLE',
    status: metrics.completeness?.loan ? 'AVAILABLE' : 'UNAVAILABLE',
    metadata: { authority: 'CANONICAL_FINANCE_LOAN_ENGINE' },
  }))

  const financingOutflow = amountOf(metrics.actualFinancingOutflow)
  if (financingOutflow != null) add(fact({
    id: `financing-payment:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'FINANCING_PAYMENT',
    basis: 'ACTUAL',
    direction: 'OUT',
    amount: financingOutflow,
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'LOAN_PAYMENTS_PLUS_APPLIED_PREPAYMENTS',
    evidenceStatus: 'AUTHORITATIVE',
    metadata: {
      loanPayment: amountOf(metrics.actualLoanPaid) || 0,
      prepayment: amountOf(metrics.actualPrepayment) || 0,
    },
  }))

  const maintenanceProvision = amountOf(metrics.maintenanceProvision)
  if (maintenanceProvision != null) add(fact({
    id: `maintenance-provision:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'MAINTENANCE_PROVISION',
    basis: 'PROVISION',
    direction: 'OUT',
    amount: maintenanceProvision,
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'AUTHORITATIVE_BREAK_EVEN',
    evidenceStatus: metrics.calculationEvidence?.breakEven?.status || 'UNAVAILABLE',
    status: metrics.calculationEvidence?.breakEven?.status === 'AUTHORITATIVE' ? 'AVAILABLE' : 'UNAVAILABLE',
  }))

  const renewalProvision = amountOf(metrics.renewalProvision)
  if (renewalProvision != null) add(fact({
    id: `renewal-provision:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'RENEWAL_PROVISION',
    basis: 'PROVISION',
    direction: 'OUT',
    amount: renewalProvision,
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'COMPLIANCE_VALIDITY_AND_COST',
    evidenceStatus: 'AUTHORITATIVE',
    status: 'AVAILABLE',
  }))

  const maintenanceVariance = maintenanceProvision != null && amountOf(metrics.actualMaintenance) != null
    ? amountOf(metrics.actualMaintenance) - maintenanceProvision
    : null
  if (maintenanceVariance != null) add(fact({
    id: `maintenance-variance:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'ACTUAL_VS_PROVISION_VARIANCE',
    basis: 'VARIANCE',
    direction: maintenanceVariance >= 0 ? 'OUT' : 'IN',
    amount: Math.abs(maintenanceVariance),
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'MAINTENANCE_ACTUAL_VS_PROVISION',
    evidenceStatus: 'AUTHORITATIVE',
    metadata: { component: 'MAINTENANCE', signedVariance: maintenanceVariance },
  }))

  const compliancePayments = LIVE(snapshot?.settlements)
    .filter(payment => String(payment.sourceType || '') === 'Compliance')
    .filter(payment => String(payment.direction || (payment.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase() === 'OUT')
  const renewalActual = compliancePayments
    .filter(payment => inRange(payment.settledOn || payment.paidOn || payment.createdAt, range))
    .map(payment => amountOf(payment.amount))
    .filter(value => value != null)
    .reduce((sum, value) => sum + value, 0)
  const hasCompliancePayments = compliancePayments.some(payment => inRange(payment.settledOn || payment.paidOn || payment.createdAt, range))
  const renewalVariance = renewalProvision != null && hasCompliancePayments
    ? renewalActual - renewalProvision
    : null
  if (renewalActual || hasCompliancePayments) add(fact({
    id: `renewal-payment:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'RENEWAL_PAYMENT',
    basis: 'ACTUAL',
    direction: 'OUT',
    amount: renewalActual,
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'COMPLIANCE_SETTLEMENTS',
    evidenceStatus: 'AUTHORITATIVE',
  }))
  if (renewalVariance != null) add(fact({
    id: `renewal-variance:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'ACTUAL_VS_PROVISION_VARIANCE',
    basis: 'VARIANCE',
    direction: renewalVariance >= 0 ? 'OUT' : 'IN',
    amount: Math.abs(renewalVariance),
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'RENEWAL_ACTUAL_VS_PROVISION',
    evidenceStatus: 'AUTHORITATIVE',
    metadata: { component: 'RENEWAL', signedVariance: renewalVariance },
  }))

  const vehicles = LIVE(snapshot?.vehicles)
  for (const vehicle of vehicles) {
    const value = amountOf(vehicle.acquisitionValue)
    const acquiredOn = vehicle.acquiredOn || vehicle.acquisitionDate
    if (value != null && inRange(acquiredOn, range)) add(fact({
      id: `capex:${vehicle.id}`,
      factType: 'CAPEX',
      basis: 'ACTUAL',
      direction: 'OUT',
      amount: value,
      occurredOn: dateOf(acquiredOn)?.toISOString() || null,
      sourceType: 'VEHICLE_ACQUISITION_RECORD',
      sourceId: vehicle.id,
      evidenceStatus: 'AUTHORITATIVE',
      metadata: { cashSettlement: 'NOT_ESTABLISHED_BY_ACQUISITION_RECORD' },
    }))
  }

  const settlements = LIVE(snapshot?.settlements).filter(record => inRange(record.settledOn || record.paidOn || record.createdAt, range))
  const settlementCashMovement = settlements.reduce((sum, record) => {
    const amount = amountOf(record.amount) || 0
    const direction = String(record.direction || (record.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase()
    return sum + (direction === 'IN' ? amount : -amount)
  }, 0)
  const settlementPaid = settlements.filter(record => String(record.direction || (record.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase() === 'OUT').reduce((sum, record) => sum + (amountOf(record.amount) || 0), 0)
  const settlementReceived = settlements.filter(record => String(record.direction || (record.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase() === 'IN').reduce((sum, record) => sum + (amountOf(record.amount) || 0), 0)
  for (const settlement of settlements) {
    const direction = String(settlement.direction || (settlement.settlementType === 'Receipt' ? 'IN' : 'OUT')).toUpperCase() === 'IN' ? 'IN' : 'OUT'
    const amount = amountOf(settlement.amount)
    if (amount != null) add(fact({
      id: `settlement:${settlement.id}`, factType: 'SETTLEMENT', basis: 'ACTUAL', direction, amount,
      occurredOn: dateOf(settlement.settledOn || settlement.paidOn || settlement.createdAt)?.toISOString() || null,
      sourceType: settlement.sourceType || 'EXPLICIT_SETTLEMENT', sourceId: settlement.sourceId || settlement.id,
      evidenceStatus: 'AUTHORITATIVE',
      metadata: { settlementType: settlement.settlementType || (direction === 'IN' ? 'Receipt' : 'Payment'), paymentMethod: settlement.paymentMethod || null, referenceNumber: settlement.referenceNumber || null },
    }))
  }

  const explicitReceivables = LIVE(snapshot?.receivables).filter(record => inRange(record.occurredOn || record.dueOn || record.createdAt, range))
  const explicitPayables = LIVE(snapshot?.payables).filter(record => inRange(record.occurredOn || record.dueOn || record.createdAt, range))
  const explicitCash = LIVE(snapshot?.cashTransactions).filter(record => inRange(record.occurredOn || record.paidOn || record.createdAt, range))

  const sumExplicit = records => records.map(record => amountOf(record.amount)).filter(value => value != null).reduce((sum, value) => sum + value, 0)

  if (explicitReceivables.length) add(fact({
    id: `receivable:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'RECEIVABLE',
    basis: 'ACTUAL',
    direction: 'IN',
    amount: sumExplicit(explicitReceivables),
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'EXPLICIT_RECEIVABLE_RECORDS',
    evidenceStatus: 'AUTHORITATIVE',
  }))
  if (explicitPayables.length) add(fact({
    id: `payable:${range?.to?.toISOString?.() || 'period'}`,
    factType: 'PAYABLE',
    basis: 'ACTUAL',
    direction: 'OUT',
    amount: sumExplicit(explicitPayables),
    occurredOn: range?.to?.toISOString?.() || null,
    sourceType: 'EXPLICIT_PAYABLE_RECORDS',
    evidenceStatus: 'AUTHORITATIVE',
  }))

  const cashRecords = explicitCash.map(record => amountOf(record.amount)).filter(value => value != null)
  const knownFinancingCashOutflow = financingOutflow || 0
  const cashAvailable = explicitCash.length > 0
  if (cashAvailable || knownFinancingCashOutflow > 0) {
    const explicitCashMovement = explicitCash.reduce((sum, record) => {
      const amount = amountOf(record.amount) || 0
      return sum + (String(record.direction || '').toUpperCase() === 'IN' ? amount : -amount)
    }, 0)
    add(fact({
      id: `cash-movement:${range?.to?.toISOString?.() || 'period'}`,
      factType: 'CASH_MOVEMENT',
      basis: 'ACTUAL',
      direction: explicitCashMovement - knownFinancingCashOutflow >= 0 ? 'IN' : 'OUT',
      amount: Math.abs(explicitCashMovement - knownFinancingCashOutflow),
      occurredOn: range?.to?.toISOString?.() || null,
      sourceType: explicitCash.length ? 'EXPLICIT_CASH_SETTLEMENTS_PLUS_FINANCING' : 'FINANCING_SETTLEMENTS_ONLY',
      evidenceStatus: 'AUTHORITATIVE',
      metadata: { explicitCashMovement, knownFinancingCashOutflow, cashPosition: 'NOT_DERIVED' },
    }))
  }

  const categories = [...new Set(facts.map(item => item.factType))]
  const statusFor = factType => facts.some(item => item.factType === factType && item.status === 'AVAILABLE') ? 'AVAILABLE' : 'UNAVAILABLE'

  return {
    period: { from: range?.from || null, to: range?.to || null },
    facts,
    categories,
    model: {
      actualRevenue: revenue,
      actualOperatingCost: amountOf(metrics.actualOperatingCost),
      financingObligation: scheduledObligation,
      actualFinancingPayment: financingOutflow,
      maintenanceProvision,
      renewalProvision,
      maintenanceVariance,
      renewalActual: hasCompliancePayments ? renewalActual : null,
      renewalVariance,
      capex: facts.filter(item => item.factType === 'CAPEX').reduce((sum, item) => sum + item.amount, 0),
      receivable: explicitReceivables.length ? sumExplicit(explicitReceivables) : null,
      payable: explicitPayables.length ? sumExplicit(explicitPayables) : null,
      cashMovement: (cashAvailable || knownFinancingCashOutflow > 0)
        ? explicitCash.reduce((sum, record) => sum + (String(record.direction || '').toUpperCase() === 'IN' ? (amountOf(record.amount) || 0) : -(amountOf(record.amount) || 0)), 0) - knownFinancingCashOutflow
        : null,
    },
    availability: {
      revenue: revenue != null ? 'AVAILABLE' : 'UNAVAILABLE',
      operatingCost: amountOf(metrics.actualOperatingCost) != null ? 'AVAILABLE' : 'UNAVAILABLE',
      financingObligation: scheduledObligation != null ? 'AVAILABLE' : 'UNAVAILABLE',
      actualFinancingPayment: financingOutflow != null ? 'AVAILABLE' : 'UNAVAILABLE',
      maintenanceVariance: maintenanceVariance != null ? 'AVAILABLE' : 'UNAVAILABLE',
      renewalVariance: renewalVariance != null ? 'AVAILABLE' : 'UNAVAILABLE',
      capex: facts.some(item => item.factType === 'CAPEX') ? 'AVAILABLE' : 'UNAVAILABLE',
      receivable: explicitReceivables.length ? 'AVAILABLE' : 'UNAVAILABLE',
      payable: explicitPayables.length ? 'AVAILABLE' : 'UNAVAILABLE',
      cash: cashAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    rules: {
      actualExpensesAreNotCashByDefault: true,
      provisionsAreNotExpenses: true,
      obligationsAreNotPayments: true,
      capexIsNotCashWithoutSettlementEvidence: true,
      revenueIsNotCashWithoutSettlementEvidence: true,
      targetAndBreakEvenAreDerivedManagementRepresentations: true,
    },
    status: {
      overall: facts.length ? 'AVAILABLE' : 'UNAVAILABLE',
      cash: cashAvailable ? 'AUTHORITATIVE' : 'UNAVAILABLE',
      receivable: explicitReceivables.length ? 'AUTHORITATIVE' : 'UNAVAILABLE',
      payable: explicitPayables.length ? 'AUTHORITATIVE' : 'UNAVAILABLE',
      renewalVariance: renewalVariance != null ? 'AUTHORITATIVE' : 'UNAVAILABLE',
    },
  }
}
