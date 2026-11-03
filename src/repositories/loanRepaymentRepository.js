import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
const STORE = 'loan_transactions'
const read = (store, loanId) => new Promise((resolve, reject) => {
  const request = store.index('loanId').getAll(loanId)
  request.onsuccess = () => resolve(request.result || [])
  request.onerror = () => reject(request.error || new Error('Unable to read loan payment history.'))
})
export const LoanRepaymentRepository = Object.freeze({
  async list(loanId) {
    if (!loanId) return []
    const db = await initializeCanonicalStorage()
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      read(tx.objectStore(STORE), loanId).then(resolve, reject)
      tx.onerror = () => reject(tx.error || new Error('Unable to read loan transactions.'))
    })
    return rows.sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)) || String(b.createdAt).localeCompare(String(a.createdAt)))
  },
  async record(loan, transaction) {
    if (!loan?.id) throw new Error('Select a saved loan before recording a payment.')
    if (!['EMI_PAYMENT', 'PREPAYMENT'].includes(transaction?.type)) throw new Error('Unsupported loan transaction.')
    if (!transaction.paymentDate || !Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) <= 0) throw new Error('Enter a valid payment date and amount.')
    if (transaction.type === 'EMI_PAYMENT' && (!Number.isInteger(Number(transaction.installment)) || Number(transaction.installment) < 1)) throw new Error('Select a valid EMI instalment.')
    const db = await initializeCanonicalStorage()
    const id = generateUUID(), now = new Date().toISOString()
    const record = { ...structuredClone(transaction), id, loanId: loan.id, lender: loan.values?.lender || loan.lender || '', createdAt: now, updatedAt: now, status: 'CONFIRMED' }
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, 'loans', 'pending_mutations', 'audit_history'], 'readwrite')
      const loanRequest = tx.objectStore('loans').get(loan.id)
      const historyRequest = tx.objectStore(STORE).index('loanId').getAll(loan.id)
      let currentLoan = null, historyRows = null, failed = false, committed = false
      const fail = error => { if (failed) return; failed = true; try { tx.abort() } catch (_) {}; reject(error) }
      const commit = () => {
        if (committed || failed || !currentLoan || !historyRows) return
        committed = true
        if (currentLoan.deleted || currentLoan.deletedAt) { fail(new Error('This loan no longer exists. Refresh the loan list and retry.')); return }
        if (transaction.type === 'EMI_PAYMENT' && historyRows.some(item => item.type === 'EMI_PAYMENT' && Number(item.installment) === Number(transaction.installment))) { fail(new Error('This EMI instalment already has a confirmed payment. Refresh the schedule.')); return }
        if (transaction.type === 'PREPAYMENT') {
          const principal = Number(currentLoan.values?.principal ?? currentLoan.principal ?? 0)
          const previousPrepayments = historyRows.filter(item => item.type === 'PREPAYMENT').reduce((sum, item) => sum + Number(item.amount || 0), 0)
          if (Number(transaction.amount) > Math.max(0, principal - previousPrepayments) + 0.005) { fail(new Error('Prepayment exceeds the remaining loan principal. Recalculate before confirming.')); return }
        }
        tx.objectStore(STORE).add(record)
        writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: 'loan_transaction', action: 'CREATE', payload: record, createdAt: now })
        if (transaction.type === 'PREPAYMENT') writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: loan.id, entityType: 'loan', action: 'PREPAYMENT', payload: { loanId: loan.id, amount: Number(transaction.amount), paymentDate: transaction.paymentDate }, createdAt: now })
      }
      loanRequest.onsuccess = () => { currentLoan = loanRequest.result; if (!currentLoan) { fail(new Error('This loan no longer exists. Refresh the loan list and retry.')); return }; commit() }
      historyRequest.onsuccess = () => { historyRows = historyRequest.result || []; commit() }
      loanRequest.onerror = () => fail(loanRequest.error || new Error('Unable to verify the selected loan.'))
      historyRequest.onerror = () => fail(historyRequest.error || new Error('Unable to verify existing loan payments.'))
      tx.oncomplete = () => { if (!failed) { notifyCanonicalDataChanged({ stores: [STORE], reason: 'loan:payment-confirmed' }); resolve(record) } }
      tx.onerror = () => fail(tx.error || new Error('Unable to save the loan payment.'))
      tx.onabort = () => { if (!failed) { failed = true; reject(tx.error || new Error('Loan payment was not saved.')) } }
    })
  },
})
