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

// Canonical target aliases are allowed only in normalization. Domain code must
// consume desiredDriverProfit and never reinterpret legacy target authorities.
for (const file of files(['domain'])) {
  const text = fs.readFileSync(file, 'utf8')
  const forbidden = [
    /desiredTakeHome/,
    /desiredProfit/,
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
if (!/monthlyBreakEvenRevenue\s*:\s*fixedCosts\s*\+\s*dynamicCosts/.test(authoritativeBreakEven)) {
  violations.push('Authoritative monthly break-even formula is missing or has drifted.')
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
