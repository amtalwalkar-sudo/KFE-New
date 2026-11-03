import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../../utils/indexedDB.js'
import { generateUUID } from '../../utils/uuid.js'
import { writeMutationAndAudit } from '../../repositories/mutationRepository.js'
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
    const db = await initializeCanonicalStorage()
    const id = generateUUID(), now = new Date().toISOString()
    const record = { ...structuredClone(transaction), id, loanId: loan.id, lender: loan.values?.lender || loan.lender || '', createdAt: now, updatedAt: now, status: 'CONFIRMED' }
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, 'loans', 'pending_mutations', 'audit_history'], 'readwrite')
      const loanStore = tx.objectStore('loans')
      const loanRequest = loanStore.get(loan.id)
      let failed = false
      const fail = error => { if (failed) return; failed = true; try { tx.abort() } catch (_) {}; reject(error) }
      loanRequest.onsuccess = () => {
        const current = loanRequest.result
        if (!current || current.deleted || current.deletedAt) { fail(new Error('This loan no longer exists. Refresh the loan list and retry.')); return }
        if (transaction.type === 'PREPAYMENT') {
          const currentValues = current.values || current
          const nextPrincipal = Math.max(0, Math.round((Number(currentValues.principal || 0) - Number(transaction.amount) + Number.EPSILON) * 100) / 100)
          loanStore.put({ ...current, values: { ...currentValues, principal: nextPrincipal }, updatedAt: now })
        }
        tx.objectStore(STORE).add(record)
        writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: 'loan_transaction', action: 'CREATE', payload: record, createdAt: now })
        if (transaction.type === 'PREPAYMENT') writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: loan.id, entityType: 'loan', action: 'PREPAYMENT', payload: { loanId: loan.id, amount: Number(transaction.amount), paymentDate: transaction.paymentDate }, createdAt: now })
      }
      loanRequest.onerror = () => fail(loanRequest.error || new Error('Unable to verify the selected loan.'))
      tx.oncomplete = () => { if (!failed) { notifyCanonicalDataChanged({ stores: [STORE, 'loans'], reason: 'loan:payment-confirmed' }); resolve(record) } }
      tx.onerror = () => fail(tx.error || new Error('Unable to save the loan payment.'))
      tx.onabort = () => { if (!failed) { failed = true; reject(tx.error || new Error('Loan payment was not saved.')) } }
    })
  },
})
