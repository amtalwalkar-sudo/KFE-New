export const KFE_TIME_ZONE = 'Asia/Kolkata'
export const KFE_TIME_ZONE_LABEL = 'IST (Asia/Kolkata)'
const IST_OFFSET_MINUTES = 330
const DAY_MS = 86400000
const SYNTHETIC_CONTEXT_KEY = 'kfe:synthetic-date-context'

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KFE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KFE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const dateOnlyParts = value => {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export const istParts = value => {
  const dateOnly = dateOnlyParts(value)
  if (dateOnly) return dateOnly
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

const istDateTimeParts = value => {
  const dateOnly = dateOnlyParts(value)
  if (dateOnly) return { ...dateOnly, hour: 0, minute: 0, second: 0 }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  }
}

export const istDateKey = value => {
  const p = istParts(value)
  return p ? `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` : null
}

export const istMonthKey = value => {
  const p = istParts(value)
  return p ? `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}` : null
}

const utcForIst = (year, month, day, hour, minute, second, ms) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - IST_OFFSET_MINUTES * 60000)

const dateKeyOrdinal = key => {
  if (!key) return null
  const [year, month, day] = String(key).split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return null
  return Date.UTC(year, month - 1, day) / DAY_MS
}

export const istCalendarDaysInclusive = (from, to) => {
  const a = dateKeyOrdinal(istDateKey(from))
  const b = dateKeyOrdinal(istDateKey(to))
  return a == null || b == null || b < a ? 0 : b - a + 1
}

export const istDayRange = value => {
  const p = istParts(value)
  if (!p) return null
  return {
    from: utcForIst(p.year, p.month, p.day, 0, 0, 0, 0),
    to: utcForIst(p.year, p.month, p.day, 23, 59, 59, 999),
  }
}

export const istMonthRange = (value, asOf = new Date()) => {
  const p = istParts(value)
  if (!p) return null
  const from = utcForIst(p.year, p.month, 1, 0, 0, 0, 0)
  const nextMonth = p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 }
  const monthEnd = new Date(utcForIst(nextMonth.year, nextMonth.month, 1, 0, 0, 0, 0).getTime() - 1)
  const asOfParts = istParts(asOf)
  const isCurrentMonth = asOfParts && asOfParts.year === p.year && asOfParts.month === p.month
  const dayEnd = istDayRange(value).to
  return { from, to: isCurrentMonth ? new Date(Math.min(monthEnd.getTime(), dayEnd.getTime())) : monthEnd }
}

export const addIstMonths = (value, months) => {
  const p = istDateTimeParts(value)
  if (!p || !Number.isFinite(Number(months))) return null
  const index = p.year * 12 + (p.month - 1) + Number(months)
  const year = Math.floor(index / 12)
  const month = index % 12 + 1
  const day = Math.min(p.day, new Date(Date.UTC(year, month, 0)).getUTCDate())
  return utcForIst(year, month, day, p.hour, p.minute, p.second, value instanceof Date ? value.getUTCMilliseconds() : 0)
}

export const setSyntheticDateContext = ({ startDate, endDate } = {}) => {
  if (typeof sessionStorage === 'undefined') return
  if (!startDate || !endDate) {
    sessionStorage.removeItem(SYNTHETIC_CONTEXT_KEY)
    return
  }
  sessionStorage.setItem(SYNTHETIC_CONTEXT_KEY, JSON.stringify({ startDate, endDate }))
}

export const clearSyntheticDateContext = () => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SYNTHETIC_CONTEXT_KEY)
}

export const getSyntheticDateContext = () => {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const value = JSON.parse(sessionStorage.getItem(SYNTHETIC_CONTEXT_KEY) || 'null')
    if (!value?.startDate || !value?.endDate) return null
    return value
  } catch (_) {
    return null
  }
}

export const getKfeReferenceNow = (fallback = new Date()) => {
  const context = getSyntheticDateContext()
  if (!context?.endDate) return fallback
  const date = new Date(`${context.endDate}T23:59:59+05:30`)
  return Number.isNaN(date.getTime()) ? fallback : date
}

const clampRangeToSyntheticContext = range => {
  const context = getSyntheticDateContext()
  if (!context || !range) return range
  const contextRange = {
    from: istDayRange(context.startDate).from,
    to: istDayRange(context.endDate).to,
  }
  return {
    from: new Date(Math.max(range.from.getTime(), contextRange.from.getTime())),
    to: new Date(Math.min(range.to.getTime(), contextRange.to.getTime())),
  }
}

export const reportingRangeFor = (period, now = getKfeReferenceNow()) => {
  if (period === 'CUSTOM RANGE') return null
  if (period === 'TILL DATE') return clampRangeToSyntheticContext({ from: new Date(0), to: now })
  if (period === 'DAY') return clampRangeToSyntheticContext(istDayRange(now))
  if (period === 'MONTH') return clampRangeToSyntheticContext(istMonthRange(now, now))
  if (period === 'WEEK') {
    const p = istParts(now)
    const day = new Date(utcForIst(p.year, p.month, p.day, 12, 0, 0, 0))
    const weekday = day.getUTCDay()
    const mondayOffset = (weekday + 6) % 7
    const monday = new Date(day.getTime() - mondayOffset * DAY_MS)
    return clampRangeToSyntheticContext({ from: istDayRange(monday).from, to: istDayRange(now).to })
  }
  const months = { '3 MONTHS': 3, '6 MONTHS': 6, '1 YEAR': 12, 'MULTI-YEAR': 60 }[period]
  if (months) {
    const start = addIstMonths(now, -months)
    return clampRangeToSyntheticContext({ from: istDayRange(start).from, to: istDayRange(now).to })
  }
  return clampRangeToSyntheticContext(istDayRange(now))
}
