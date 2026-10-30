import { istDateKey } from '../time/ist.js'

const live = records => (Array.isArray(records) ? records : []).filter(record => !record?.deletedAt && record?.deleted !== true)

export function getApplicableMaintenanceRateRecord(inputs = [], date) {
  const key = istDateKey(date)
  if (!key) return null
  return live(inputs)
    .filter(row => row.active !== false && row.status !== 'INACTIVE')
    .map(row => ({
      ...row,
      effectiveKey: istDateKey(row.effectiveFrom) || String(row.effectiveFrom || '').slice(0, 10),
      untilKey: istDateKey(row.effectiveUntil || row.validUntil || row.endDate),
    }))
    .filter(row => row.effectiveKey && row.effectiveKey <= key && (!row.untilKey || row.untilKey >= key)
      && row.maintenanceProvisionPerKm != null && row.maintenanceProvisionPerKm !== ''
      && Number.isFinite(Number(row.maintenanceProvisionPerKm)) && Number(row.maintenanceProvisionPerKm) >= 0)
    .sort((a, b) => String(b.effectiveKey).localeCompare(String(a.effectiveKey))
      || String(b.updatedAt || b.createdAt || b.id || '').localeCompare(String(a.updatedAt || a.createdAt || a.id || '')))[0] || null
}

export function getApplicableMaintenanceRate(inputs = [], date) {
  const row = getApplicableMaintenanceRateRecord(inputs, date)
  return row ? Number(row.maintenanceProvisionPerKm) : NaN
}
