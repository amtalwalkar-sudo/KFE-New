import { defineStore } from 'pinia'
import { ref } from 'vue'
import { WorkService } from '../application/work/workService.js'

export const useFuelStore = defineStore('fuel', () => {
  const logs = ref([])
  const saving = ref(false)
  const deleting = ref(false)

  const refresh = async () => { logs.value = await WorkService.getFuelLogs() }
  const calculateQuantity = (pricePerKg, amount) => {
    const result = WorkService.calculateFuelQuantity(pricePerKg, amount)
    return result.valid ? result.quantityKg : 0
  }

  const save = async data => {
    saving.value = true
    try {
      const result = await WorkService.recordFuel(data)
      if (result.ok) await refresh()
      return result
    } finally { saving.value = false }
  }

  const update = async data => {
    saving.value = true
    try {
      const result = await WorkService.updateFuel(data)
      if (result.ok) await refresh()
      return result
    } catch (error) {
      return { ok: false, reason: error?.message || 'FUEL_UPDATE_FAILED' }
    } finally { saving.value = false }
  }

  const remove = async id => {
    deleting.value = true
    try {
      const result = await WorkService.deleteFuel(id)
      if (result.ok) await refresh()
      return result
    } catch (error) {
      return { ok: false, reason: error?.message || 'FUEL_DELETE_FAILED' }
    } finally { deleting.value = false }
  }

  return { logs, saving, deleting, refresh, save, update, remove, calculateQuantity }
})
