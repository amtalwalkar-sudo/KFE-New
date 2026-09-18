import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { deriveLoanPosition } from '../../domain/finance/loanEngine.js'
import { getKfeReferenceNow } from '../../domain/time/ist.js'

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)

export const LoanReadModelService = Object.freeze({
  async getLoanReadModel(asOf = getKfeReferenceNow()) {
    const snapshot = await PerformanceRepository.getSnapshot()
    const loans = live(snapshot?.loans)
      .filter(loan => String(loan.status || '').toUpperCase() === 'ACTIVE')
      .filter(loan => Number(loan.principal) > 0 && Number(loan.tenureMonths) > 0)
      .filter(loan => loan.startDate && new Date(loan.startDate) <= new Date(asOf))

    const positions = loans.map(loan => {
      const position = deriveLoanPosition({
        loan,
        payments: live(snapshot?.loanPayments),
        prepayments: live(snapshot?.prepayments),
        asOf,
      })
      return {
        loan,
        position,
        overdue: position.overdue || [],
        overdueCount: (position.overdue || []).length,
        overdueAmount: position.totalOverdue || 0,
        nextDueDate: (position.schedule || []).find(row => new Date(row.dueDate) > new Date(asOf))?.dueDate || null,
      }
    })

    const active = positions[0] || null
    return {
      asOf: new Date(asOf).toISOString(),
      activeLoan: active,
      loans: positions,
      available: positions.length > 0,
    }
  },
})
