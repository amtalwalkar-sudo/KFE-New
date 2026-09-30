import { istDateKey } from '../time/ist.js'

export const OPERATING_KM_FORECAST_CONFIG = Object.freeze({
  normalPriorKmPerCalendarDay: 200,
  baselineEvidenceResponse: 0.10,
  maxEvidenceResponse: 0.30,
  persistenceDays: 5,
  robustDeviationKm: 75,
})

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null
const dateOf = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const dayKey = value => istDateKey(dateOf(value))

const calendarDaysInclusive = (from, to) => {
  const start = dateOf(from)
  const end = dateOf(to)
  if (!start || !end || end < start) return []
  const keys = []
  const startKey = dayKey(start)
  const endKey = dayKey(end)
  if (!startKey || !endKey) return keys
  const cursor = new Date(startKey + 'T00:00:00.000Z')
  const last = new Date(endKey + 'T00:00:00.000Z')
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return [...new Set(keys)].filter(Boolean)
}

const shiftKm = shift => {
  const start = finite(shift?.startOdometer)
  const end = finite(shift?.endOdometer)
  if (start == null || end == null || end < start) return null
  return end - start
}

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)

export function deriveOperatingKmObservations({ shifts = [], from, to, asOf = to } = {}) {
  const start = dateOf(from)
  const end = dateOf(to)
  const boundary = dateOf(asOf) || end
  if (!start || !end || end < start) return []

  const byDay = new Map()
  for (const shift of live(shifts)) {
    const completedAt = dateOf(shift?.shiftEndAt)
    if (!completedAt || completedAt < start || completedAt > end || completedAt > boundary) continue
    const km = shiftKm(shift)
    const key = dayKey(completedAt)
    if (!key || km == null) continue
    byDay.set(key, (byDay.get(key) || 0) + km)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, km]) => ({ date, km }))
}

export function updateOperatingKmForecast(state, observedKm) {
  const prior = finite(state?.dailyForecastKm) ?? OPERATING_KM_FORECAST_CONFIG.normalPriorKmPerCalendarDay
  const observation = finite(observedKm)
  if (observation == null || observation < 0) {
    return {
      ...state,
      dailyForecastKm: prior,
      observationUsed: false,
      persistenceDays: state?.persistenceDays || 0,
    }
  }

  const deviation = observation - prior
  const direction = deviation > 0 ? 1 : deviation < 0 ? -1 : 0
  const previousDirection = Number(state?.direction) || 0
  const persistenceDays = direction === 0
    ? 0
    : direction === previousDirection
      ? Math.min((Number(state?.persistenceDays) || 0) + 1, 365)
      : 1

  const persistenceFactor = Math.min(persistenceDays / OPERATING_KM_FORECAST_CONFIG.persistenceDays, 1)
  const response = OPERATING_KM_FORECAST_CONFIG.baselineEvidenceResponse
    + (OPERATING_KM_FORECAST_CONFIG.maxEvidenceResponse - OPERATING_KM_FORECAST_CONFIG.baselineEvidenceResponse) * persistenceFactor
  const robustDeviation = clamp(
    deviation,
    -OPERATING_KM_FORECAST_CONFIG.robustDeviationKm,
    OPERATING_KM_FORECAST_CONFIG.robustDeviationKm,
  )
  const nextForecast = Math.max(0, prior + response * robustDeviation)

  return {
    ...state,
    dailyForecastKm: nextForecast,
    observationUsed: true,
    lastObservedKm: observation,
    direction,
    persistenceDays,
    response,
  }
}

export function deriveOperatingKmForecast({ shifts = [], from, to, asOf = to } = {}) {
  const start = dateOf(from)
  const end = dateOf(to)
  const boundary = dateOf(asOf) || end
  if (!start || !end || end < start) {
    return {
      available: false,
      reason: 'INVALID_PERIOD',
      calculatedForecast: null,
      effectiveForecast: null,
      dailyForecastKm: null,
      fullMonthForecastKm: null,
      observedKm: 0,
      observedOperatingDays: 0,
      calendarDays: 0,
      remainingCalendarDays: 0,
      observations: [],
      config: OPERATING_KM_FORECAST_CONFIG,
    }
  }

  const calendarDays = calendarDaysInclusive(start, end)
  const observations = deriveOperatingKmObservations({ shifts, from: start, to: end, asOf: boundary })

  let state = {
    dailyForecastKm: OPERATING_KM_FORECAST_CONFIG.normalPriorKmPerCalendarDay,
    direction: 0,
    persistenceDays: 0,
    observationUsed: false,
  }
  for (const observation of observations) {
    state = updateOperatingKmForecast(state, observation.km)
  }

  const observedKm = observations.reduce((sum, observation) => sum + observation.km, 0)
  const observedDays = new Set(observations.map(observation => observation.date))
  const observedCalendarDays = calendarDays.filter(day => day <= dayKey(boundary)).length
  const remainingCalendarDays = Math.max(0, calendarDays.length - observedCalendarDays)
  const fullMonthForecastKm = observedKm + state.dailyForecastKm * remainingCalendarDays

  // calculatedForecast and effectiveForecast are intentionally separate even
  // while no override exists. Future override logic can replace only the
  // effective value without changing the forecasting engine or evidence history.
  const calculatedForecast = {
    dailyKm: state.dailyForecastKm,
    fullPeriodKm: fullMonthForecastKm,
  }
  const effectiveForecast = calculatedForecast

  return {
    available: true,
    reason: null,
    calculatedForecast,
    effectiveForecast,
    dailyForecastKm: state.dailyForecastKm,
    fullMonthForecastKm,
    observedKm,
    observedOperatingDays: observedDays.size,
    calendarDays: calendarDays.length,
    remainingCalendarDays,
    observations,
    persistenceDays: state.persistenceDays,
    lastObservedKm: state.lastObservedKm ?? null,
    response: state.response ?? null,
    config: OPERATING_KM_FORECAST_CONFIG,
  }
}
