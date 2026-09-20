import { initializeCanonicalStorage } from '../utils/indexedDB.js'

const PERFORMANCE_STORES = Object.freeze([
  'shifts', 'trips', 'fuel_logs', 'vehicles', 'drivers',
  'compliance_records', 'maintenance_records', 'loans', 'loan_payments',
  'prepayments', 'driver_targets', 'break_even_inputs',
])

const readSnapshot = async () => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...PERFORMANCE_STORES], 'readonly')
    const result = {}
    for (const storeName of PERFORMANCE_STORES) {
      const request = tx.objectStore(storeName).getAll()
      request.onsuccess = () => { result[storeName] = request.result || [] }
      request.onerror = () => {
        try { tx.abort() } catch (_) {}
        reject(request.error || new Error(`${storeName} query failed.`))
      }
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error('Performance snapshot transaction failed.'))
    tx.onabort = () => reject(tx.error || new Error('Performance snapshot transaction aborted.'))
  })
}

export const PerformanceRepository = {
  async getSnapshot() {
    const data = await readSnapshot()
    return {
      shifts: data.shifts,
      trips: data.trips,
      fuelLogs: data.fuel_logs,
      vehicles: data.vehicles,
      drivers: data.drivers,
      compliance: data.compliance_records,
      maintenance: data.maintenance_records,
      loans: data.loans,
      loanPayments: data.loan_payments,
      prepayments: data.prepayments,
      driverTargets: data.driver_targets,
      breakEvenInputs: data.break_even_inputs,
    }
  }
}
