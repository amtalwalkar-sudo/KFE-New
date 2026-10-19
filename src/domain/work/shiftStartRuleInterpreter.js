import fs from 'node:fs'

const rulesPath = new URL('../../spec/work-domain/shift-start-rules.json', import.meta.url)
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))

function inputValue(name, input) {
  return Object.hasOwn(input, name) ? input[name] : undefined
}

function numeric(value, { missingAsNaN = false } = {}) {
  if (missingAsNaN && (value == null || value === '')) return Number.NaN
  return Number(value)
}

function evaluateNode(node, input) {
  if (Object.hasOwn(node, 'const')) return node.const
  if (Object.hasOwn(node, 'input')) return inputValue(node.input, input)
  if (Object.hasOwn(node, 'number')) {
    const source = node.number
    if (Object.hasOwn(source, 'input')) return numeric(inputValue(source.input, input), { missingAsNaN: source.missingAsNaN === true })
    return numeric(evaluateNode(source, input))
  }
  if (Object.hasOwn(node, 'object')) {
    return Object.fromEntries(Object.entries(node.object).map(([key, value]) => [key, evaluateNode(value, input)]))
  }
  if (Object.hasOwn(node, 'if')) {
    const branch = node.if
    return evaluateNode(evaluateNode(branch.condition ?? branch, input) ? branch.then : branch.else, input)
  }
  if (Object.hasOwn(node, 'op')) {
    const { op } = node
    if (op === 'notFinite') return !Number.isFinite(evaluateNode(node.value, input))
    if (op === 'finiteAndPresent') {
      const value = evaluateNode(node.value, input)
      return value != null && value !== '' && Number.isFinite(Number(value))
    }
    if (op === 'notFiniteOrMissing') {
      const value = evaluateNode(node.value, input)
      return value == null || value === '' || !Number.isFinite(Number(value))
    }
    if (op === 'and') return node.args.every(arg => Boolean(evaluateNode(arg, input)))
    if (op === 'or') return node.args.some(arg => Boolean(evaluateNode(arg, input)))
    if (op === 'not') return !Boolean(evaluateNode(node.value, input))
    const left = evaluateNode(node.left, input)
    const right = evaluateNode(node.right, input)
    if (op === 'lte') return left <= right
    if (op === 'lt') return left < right
    if (op === 'gt') return left > right
    if (op === 'eq') return left === right
    if (op === 'subtract') return left - right
  }
  throw new Error(`Unsupported shift-start rule expression: ${JSON.stringify(node)}`)
}

export function evaluateShiftStartRule(ruleName, input) {
  const rule = rules.rules[ruleName]
  if (!rule) throw new Error(`Unknown shift-start rule: ${ruleName}`)
  return evaluateNode(rule.expression, input)
}

export const shiftStartRuleSourceVersion = rules.schemaVersion
