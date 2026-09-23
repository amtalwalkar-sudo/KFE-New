<script setup>
import FormLayout from '@/layouts/FormLayout.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useForm } from '@/composables/useForm.js'
import { useRecordForm } from '@/composables/useRecordForm.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()
const { submitRecord, busy: syncing, error: submitError } = useRecordForm()

const { form, busy: formBusy, reset, submit } = useForm({
  record_type: 'REVENUE',
  amount: '',
  notes: '',
  date: new Date().toISOString().substring(0, 10)
})

async function handleFormSubmit() {
  await submit(async (formData) => {
    const success = await submitRecord(formData)
    if (success) reset()
  })
}

function handleCancel() {
  reset()
  toast.info('Form reset')
}
</script>

<template>
  <FormLayout
    title="Authoritative Record Form"
    subtitle="Submit entry with decoupled architecture"
    :loading="formBusy || syncing"
    @submit="handleFormSubmit"
    @cancel="handleCancel"
  >
    <div v-if="submitError" class="form-error-alert">
      {{ submitError }}
    </div>

    <div class="form-group">
      <label class="form-label">Record Type</label>
      <select v-model="form.record_type" class="type-select" :disabled="formBusy || syncing">
        <option value="REVENUE">Revenue</option>
        <option value="EXPENSE">Expense</option>
        <option value="FUEL">Fuel</option>
      </select>
    </div>

    <BaseInput
      v-model="form.amount"
      type="number"
      label="Amount (₹)"
      placeholder="0.00"
      required
      :disabled="formBusy || syncing"
    />

    <BaseInput
      v-model="form.date"
      type="date"
      label="Date"
      required
      :disabled="formBusy || syncing"
    />

    <BaseInput
      v-model="form.notes"
      type="text"
      label="Notes / Description"
      placeholder="Optional entry details..."
      :disabled="formBusy || syncing"
    />

    <template #actions>
      <BaseButton type="button" variant="secondary" :disabled="formBusy || syncing" @click="handleCancel">
        Clear
      </BaseButton>
      <BaseButton type="submit" variant="primary" :loading="formBusy || syncing">
        Save Record
      </BaseButton>
    </template>
  </FormLayout>
</template>

