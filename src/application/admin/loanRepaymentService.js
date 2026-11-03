import { LoanRepaymentRepository } from '../../repositories/loanRepaymentRepository.js'
import { BackupService } from '../backup/backupService.js'
export const LoanRepaymentService = Object.freeze({
  list(loanId) { return LoanRepaymentRepository.list(loanId) },
  async record(loan, transaction) {
    const saved = await LoanRepaymentRepository.record(loan, transaction)
    BackupService.requestLocalBackupCheckpoint()
    return saved
  },
})
