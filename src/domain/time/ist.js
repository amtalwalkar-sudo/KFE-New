export const KFE_TIME_ZONE = 'Asia/Kolkata'
export const KFE_TIME_ZONE_LABEL = 'IST (Asia/Kolkata)'
const IST_OFFSET_MINUTES = 330

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KFE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const istParts = value => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
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
  const p = istParts(value)
  if (!p) return null
  const index = p.year * 12 + (p.month - 1) + months
  const year = Math.floor(index / 12)
  const month = index % 12 + 1
  const day = Math.min(p.day, new Date(Date.UTC(year, month, 0)).getUTCDate())
  return utcForIst(year, month, day, 12, 0, 0, 0)
}

export const reportingRangeFor = (period, now = new Date()) => {
  if (period === 'CUSTOM RANGE') return null
  if (period === 'TILL DATE') return { from: new Date(0), to: now }
  if (period === 'DAY') return istDayRange(now)
  if (period === 'MONTH') return istMonthRange(now, now)
  if (period === 'WEEK') {
    const p = istParts(now)
    const day = new Date(utcForIst(p.year, p.month, p.day, 12, 0, 0, 0))
    const weekday = day.getUTCDay()
    const mondayOffset = (weekday + 6) % 7
    const monday = new Date(day.getTime() - mondayOffset * 86400000)
    return { from: istDayRange(monday).from, to: istDayRange(now).to }
  }
  const months = { '3 MONTHS': 3, '6 MONTHS': 6, '1 YEAR': 12, 'MULTI-YEAR': 60 }[period]
  if (months) {
    const start = addIstMonths(now, -months)
    return { from: istDayRange(start).from, to: istDayRange(now).to }
  }
  return istDayRange(now)
}
