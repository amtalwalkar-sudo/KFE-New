import fs from 'node:fs'
import assert from 'node:assert/strict'

const source=fs.readFileSync('src/views/CalculationsView.vue','utf8')

assert.match(source,/What needs your input/)
assert.match(source,/Enter the missing business information/)
assert.match(source,/UniversalAdminForm/)
assert.match(source,/CalculationsService\.recordFuelBaseline/)
assert.match(source,/markLoanNotApplicable/)
assert.match(source,/Rechecking calculations/)
assert.doesNotMatch(source,/Issues first/)
assert.doesNotMatch(source,/All calculations/)
assert.doesNotMatch(source,/Calculation path/)
assert.doesNotMatch(source,/diagnostic only/)
assert.doesNotMatch(source,/baseCalculations/)

console.log('Calculations smart-input surface contract passed.')
