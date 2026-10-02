const finite = value => Number.isFinite(Number(value)) ? Number(value) : null
const money = value => Math.round((Number(value) || 0) * 100) / 100

/**
 * Revenue allocation is a cash-reservation view, not a replacement for
 * authoritative provision accrual. The underlying maintenance/compliance
 * provisions still accrue from KM/calendar validity and actual payments
 * reduce their separate provision balances.
 *
 * The allocation rate for each required bucket is its modeled monthly
 * obligation divided by the normalized monthly break-even revenue.
 */
export function deriveDailyRevenueAllocation({
  revenue = NaN,
  monthlyBreakEvenRevenue = NaN,
  scheduledEmi = NaN,
  preBusinessRecovery = 0,
  maintenanceProvision = NaN,
  complianceProvision = NaN,
  historicalMaintenanceRecovery = 0,
} = {}) {
  const dayRevenue = finite(revenue)
  const monthlyBe = finite(monthlyBreakEvenRevenue)
  const emi = finite(scheduledEmi)
  const maintenance = finite(maintenanceProvision)
  const compliance = finite(complianceProvision)
  const preBusiness = finite(preBusinessRecovery) ?? 0
  const historical = finite(historicalMaintenanceRecovery) ?? 0

  const financialObligation = emi != null ? Math.max(0, emi) + Math.max(0, preBusiness) : null
  const otherRequired = Math.max(0, historical)
  const components = [financialObligation, maintenance, compliance, otherRequired]
  const complete = dayRevenue != null && monthlyBe != null && monthlyBe > 0 && components.every(value => value != null)
  if (!complete) {
    return {
      available: false,
      reason: 'INCOMPLETE_DAILY_REVENUE_ALLOCATION_INPUTS',
      revenue: dayRevenue,
      monthlyBreakEvenRevenue: monthlyBe,
      financialObligation: null,
      maintenanceProvision: null,
      complianceProvision: null,
      otherRequired: null,
      totalAllocation: null,
      availableAfterAllocations: null,
      rates: null,
    }
  }

  const basis = monthlyBe
  const rates = {
    financialObligation: financialObligation / basis,
    maintenanceProvision: maintenance / basis,
    complianceProvision: compliance / basis,
    otherRequired: otherRequired / basis,
  }
  const allocations = {
    financialObligation: money(dayRevenue * rates.financialObligation),
    maintenanceProvision: money(dayRevenue * rates.maintenanceProvision),
    complianceProvision: money(dayRevenue * rates.complianceProvision),
    otherRequired: money(dayRevenue * rates.otherRequired),
  }
  const totalAllocation = money(
    allocations.financialObligation +
    allocations.maintenanceProvision +
    allocations.complianceProvision +
    allocations.otherRequired
  )
  return {
    available: true,
    reason: null,
    revenue: dayRevenue,
    monthlyBreakEvenRevenue: monthlyBe,
    financialObligation,
    maintenanceProvision: maintenance,
    complianceProvision: compliance,
    otherRequired,
    rates,
    allocations,
    totalAllocation,
    availableAfterAllocations: money(dayRevenue - totalAllocation),
    allocationCoverage: monthlyBe > 0 ? totalAllocation / dayRevenue : 0,
    note: 'Revenue allocation is a daily cash-reservation guide. It does not replace KM/calendar provision accrual or actual payment accounting.',
  }
}
