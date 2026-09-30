export function rupeesToPaise(rupees) {
  const num = Number(rupees)
  if (isNaN(num)) return 0
  return Math.round(num * 100)
}

export const toPaise = rupeesToPaise

export function paiseToRupees(paise) {
  const num = Number(paise)
  if (isNaN(num)) return 0
  return num / 100
}
