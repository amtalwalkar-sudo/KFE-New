const TARGET_INPUT_FIX = Object.freeze({ route: '/admin', adminSection: 'records', selected: 'driverTarget' })
const BREAK_EVEN_FIX = Object.freeze({ route: '/admin', adminSection: 'records', selected: 'breakEvenInputs' })
const LOAN_FIX = Object.freeze({ route: '/admin', adminSection: 'records', selected: 'loan' })
const COMPLIANCE_FIX = Object.freeze({ route: '/admin', adminSection: 'records', selected: 'compliance' })
const TIMELINE_FIX = Object.freeze({ route: '/timeline' })

const reasons = Object.freeze({
  NO_APPLICABLE_BREAK_EVEN_INPUT: {
    title: 'Break-even input',
    why: 'No applicable effective Break-even Input exists for the selected period.',
    fix: 'Create or activate the applicable Break-even Input.',
    target: BREAK_EVEN_FIX,
  },
  INCOMPLETE_BREAK_EVEN_INPUTS: {
    title: 'Break-even input',
    why: 'The applicable Break-even Input exists, but one or more required inputs are incomplete.',
    fix: 'Complete the missing Break-even input or resolve the upstream dependency.',
    target: BREAK_EVEN_FIX,
  },
  PROVISIONAL_FUEL_EVIDENCE: {
    title: 'Fuel evidence',
    why: 'The fuel rate is still provisional, so an authoritative Break-even result cannot be produced.',
    fix: 'Record qualifying full-tank fuel data so the authoritative fuel-rate interval can be established.',
    target: TIMELINE_FIX,
  },
  MISSING_AUTHORITATIVE_TARGET_INPUT: {
    title: 'Driver Target input',
    why: 'No applicable complete Driver Target exists for the selected target period.',
    fix: 'Create or activate the applicable Driver Target and provide the desired driver profit / take-home.',
    target: TARGET_INPUT_FIX,
  },
  MISSING_HISTORICAL_DRIVER_TARGET_INPUT: {
    title: 'Historical Driver Target input',
    why: 'A prior target-bearing month is missing a complete effective Driver Target required to calculate the rolling balance.',
    fix: 'Add or activate the missing historical Driver Target input.',
    target: TARGET_INPUT_FIX,
  },
  NO_FINANCIAL_DRIVER_TARGET_DAY: {
    title: 'Target allocation',
    why: 'There is no completed financial driver-target day in the selected period, so no target allocation can be calculated.',
    fix: 'Complete a qualifying trip/financial day, or select a period containing one.',
    target: null,
  },
})

const diagnostic = ({ id, calculation, status, reason, blockedBy = null, chain = [], target = null, why, fix, root = null }) => ({
  id,
  calculation,
  status,
  reason,
  blockedBy,
  chain,
  rootCause: root || reason,
  why,
  fix,
  target,
})

function breakEvenRoot(metrics) {
  const evidence = metrics?.calculationEvidence?.breakEven || null
  const reason = evidence?.reason || null
  const trace = metrics?.breakEvenTrace || metrics?.authority?.breakEvenTrace || null

  if (reason === 'NO_APPLICABLE_BREAK_EVEN_INPUT') return reasons.NO_APPLICABLE_BREAK_EVEN_INPUT
  if (reason === 'PROVISIONAL_FUEL_EVIDENCE') return reasons.PROVISIONAL_FUEL_EVIDENCE

  if (reason === 'INCOMPLETE_BREAK_EVEN_INPUTS') {
    const missing = trace?.firstMissing
    if (missing === 'fuelCostPerKm' || missing === 'fuelCostPerKmEvidence') return reasons.PROVISIONAL_FUEL_EVIDENCE
    if (missing === 'maintenanceProvisionPerKm') {
      return {
        title: 'Maintenance provision rate',
        why: 'The applicable Break-even Input does not contain a maintenance provision per KM.',
        fix: 'Complete the maintenance provision rate in Break-even Inputs.',
        target: BREAK_EVEN_FIX,
      }
    }
    if (missing === 'loanScheduledObligation') {
      return {
        title: 'Loan obligation',
        why: 'The authoritative Break-even calculation needs the applicable loan scheduled obligation, but the loan dependency is unavailable.',
        fix: 'Complete the active loan contract in Admin.',
        target: LOAN_FIX,
      }
    }
    if (missing === 'renewalProvision') {
      return {
        title: 'Renewal provision',
        why: 'The authoritative Break-even calculation needs renewal provision data, but the compliance dependency is unavailable.',
        fix: 'Complete the applicable compliance record.',
        target: COMPLIANCE_FIX,
      }
    }
    if (missing === 'vehicleKm') {
      return {
        title: 'Vehicle KM',
        why: 'The authoritative Break-even calculation needs authoritative vehicle KM for the selected period.',
        fix: 'Complete qualifying shift odometer data for the selected period.',
        target: TIMELINE_FIX,
      }
    }
    return reasons.INCOMPLETE_BREAK_EVEN_INPUTS
  }

  return null
}

export function getPerformanceDiagnostics(metrics) {
  const result = {}
  const breakEvenAvailable =
    Number.isFinite(Number(metrics?.monthlyBreakEvenRevenue)) &&
    metrics?.completeness?.breakEven === true
  const breakEvenRootCause = breakEvenRoot(metrics)

  if (!breakEvenAvailable && breakEvenRootCause) {
    const root = breakEvenRootCause
    result.breakEven = diagnostic({
      id: 'break-even-root',
      calculation: 'Monthly Break-even',
      status: 'UNAVAILABLE',
      reason: metrics?.calculationEvidence?.breakEven?.reason || 'INCOMPLETE_BREAK_EVEN_INPUTS',
      chain: ['Break-even Input', 'Monthly Break-even'],
      target: root.target,
      why: root.why,
      fix: root.fix,
      root: root.title,
    })
  }

  if (metrics?.driverTargetAvailable !== true) {
    const targetReason =
      metrics?.driverTargetReason ||
      metrics?.calculationEvidence?.target?.reason ||
      'MISSING_AUTHORITATIVE_TARGET_INPUT'
    const targetRoot = breakEvenAvailable
      ? (reasons[targetReason] || reasons.MISSING_AUTHORITATIVE_TARGET_INPUT)
      : breakEvenRootCause

    if (targetRoot) {
      if (!breakEvenAvailable && targetRoot === breakEvenRootCause) {
        result.target = diagnostic({
          id: 'target-blocked-by-break-even',
          calculation: 'Driver Target',
          status: 'BLOCKED',
          reason: targetReason,
          blockedBy: 'Monthly Break-even',
          chain: ['Break-even Input', 'Monthly Break-even', 'Monthly Target Base', 'Remaining Target Obligation', 'Current Daily Driver Target'],
          target: targetRoot.target,
          why: 'Driver Target is unavailable because Monthly Break-even is unavailable.',
          fix: targetRoot.fix,
          root: targetRoot.title,
        })
      } else {
        result.target = diagnostic({
          id: 'target-root',
          calculation: 'Driver Target',
          status: targetReason === 'NO_FINANCIAL_DRIVER_TARGET_DAY' ? 'NOT_APPLICABLE' : 'UNAVAILABLE',
          reason: targetReason,
          chain: ['Driver Target Input', 'Monthly Target Base', 'Remaining Target Obligation', 'Current Daily Driver Target'],
          target: targetRoot.target,
          why: targetRoot.why,
          fix: targetRoot.fix,
          root: targetRoot.title,
        })
      }
    }
  }

  const dailyBreakEvenUnavailable =
    metrics?.dailyBreakEven?.status !== 'AUTHORITATIVE' ||
    !Number.isFinite(Number(metrics?.dailyBreakEvenRevenue))

  if (dailyBreakEvenUnavailable && result.breakEven) {
    result.dailyBreakEven = diagnostic({
      id: 'daily-break-even-blocked',
      calculation: 'Daily Break-even allocation',
      status: 'BLOCKED',
      reason: 'BREAK_EVEN_UNAVAILABLE',
      blockedBy: 'Monthly Break-even',
      chain: ['Break-even Input', 'Monthly Break-even', 'Daily Break-even allocation'],
      target: result.breakEven.target,
      why: 'Daily Break-even is only an allocation of the authoritative Monthly Break-even result.',
      fix: result.breakEven.fix,
      root: result.breakEven.rootCause,
    })
  }

  if (!Number.isFinite(Number(metrics?.maintenanceProvision))) {
    const upstream = result.breakEven
    result.provision = diagnostic({
      id: 'provision-blocked',
      calculation: 'Maintenance provision',
      status: upstream ? 'BLOCKED' : 'UNAVAILABLE',
      reason: upstream ? 'BREAK_EVEN_UNAVAILABLE' : 'MAINTENANCE_PROVISION_UNAVAILABLE',
      blockedBy: upstream ? 'Monthly Break-even' : null,
      chain: ['Break-even Input', 'Maintenance provision / KM', 'Maintenance provision'],
      target: upstream?.target || BREAK_EVEN_FIX,
      why: upstream
        ? 'Maintenance provision depends on the authoritative Break-even maintenance provision rate.'
        : 'Maintenance provision cannot be calculated from the available authoritative inputs.',
      fix: upstream?.fix || 'Complete the applicable Break-even Input.',
      root: upstream?.rootCause || 'Maintenance provision',
    })
  }

  return result
}
