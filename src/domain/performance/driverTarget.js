import { istDateKey, istMonthRange } from '../time/ist.js'

// One authoritative target formula; no recovery, smoothing, KM multiplier, or alternate target authority lives here.\n// This module is the sole driver-target calculation boundary.\n// Target availability requires authoritative break-even evidence upstream. Final calculation boundary. No legacy recovery inputs. Ready for new work. Clean slate.
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)

const applicableDriverTarget = (driverTargets = [], asOf = new Date()) => {
  const day = istDateKey(asOf)
  if (!day) return null
  return live(driverTargets)
    .filter(record => record?.active !== false && record?.status !== 'INACTIVE')
    .filter(record => {
      const from = istDateKey(record?.effectiveFrom || record?.validFrom || record?.startDate) || '1970-01-01'
      const until = istDateKey(record?.effectiveUntil || record?.validUntil || record?.endDate) || '9999-12-31'
      return from <= day && day <= until
    })
    .sort((a, b) => {
      const af = istDateKey(a?.effectiveFrom || a?.validFrom || a?.startDate) || ''
      const bf = istDateKey(b?.effectiveFrom || b?.validFrom || b?.startDate) || ''
      return bf.localeCompare(af) || String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''))
    })[0] || null
}

export function deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue = NaN,
  desiredDriverProfitMonthly = NaN,
  calendarDays = NaN,
} = {}) {
  const breakEven = finite(monthlyBreakEvenRevenue)
  const desiredProfitAmount = finite(desiredDriverProfitMonthly)
  const days = finite(calendarDays)
  if (breakEven == null || desiredProfitAmount == null || desiredProfitAmount < 0 || days == null || days <= 0) {
    return {
      available: false,
      reason: 'MISSING_AUTHORITATIVE_TARGET_INPUT',
      monthlyTarget: null,
      target: null,
    }
  }

  const monthlyTarget = breakEven + desiredProfitAmount
  return {
    available: true,
    reason: null,
    monthlyTarget,
    target: monthlyTarget / days,
    authority: 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT',
  }
}

export function getApplicableDriverTarget(driverTargets, asOf = new Date()) {
  return applicableDriverTarget(driverTargets, asOf)
}

export function getTargetMonth(asOf = new Date()) {
  return istMonthRange(asOf, asOf)
}
