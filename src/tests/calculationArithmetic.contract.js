import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name)
  if (entry.isDirectory()) return readFiles(target)
  return /\.(js|vue)$/.test(entry.name) ? [target] : []
})
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const files = dirs => dirs.flatMap(dir => readFiles(path.join(root, dir)))
const violations = []

// Presentation may format and perform interaction/validation arithmetic, but it
// must not reproduce KFE financial authorities.
for (const file of files(['views', 'components', 'presentation'])) {
  const text = fs.readFileSync(file, 'utf8')
  const forbidden = [
    /monthlyBreakEvenRevenue\s*[+\-*/]/,
    /dailyBreakEvenRevenue\s*[+\-*/]/,
    /driverTarget\s*[+\-*/]/,
    /desiredDriverProfit\s*[+\-*/]/,
    /workingDays\s*\/\s*/,
    /projectedRevenue\s*[+\-*/]/,
  ]
  for (const pattern of forbidden) if (pattern.test(text)) violations.push(`Presentation financial arithmetic: ${path.relative(root, file)} matches ${pattern}`)
}

// Screen projections must delegate financial arithmetic to application/domain owners.
const adminView = source('views/AdminView.vue')
const calculationsView = source('views/CalculationsView.vue')
const workFuelDomain = source('domain/work/fuel.js')
const maintenanceEngine = source('domain/performance/performanceEngineV2.js')
const loanEngine = source('domain/finance/loanEngine.js')
const maintenanceRateDomain = source('domain/performance/maintenanceRate.js')
const adminReadModel = source('application/admin/adminReadModelService.js')
if (!maintenanceEngine.includes('getApplicableMaintenanceRate')) violations.push('Performance engine must use the shared effective maintenance rate selector.')
if (!adminReadModel.includes('getApplicableMaintenanceRateRecord')) violations.push('Admin must use the same effective maintenance rate selector as the performance engine.')
if (!adminReadModel.includes('getApplicableDriverTarget')) violations.push('Admin must use the canonical effective driver target selector.')
if (!maintenanceRateDomain.includes('effectiveUntil')) violations.push('Maintenance rate selection must honor end dates.')
if (!maintenanceEngine.includes('maintenanceProvisionAccumulated - maintenancePaymentsAccumulated')) violations.push('Maintenance provision must preserve signed balances.')
if (maintenanceEngine.includes('maintenanceProvisionExcessPayments')) violations.push('Maintenance overpayment must not create a parallel excess-payment ledger.')
if (!loanEngine.includes('provisionAccumulatedPaise - actualPaidPaise')) violations.push('EMI provision must preserve signed balances.')
if (loanEngine.includes('paymentsAheadOfAccrual')) violations.push('EMI overpayment must not create a parallel ahead-of-accrual ledger.')
if (!workFuelDomain.includes('calculateFuelQuantityKg')) violations.push('Work fuel validation must delegate quantity arithmetic to the shared canonical formula.')
if (workFuelDomain.includes('quantityKg: total / price')) violations.push('Work fuel domain must not duplicate the quantity division formula.')
for (const [name, text] of [['AdminView.vue', adminView], ['CalculationsView.vue', calculationsView]]) {
  for (const pattern of [
    /const\s+sumPayments\s*=/,
    /const\s+loanAmortizationSchedule\s*=.*?\.map\(row\s*=>/,
    /scheduledInterestPaid\s*\)\s*\+\s*Math\.max/,
    /originalEmiAmount\s*\)\s*-\s*paid/,
    /amount\s*\/\s*pricePerKg/,
    /from ['"][^'"]*\/domain\/time\//,
  ]) if (pattern.test(text)) violations.push('Presentation calculation ownership: ' + name + ' matches ' + pattern)
}
if (/querySelector\(\s*['"]\.content-scroll-area/.test(adminView)) violations.push('AdminView must not query shell-owned scroll DOM.')

// Canonical target aliases are allowed only in normalization. Domain code must
// consume desiredDriverProfit and never reinterpret legacy target authorities.
for (const file of files(['domain'])) {
  const text = fs.readFileSync(file, 'utf8')
  const forbidden = [
    /desiredTakeHome/,
    /\bdesiredProfit\b/,
    /desired_driver_profit/,
    /desired_take_home/,
    /targetPerActiveDay/,
    /dailyTarget/,
    /uberRevenue/,
  ]
  for (const pattern of forbidden) if (pattern.test(text)) violations.push(`Legacy calculation field in domain: ${path.relative(root, file)} matches ${pattern}`)
}

// Historical/as-of domain calculations must not consult wall-clock time.
for (const file of files(['domain'])) {
  const text = fs.readFileSync(file, 'utf8')
  if (/Date\.now\s*\(/.test(text)) violations.push(`Wall-clock dependency in domain: ${path.relative(root, file)}`)
}

// The monthly break-even formula has one owner. Other layers may consume the
// result but must not define another monthly break-even authority.
const authoritativeBreakEven = source('domain/performance/authoritativeBreakEven.js')
if (!/const\s+monthlyBreakEvenRevenue\s*=\s*hasCalculableSubtotal\s*\?\s*\(fixedCosts\s*\?\?\s*0\)\s*\+\s*knownVariableCosts\.reduce\(\(sum,\s*value\)\s*=>\s*sum\s*\+\s*value,\s*0\)/.test(authoritativeBreakEven)) {
  violations.push('Authoritative monthly break-even subtotal formula is missing or has drifted.')
}

const architectureMatrix = source('../docs/CALCULATION-AUTHORITY-MATRIX.md')
if (!architectureMatrix.includes('Monthly break-even') || !architectureMatrix.includes('AUTHORITATIVE_MONTHLY_BREAK_EVEN')) {
  violations.push('Calculation authority matrix is missing the monthly break-even authority.')
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Calculation arithmetic boundary contract passed.')
