import assert from 'node:assert/strict'
import { calculateLoanEmi } from '../domain/math/loan.js'
import { LoanCalculationService } from '../application/admin/loanCalculationService.js'

assert.equal(calculateLoanEmi({ principal: 120000, tenureMonths: 12, annualInterestRatePercent: 0 }), 10000)
assert.equal(calculateLoanEmi({ principal: 100000, tenureMonths: 12, annualInterestRatePercent: 12 }), 8884.88)
assert.equal(calculateLoanEmi({ principal: 100000, tenureMonths: 24, annualInterestRatePercent: 12 }), 4707.35)
assert.equal(calculateLoanEmi({ principal: 100000, tenureMonths: 0, annualInterestRatePercent: 12 }), null)
assert.equal(calculateLoanEmi({ principal: 0, tenureMonths: 12, annualInterestRatePercent: 12 }), null)
assert.equal(calculateLoanEmi({ principal: 100000, tenureMonths: 12, annualInterestRatePercent: -1 }), null)
assert.equal(LoanCalculationService.monthlyEmi({ principal: 120000, tenureMonths: 12, annualInterestRatePercent: 0 }), 10000)

const source = (await import('node:fs')).readFileSync('src/views/AdminView.vue', 'utf8')
assert.match(source, /LoanCalculationService\.monthlyEmi/)
assert.match(source, /Estimated monthly EMI/)
assert.doesNotMatch(source, /amortization|prepayment|payment ledger|break.?even/i)
console.log('Loan EMI calculation contract: PASS — one pure fixed-rate EMI calculation; no legacy loan engine or payment ledger.')
