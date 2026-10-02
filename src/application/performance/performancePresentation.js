const finite = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null)

export function getPerformanceOutlookDisplay(metrics = {}) {
  const authoritativeBreakEven = finite(metrics.monthlyBreakEvenRevenue)
  const indicativeBreakEven = finite(metrics.indicativeMonthlyBreakEvenRevenue)
  const targetValue = finite(metrics.driverTarget)

  const breakEven = authoritativeBreakEven ?? indicativeBreakEven
  const breakEvenStatus = authoritativeBreakEven != null
    ? (metrics.calculationEvidence?.breakEven?.status || 'AUTHORITATIVE')
    : indicativeBreakEven != null
      ? 'INDICATIVE'
      : 'UNAVAILABLE'

  const targetAvailable = metrics.driverTargetAvailable === true && targetValue != null

  return {
    breakEven,
    breakEvenStatus,
    target: targetAvailable ? targetValue : null,
    targetStatus: targetAvailable ? 'AUTHORITATIVE' : 'UNAVAILABLE',
    revenue: finite(metrics.revenue),
  }
}
