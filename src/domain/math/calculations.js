/**
 * Sums numeric record amounts without silently converting malformed values to zero.
 * A malformed amount makes the aggregate unavailable so authoritative callers cannot
 * accidentally hide bad source data inside a financial total.
 * @param {Array<Object>} records
 * @param {string} field
 * @returns {number|null}
 */
export function calculateTotalAmount(records, field = 'amount_paise') {
  if (!Array.isArray(records)) return 0
  let total = 0
  for (const row of records) {
    const raw = row?.[field]
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return null
    const value = Number(raw)
    if (!Number.isFinite(value)) return null
    total += value
  }
  return total
}
