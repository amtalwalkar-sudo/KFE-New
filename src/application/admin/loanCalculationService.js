import { calculateLoanEmi } from '../../domain/math/loan.js'

/** Read-only derived loan summary; saved loan terms remain the only source facts. */
export const LoanCalculationService = Object.freeze({
  monthlyEmi(values = {}) {
    return calculateLoanEmi({
      principal: values.principal,
      tenureMonths: values.tenureMonths,
      annualInterestRatePercent: values.annualInterestRatePercent,
    })
  },
})
