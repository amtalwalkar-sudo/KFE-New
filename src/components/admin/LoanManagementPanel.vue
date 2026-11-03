<script setup>
import { computed, ref, watch } from 'vue'
import { LoanCalculationService } from '../../application/admin/loanCalculationService.js'
import { LoanRepaymentRepository } from '../../repositories/loanRepaymentRepository.js'
import './loan-management.css'
const props = defineProps({ loans: { type: Array, default: () => [] }, busy: { type: Boolean, default: false } })
const emit = defineEmits(['create', 'edit', 'refresh'])
const selectedId = ref(''), transactions = ref([]), loading = ref(false), message = ref(''), error = ref('')
const paymentDate = ref(new Date().toISOString().slice(0,10)), paymentAmount = ref(''), paymentInstallment = ref('')
const prepaymentDate = ref(new Date().toISOString().slice(0,10)), prepaymentAmount = ref(''), preview = ref(null), confirmOpen = ref(false)
const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const selectedLoan = computed(() => props.loans.find(item => item.id === selectedId.value) || null)
const values = computed(() => selectedLoan.value?.values || {})
const emi = computed(() => LoanCalculationService.monthlyEmi(values.value))
const roundedEmi = computed(() => LoanCalculationService.roundedPaymentAmount(values.value))
const schedule = computed(() => LoanCalculationService.scheduleWithTransactions(values.value, transactions.value))
const paidInstallments = computed(() => new Set(transactions.value.filter(item => item.type === 'EMI_PAYMENT').map(item => Number(item.installment))))
const outstanding = computed(() => {
  const paid = paidInstallments.value
  return schedule.value.at(-1)?.closingBalance || 0
})
const nextInstallment = computed(() => schedule.value.find(row => !paidInstallments.value.has(row.installment)) || null)
const scheduleRows = computed(() => schedule.value.map(row => ({ ...row, paid: paidInstallments.value.has(row.installment) })))
watch(() => props.loans, list => { if (!list.some(item => item.id === selectedId.value)) selectedId.value = list[0]?.id || '' }, { immediate: true, deep: true })
watch(selectedId, async id => {
  transactions.value = []; preview.value = null; confirmOpen.value = false
  if (!id) return
  loading.value = true; error.value = ''
  try { transactions.value = await LoanRepaymentRepository.list(id) }
  catch (cause) { error.value = cause.message || 'Unable to load loan history.' }
  finally { loading.value = false }
}, { immediate: true })
watch([nextInstallment, roundedEmi], ([row, amount]) => {
  paymentInstallment.value = row ? String(row.installment) : ''
  paymentAmount.value = amount === null ? '' : String(amount)
}, { immediate: true })
function previewPrepayment() {
  error.value = ''; message.value = ''; preview.value = null
  try {
    preview.value = LoanCalculationService.previewPrepayment(values.value, transactions.value, { amount: Number(prepaymentAmount.value), paymentDate: prepaymentDate.value })
    if (!preview.value.amount) throw new Error('The loan has no outstanding principal to prepay.')
    confirmOpen.value = true
  } catch (cause) { error.value = cause.message || 'Unable to calculate prepayment.' }
}
async function confirmPrepayment() {
  if (!preview.value || !selectedLoan.value || loading.value) return
  loading.value = true; error.value = ''; message.value = ''
  try {
    await LoanRepaymentRepository.record(selectedLoan.value, { type: 'PREPAYMENT', amount: preview.value.amount, paymentDate: preview.value.paymentDate, allocation: 'PRINCIPAL', tenureReductionMonths: preview.value.monthsReduced, interestSaved: preview.value.interestSaved })
    message.value = 'Prepayment recorded and loan principal updated.'
    confirmOpen.value = false; preview.value = null; prepaymentAmount.value = ''
    transactions.value = await LoanRepaymentRepository.list(selectedId.value); emit('refresh')
  } catch (cause) { error.value = cause.message || 'Prepayment could not be saved.' }
  finally { loading.value = false }
}
async function recordEmi() {
  if (!selectedLoan.value || !paymentInstallment.value || !paymentDate.value || Number(paymentAmount.value) <= 0 || loading.value) { error.value = 'Choose an EMI, payment date and a valid amount.'; return }
  loading.value = true; error.value = ''; message.value = ''
  try {
    await LoanRepaymentRepository.record(selectedLoan.value, { type: 'EMI_PAYMENT', installment: Number(paymentInstallment.value), dueDate: schedule.value.find(row => row.installment === Number(paymentInstallment.value))?.dueDate || '', paymentDate: paymentDate.value, amount: Number(paymentAmount.value), contractualEmi: emi.value, allocation: 'INTEREST_THEN_PRINCIPAL' })
    message.value = 'EMI payment saved to the loan history.'
    transactions.value = await LoanRepaymentRepository.list(selectedId.value); emit('refresh')
  } catch (cause) { error.value = cause.message || 'EMI payment could not be saved.' }
  finally { loading.value = false }
}
</script>
<template>
<section class="loan-workspace" aria-label="Loan repayments and history">
  <div v-if="loans.length" class="loan-picker">
    <label class="loan-field"><span>Select loan</span><select v-model="selectedId"><option v-for="loan in loans" :key="loan.id" :value="loan.id">{{ loan.values?.lender || 'Loan' }} · {{ loan.values?.accountReference || loan.id.slice(0,8) }}</option></select></label>
    <div class="loan-picker-actions"><button class="loan-secondary" type="button" :disabled="busy" @click="emit('create')">＋ Add loan</button><button class="loan-secondary" type="button" :disabled="!selectedLoan || busy" @click="emit('edit', selectedLoan)">Edit loan details</button></div>
  </div>
  <div v-if="!loans.length" class="loan-empty">Create a loan to start tracking its EMI schedule and repayments.</div>
  <template v-else-if="selectedLoan">
    <div class="loan-metrics">
      <div><span>Calculated EMI</span><strong>{{ money(emi) }}</strong></div><div><span>Rounded payment</span><strong>{{ money(roundedEmi) }}</strong></div><div><span>Outstanding principal*</span><strong>{{ money(outstanding) }}</strong></div><div><span>Next EMI due</span><strong>{{ nextInstallment?.dueDate || 'Completed' }}</strong></div>
    </div>
    <p class="loan-note">*Based on the contractual schedule and recorded EMI instalments. Prepayments are separately applied to principal.</p>
    <section class="loan-panel">
      <header><div><span class="loan-kicker">REPAYMENT</span><h2>Record EMI payment</h2><p>Enter the actual amount and date paid. The suggested amount is rounded to the nearest rupee.</p></div></header>
      <div class="loan-fields">
        <label class="loan-field"><span>EMI instalment</span><select v-model="paymentInstallment"><option v-for="row in scheduleRows.filter(item => !item.paid)" :key="row.installment" :value="String(row.installment)">#{{ row.installment }} · Due {{ row.dueDate }}</option></select></label>
        <label class="loan-field"><span>Payment date</span><input v-model="paymentDate" type="date"></label>
        <label class="loan-field"><span>Amount paid (₹)</span><input v-model="paymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
      </div>
      <p class="loan-help">Suggested rounded amount: {{ money(roundedEmi) }}. You can change it to match the actual payment.</p>
      <button class="loan-primary" type="button" :disabled="loading || !nextInstallment" @click="recordEmi">Save EMI payment</button>
    </section>
    <section class="loan-panel">
      <header><div><span class="loan-kicker">PART-PAYMENT</span><h2>Prepayment · Reduce tenure</h2><p>Keep the EMI unchanged and use the extra payment to close the loan earlier.</p></div></header>
      <div class="loan-fields">
        <label class="loan-field"><span>Prepayment amount (₹)</span><input v-model="prepaymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter amount"></label>
        <label class="loan-field"><span>Prepayment date</span><input v-model="prepaymentDate" type="date"></label>
      </div>
      <button class="loan-secondary" type="button" :disabled="loading || !prepaymentAmount || !prepaymentDate" @click="previewPrepayment">Calculate prepayment impact</button>
      <div v-if="confirmOpen && preview" class="loan-preview" aria-live="polite">
        <h3>Review before confirming</h3>
        <div><span>Principal before payment</span><strong>{{ money(preview.outstandingBefore) }}</strong></div><div><span>Prepayment applied to principal</span><strong>{{ money(preview.amount) }}</strong></div><div><span>Revised principal</span><strong>{{ money(preview.outstandingAfter) }}</strong></div><div><span>Estimated interest saved</span><strong>{{ money(preview.interestSaved) }}</strong></div><div><span>Tenure reduction</span><strong>{{ preview.monthsReduced }} months</strong></div>
        <p>EMI stays at {{ money(preview.emiAmount) }}. Estimate assumes the lender applies the full prepayment to principal with no charges.</p>
        <div class="loan-confirm-actions"><button class="loan-secondary" type="button" :disabled="loading" @click="confirmOpen=false">Cancel</button><button class="loan-primary" type="button" :disabled="loading" @click="confirmPrepayment">Confirm and record prepayment</button></div>
      </div>
    </section>
    <section class="loan-panel">
      <header><div><span class="loan-kicker">SCHEDULE</span><h2>EMI schedule</h2><p>Due dates are separate from the dates you actually pay.</p></div></header>
      <div class="loan-schedule"><div v-for="row in scheduleRows" :key="row.installment" class="loan-schedule-row" :class="{ 'is-paid': row.paid }"><div><strong>EMI {{ row.installment }}</strong><small>Due {{ row.dueDate }}</small></div><div><strong>{{ money(row.emi) }}</strong><small>Principal {{ money(row.principal) }} · Interest {{ money(row.interest) }}</small></div><span :class="row.paid ? 'loan-paid' : 'loan-pending'">{{ row.paid ? 'PAID' : 'PENDING' }}</span></div></div>
    </section>
    <section class="loan-panel">
      <header><div><span class="loan-kicker">HISTORY</span><h2>Payment records</h2><p>Confirmed EMI and prepayment entries for this loan.</p></div></header>
      <div v-if="loading" class="loan-empty">Loading payment history…</div><div v-else-if="transactions.length" class="loan-history"><article v-for="item in transactions" :key="item.id"><div><strong>{{ item.type === 'PREPAYMENT' ? 'Prepayment' : 'EMI payment · #' + item.installment }}</strong><small>Paid {{ item.paymentDate }}<template v-if="item.dueDate"> · Due {{ item.dueDate }}</template></small></div><strong>{{ money(item.amount) }}</strong></article></div><div v-else class="loan-empty">No payments recorded yet.</div>
    </section>
  </template>
  <p v-if="error" class="loan-alert is-error" role="alert">{{ error }}</p><p v-if="message" class="loan-alert is-success" role="status">{{ message }}</p>
</section>
</template>
