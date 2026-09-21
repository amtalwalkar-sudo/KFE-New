import { istParts } from '../time/ist.js'

export const PERIOD_SNAPSHOT_SCHEMA_VERSION = 1
export const PERIOD_SNAPSHOT_STATUS = 'CLOSED'
export const PERIOD_SNAPSHOT_HASH_ALGORITHM = 'SHA-256'

const clone = value => structuredClone(value)
const validDate = value => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const canonicalize = value => {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    const values = value.map(canonicalize)
    if (values.every(item => item && typeof item === 'object' && !Array.isArray(item) && 'id' in item)) {
      return values.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
    return values
  }
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonicalize(value[key])
    return out
  }, {})
}

const canonicalJson = value => JSON.stringify(canonicalize(value))

const getCrypto = () => {
  const cryptoObject = globalThis.crypto
  if (!cryptoObject?.subtle) throw new Error('SHA-256 integrity hashing requires Web Crypto support.')
  return cryptoObject
}

export const sha256 = async value => {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await getCrypto().subtle.digest(PERIOD_SNAPSHOT_HASH_ALGORITHM, bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const monthParts = periodKey => {
  const match = String(periodKey || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

const utcForIst = (year, month, day, hour, minute, second, ms = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - 330 * 60 * 1000)

export const completeIstMonthRange = periodKey => {
  const parts = monthParts(periodKey)
  if (!parts) return null
  const from = utcForIst(parts.year, parts.month, 1, 0, 0, 0)
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1
  const to = new Date(utcForIst(nextYear, nextMonth, 1, 0, 0, 0).getTime() - 1)
  return { from, to }
}

export const periodKeyFor = value => {
  const date = validDate(value)
  if (!date) return null
  const parts = istParts(date)
  return parts ? `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}` : null
}

export const validatePeriodKey = periodKey => {
  const range = completeIstMonthRange(periodKey)
  if (!range) throw new Error(`Invalid financial period: ${periodKey}`)
  return range
}

const sourceArrays = snapshot => Object.fromEntries(
  Object.entries(snapshot || {}).filter(([, value]) => Array.isArray(value))
)

export async function buildPeriodSnapshot({
  periodKey,
  calculationSnapshot,
  metrics,
  financialFacts,
  closedAt = new Date(),
  sourceDataAsOf = null,
} = {}) {
  const range = validatePeriodKey(periodKey)
  const closeTime = validDate(closedAt)
  if (!closeTime) throw new Error('A valid closedAt timestamp is required.')
  if (closeTime.getTime() < range.to.getTime()) throw new Error('A financial period cannot be closed before its complete IST month has ended.')
  const sourceAsOf = validDate(sourceDataAsOf || range.to) || range.to
  if (sourceAsOf.getTime() < range.to.getTime()) throw new Error('The evidence boundary cannot precede the closed period end.')
  if (sourceAsOf.getTime() > closeTime.getTime()) throw new Error('The evidence boundary cannot be later than the period close timestamp.')

  const sources = sourceArrays(calculationSnapshot)
  const sourceRecordIds = {}
  const sourceFingerprints = {}
  for (const [store, records] of Object.entries(sources)) {
    sourceRecordIds[store] = records.map(record => record?.id).filter(Boolean).sort()
    sourceFingerprints[store] = await sha256(records)
  }

  const evidenceBoundary = {
    asOf: sourceAsOf.toISOString(),
    periodEnd: range.to.toISOString(),
    sourceStores: Object.keys(sources).sort(),
    sourceRecordIds,
    sourceFingerprints,
  }

  const payload = {
    schemaVersion: PERIOD_SNAPSHOT_SCHEMA_VERSION,
    status: PERIOD_SNAPSHOT_STATUS,
    periodKey,
    periodRange: { from: range.from.toISOString(), to: range.to.toISOString() },
    closedAt: closeTime.toISOString(),
    evidenceBoundary,
    calculationSnapshot: clone(calculationSnapshot),
    metrics: clone(metrics),
    financialFacts: clone(financialFacts),
  }

  const integrityHash = await sha256(payload)
  return Object.freeze({ ...payload, integrityHash, hashAlgorithm: PERIOD_SNAPSHOT_HASH_ALGORITHM })
}

export async function verifyPeriodSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== PERIOD_SNAPSHOT_SCHEMA_VERSION) {
    return { valid: false, reason: 'UNSUPPORTED_SNAPSHOT_SCHEMA' }
  }
  if (snapshot.status !== PERIOD_SNAPSHOT_STATUS) return { valid: false, reason: 'SNAPSHOT_NOT_CLOSED' }
  const range = completeIstMonthRange(snapshot.periodKey)
  if (!range) return { valid: false, reason: 'INVALID_PERIOD' }
  if (snapshot.periodRange?.from !== range.from.toISOString() || snapshot.periodRange?.to !== range.to.toISOString()) {
    return { valid: false, reason: 'PERIOD_BOUNDARY_MISMATCH' }
  }
  if (!snapshot.evidenceBoundary?.asOf || new Date(snapshot.evidenceBoundary.asOf).getTime() < range.to.getTime()) {
    return { valid: false, reason: 'INVALID_EVIDENCE_BOUNDARY' }
  }
  if (snapshot.hashAlgorithm !== PERIOD_SNAPSHOT_HASH_ALGORITHM || !snapshot.integrityHash) {
    return { valid: false, reason: 'INTEGRITY_METADATA_MISSING' }
  }
  const { integrityHash, hashAlgorithm, ...payload } = snapshot
  const expected = await sha256(payload)
  return expected === integrityHash
    ? { valid: true, reason: null }
    : { valid: false, reason: 'INTEGRITY_HASH_MISMATCH' }
}

export async function assertPeriodSnapshot(snapshot) {
  const verification = await verifyPeriodSnapshot(snapshot)
  if (!verification.valid) throw new Error(`Invalid financial period snapshot: ${verification.reason}`)
  return snapshot
}
