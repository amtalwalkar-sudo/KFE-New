export function calculateTotalAmount(records, field = 'amount_paise') {
  if (!Array.isArray(records)) return 0
  return records.reduce((acc, curr) => {
    const val = Number(curr?.[field])
    return acc + (isNaN(val) ? 0 : val)
  }, 0)
}
