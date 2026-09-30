import { ref } from 'vue'
import { createRecordUseCase } from '@/usecases/recordUseCases.js'
import { useRecordsStore } from '@/stores/records.js'
import { useToast } from '@/composables/useToast.js'

export function useRecordForm() {
  const recordsStore = useRecordsStore()
  const toast = useToast()
  const busy = ref(false)
  const error = ref(null)

  async function submitRecord(formData) {
    busy.value = true
    error.value = null
    try {
      const isOnline = navigator.onLine
      const record = await createRecordUseCase(formData, isOnline)
      recordsStore.addRecord(record)
      toast.success(`Record saved ${isOnline ? 'and synced' : 'locally (offline)'}`)
      return true
    } catch (err) {
      error.value = err.message
      toast.error(err.message)
      return false
    } finally {
      busy.value = false
    }
  }

  return { submitRecord, busy, error }
}
