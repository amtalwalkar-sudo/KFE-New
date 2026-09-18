import { initializeCanonicalStorage } from '../utils/indexedDB.js'

const readAll = async storeName => {
  const db = await initializeCanonicalStorage()
  if (!db.objectStoreNames.contains(storeName)) return []
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error || new Error(`${storeName} query failed.`))
  })
}

export const PerformanceRepository = {
  async getSnapshot() {
    const [shifts, trips, fuelLogs, vehicles, drivers, compliance, maintenance, loans, loanPayments, prepayments, driverTargets, breakEvenInputs] = await Promise.all([
      readAll('shifts'), readAll('trips'), readAll('fuel_logs'), readAll('vehicles'), readAll('drivers'), readAll('compliance_records'), readAll('maintenance_records'), readAll('loans'), readAll('loan_payments'), readAll('prepayments'), readAll('driver_targets'), readAll('break_even_inputs'),
    ])
    return { shifts, trips, fuelLogs, vehicles, drivers, compliance, maintenance, loans, loanPayments, prepayments, driverTargets, breakEvenInputs }
  }
}
