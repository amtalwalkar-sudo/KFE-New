import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { PeriodSnapshotRepository } from '../../repositories/periodSnapshotRepository.js'
import { deriveFinancialFactModel } from '../../domain/finance/financialFactModel.js'
import { buildPeriodSnapshot, completeIstMonthRange, periodKeyFor } from '../../domain/finance/periodSnapshot.js'
import { PerformanceService } from '../performance/performanceService.js'

const clone = value => structuredClone(value)

export const HistoricalIntegrityService = Object.freeze({
  async closePeriod(periodKey, { closedAt = new Date(), sourceDataAsOf = null } = {}) {
    const range = completeIstMonthRange(periodKey)
    if (!range) throw new Error(`Invalid financial period: ${periodKey}`)
    const now = new Date(closedAt)
    if (Number.isNaN(now.getTime()) || now.getTime() < range.to.getTime()) {
      throw new Error('The financial period is not yet complete and cannot be closed.')
    }
    if (await PeriodSnapshotRepository.get(periodKey)) {
      throw new Error(`Financial period ${periodKey} is already closed and immutable.`)
    }

    const calculationSnapshot = await PerformanceRepository.getSnapshot()
    const metrics = PerformanceService.getMetrics(calculationSnapshot, range)
    const financialFacts = metrics.financialFacts || deriveFinancialFactModel({ snapshot: calculationSnapshot, metrics, range })
    const snapshot = await buildPeriodSnapshot({
      periodKey,
      calculationSnapshot,
      metrics,
      financialFacts,
      closedAt: now,
      sourceDataAsOf: sourceDataAsOf || range.to,
    })
    await PeriodSnapshotRepository.create(snapshot)
    return clone(snapshot)
  },

  async getPeriod(periodKey, { now = new Date() } = {}) {
    const range = completeIstMonthRange(periodKey)
    if (!range) throw new Error(`Invalid financial period: ${periodKey}`)
    const reference = new Date(now)
    if (Number.isNaN(reference.getTime())) throw new Error('Invalid historical-integrity reference time.')
    const closed = await PeriodSnapshotRepository.get(periodKey)
    if (closed) return { mode: 'CLOSED_SNAPSHOT', periodKey, range, snapshot: closed, metrics: clone(closed.metrics), financialFacts: clone(closed.financialFacts) }

    const isComplete = reference.getTime() >= range.to.getTime()
    if (!isComplete) {
      const calculationSnapshot = await PerformanceRepository.getSnapshot()
      const metrics = PerformanceService.getMetrics(calculationSnapshot, range)
      return { mode: 'OPEN_DYNAMIC', periodKey, range, metrics: clone(metrics), financialFacts: clone(metrics.financialFacts || {}) }
    }
    return { mode: 'CLOSED_WITHOUT_SNAPSHOT', periodKey, range, metrics: null, financialFacts: null }
  },

  async reproduce(periodKey) {
    const snapshot = await PeriodSnapshotRepository.get(periodKey)
    if (!snapshot) throw new Error(`No closed financial period snapshot exists for ${periodKey}.`)
    const metrics = PerformanceService.getMetrics(clone(snapshot.calculationSnapshot), {
      from: new Date(snapshot.periodRange.from),
      to: new Date(snapshot.periodRange.to),
    })
    const financialFacts = metrics.financialFacts || deriveFinancialFactModel({
      snapshot: snapshot.calculationSnapshot,
      metrics,
      range: { from: new Date(snapshot.periodRange.from), to: new Date(snapshot.periodRange.to) },
    })
    return { snapshot, metrics, financialFacts }
  },

  periodKeyFor,
})
