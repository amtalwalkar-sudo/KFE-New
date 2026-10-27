/**
 * Application boundary for Admin's domain-derived read models.
 *
 * Admin presentation submits user intent and renders these results; it does
 * not import financial calculation engines or domain time utilities directly.
 */
import {
  deriveLoanPosition,
  calculatePrepaymentEstimate,
  paymentAllocationPreview,
} from '../../domain/finance/loanEngine.js'
import { getKfeReferenceNow, istDateKey } from '../../domain/time/ist.js'

export const AdminReadModelService = Object.freeze({
  referenceNow() {
    return getKfeReferenceNow()
  },

  dateKey(value) {
    return istDateKey(value)
  },

  getLoanPosition(input) {
    return deriveLoanPosition(input)
  },

  estimatePrepayment(input) {
    return calculatePrepaymentEstimate(input)
  },

  previewPaymentAllocation(input) {
    return paymentAllocationPreview(input)
  },
})
