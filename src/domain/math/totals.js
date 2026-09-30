/**
 * Sums an array of record amounts safely.
 * @param {Array<Object>} records
 * @param {string} key
 * @returns {number}
 */
export function calculateTotalAmount(records = [], key = 'amount') {
  if (!Array.isArray(records)) return 0
  return records.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
}
