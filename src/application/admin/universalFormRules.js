/** Canonical validation for the six active Admin source-record forms. */
export const UNIVERSAL_FORM_RULES = Object.freeze({
  trimText: true,
  rejectUnknownFields: true,
  requiredFieldsMustBePresent: true,
  numbersMustBeFinite: true,
  numbersMustRespectBounds: true,
  datesMustBeValid: true,
  selectValuesMustBeAllowed: true,
})

const blank = value => value === undefined || value === null || String(value).trim() === ''
const optionValue = option => option && typeof option === 'object' && 'value' in option ? option.value : option

function isValidDate(value) {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

export function normalizeFormValues(definition, values = {}) {
  const normalized = {}
  for (const field of definition.fields ?? []) {
    let value = values[field.key]
    if (value === undefined && field.defaultValue !== undefined) value = field.defaultValue
    if (['text', 'textarea', 'select'].includes(field.type) && typeof value === 'string' && UNIVERSAL_FORM_RULES.trimText) value = value.trim()
    if (field.type === 'number' && !blank(value)) value = Number(value)
    if (field.type === 'checkbox') {
      value = typeof value === 'string' ? ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()) : Boolean(value)
    }
    normalized[field.key] = value
  }
  return normalized
}

export function validateAdminForm(definition, values = {}, context = {}) {
  const errors = {}
  const normalized = normalizeFormValues(definition, values)
  const fields = definition.fields ?? []
  const allowed = new Set(fields.map(field => field.key))

  if (UNIVERSAL_FORM_RULES.rejectUnknownFields) {
    for (const key of Object.keys(values)) {
      if (!allowed.has(key)) errors[key] = 'Unknown field is not permitted.'
    }
  }

  const relaxedRequired = new Set(context.relaxRequired ?? [])
  for (const field of fields) {
    const value = normalized[field.key]
    if (field.required && !relaxedRequired.has(field.key) && blank(value)) {
      errors[field.key] = `${field.label} is required.`
      continue
    }
    if (blank(value)) continue

    if (field.type === 'number') {
      if (!Number.isFinite(value)) errors[field.key] = `${field.label} must be a valid number.`
      else if (field.exclusiveMin && field.min !== undefined && value <= field.min) errors[field.key] = `${field.label} must be greater than ${field.min}.`
      else if (field.min !== undefined && value < field.min) errors[field.key] = `${field.label} must be at least ${field.min}.`
      else if (field.max !== undefined && value > field.max) errors[field.key] = `${field.label} must be at most ${field.max}.`
    }

    if (field.type === 'date' && !isValidDate(value)) errors[field.key] = `${field.label} must be a valid date.`
    if (field.type === 'select' && field.options?.length && !field.options.some(option => optionValue(option) === value)) {
      errors[field.key] = `${field.label} has an invalid selection.`
    }
  }

  if (definition.key === 'vehicle') {
    if (normalized.status === 'Sold' && blank(normalized.saleDate)) errors.saleDate = 'Sale date is required when vehicle status is Sold.'
    if (normalized.status === 'Sold' && blank(normalized.sellPrice)) errors.sellPrice = 'Sell price is required when vehicle status is Sold.'
    if (normalized.saleDate && normalized.status !== 'Sold') errors.saleDate = 'Sale date is only valid for a Sold vehicle.'
  }

  if (definition.key === 'compliance' && normalized.validUntil && normalized.validFrom && normalized.validUntil < normalized.validFrom) {
    errors.validUntil = 'Valid until cannot precede valid from.'
  }

  if (definition.key === 'driver' && normalized.licenseExpiry && normalized.joinedOn && normalized.licenseExpiry < normalized.joinedOn) {
    errors.licenseExpiry = 'Licence expiry cannot precede joined date.'
  }

  return { valid: Object.keys(errors).length === 0, errors, values: normalized }
}
