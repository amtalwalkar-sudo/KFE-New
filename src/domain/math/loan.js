/**
 * Simple fixed-rate monthly EMI calculation.
 * This is a derived estimate only; it does not create a payment schedule,
 * payment history, balance ledger or mutate the saved loan record.
 */
export function calculateLoanEmi({ principal, tenureMonths, annualInterestRatePercent } = {}) {
  const amount = Number(principal)
  const months = Number(tenureMonths)
  const annualRate = Number(annualInterestRatePercent)
  if (!Number.isFinite(amount) || amount <= 0
    || !Number.isInteger(months) || months <= 0
    || !Number.isFinite(annualRate) || annualRate < 0) return null

  const monthlyRate = annualRate / 1200
  if (monthlyRate === 0) return Math.round((amount / months) * 100) / 100

  const factor = (1 + monthlyRate) ** months
  const emi = amount * monthlyRate * factor / (factor - 1)
  return Number.isFinite(emi) && emi > 0 ? Math.round(emi * 100) / 100 : null
}
