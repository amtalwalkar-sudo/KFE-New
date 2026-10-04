import { initializeCanonicalStorage } from '../../utils/indexedDB.js'
import { writeMutationAndAudit } from '../../repositories/mutationRepository.js'
import { AdminService } from '../admin/adminService.js'
import { BackupConfig } from '../backup/backupConfig.js'

const SETTING_ID = 'kfe-first-run-setup'
const SETTING_KEY = 'firstRunSetup'
const STORAGE = 'settings'

const readState = async () => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORAGE, 'readonly').objectStore(STORAGE).get(SETTING_ID)
    request.onsuccess = () => resolve(request.result?.values || null)
    request.onerror = () => reject(request.error || new Error('Unable to read first-run setup state.'))
  })
}

const saveState = async values => {
  const db = await initializeCanonicalStorage()
  const now = new Date().toISOString()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORAGE, 'pending_mutations', 'audit_history'], 'readwrite')
    const record = { id: SETTING_ID, settingKey: SETTING_KEY, values: structuredClone(values), createdAt: now, updatedAt: now }
    try {
      tx.objectStore(STORAGE).put(record)
      writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), {
        entityId: SETTING_ID, entityType: SETTING_KEY, action: 'UPDATE', payload: record, createdAt: now
      })
    } catch (error) {
      try { tx.abort() } catch (_) {}
      reject(error)
      return
    }
    tx.oncomplete = () => resolve(record.values)
    tx.onerror = () => reject(tx.error || new Error('Unable to save first-run setup state.'))
    tx.onabort = () => reject(tx.error || new Error('First-run setup state save aborted.'))
  })
}

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const readStore = async storeName => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error('Unable to read setup data.')) }) }

export const getFirstRunSetupState = async () => (await readState()) || { version: 1, status: 'not-started', steps: {}, completedAt: null }
export const setStepState = async (key, state) => {
  const current = await getFirstRunSetupState()
  return saveState({ ...current, version: 1, steps: { ...(current.steps || {}), [key]: state } })
}
export const completeFirstRunSetup = async () => {
  const current = await getFirstRunSetupState()
  return saveState({ ...current, version: 1, status: 'completed', completedAt: new Date().toISOString() })
}
export const isFirstRunSetupRequired = async () => (await getFirstRunSetupState()).status !== 'completed'

export const getCalculationSetupStatus = async () => {
  const state = await getFirstRunSetupState()
  const [businessSetup, vehicles, drivers, targets, breakEvenInputs, loans, compliance, maintenance, fuelLogs, backup] = await Promise.all([
    AdminService.list('businessSetup'), AdminService.list('vehicle'), AdminService.list('driver'),
    AdminService.list('driverTarget'), AdminService.list('breakEvenInputs'), AdminService.list('loan'),
    AdminService.list('compliance'), AdminService.list('maintenance'), readStore('fuel_logs'), BackupConfig.getBackupConfiguration(),
  ])
  const business = live(businessSetup)[0]?.values || {}
  const activeVehicle = live(vehicles).find(v => v.values?.active !== false && String(v.values?.status || 'Active').toLowerCase() === 'active') || live(vehicles)[0]
  const activeDriver = live(drivers).find(d => String(d.values?.status || 'Active').toLowerCase() === 'active') || live(drivers)[0]
  const activeLoan = live(loans).find(l => String(l.values?.status || 'Active').toLowerCase() === 'active')
  const currentTarget = live(targets).find(t => t.values?.active !== false)
  const currentRate = live(breakEvenInputs).find(x => Number.isFinite(Number(x.values?.maintenanceProvisionPerKm)))
  const preBusinessApplies = Boolean(activeLoan && business.businessStartDate && activeLoan.values?.startDate && String(activeLoan.values.startDate) < String(business.businessStartDate))
  const skipped = state.steps || {}
  const step = (key, complete, reason = '') => ({
    key,
    status: complete ? 'COMPLETE' : skipped[key]?.status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'INCOMPLETE',
    reason: complete ? '' : reason || (skipped[key]?.status === 'SKIPPED' ? 'Skipped during first-time setup; fill later.' : 'Required setup information is missing.'),
    skipped: skipped[key]?.status === 'SKIPPED',
  })
  return {
    onboardingCompleted: state.status === 'completed',
    steps: [
      step('businessSetup', Boolean(business.businessStartDate), 'Business Start Date is required to bound real-life calculations.'),
      step('vehicle', Boolean(activeVehicle), 'Add the active vehicle and opening odometer.'),
      step('driver', Boolean(activeDriver), 'Add the active driver/operator.'),
      step('breakEvenInputs', Boolean(currentRate), 'Add the effective Maintenance per KM planning input.'),
      step('driverTarget', Boolean(currentTarget), 'Add the monthly driver target, or leave it incomplete until known.'),
      step('loan', Boolean(activeLoan) || skipped.loan?.status === 'NOT_APPLICABLE', 'Add the active loan contract if the vehicle has financing; otherwise mark it not applicable.'),
      step('preBusiness', !preBusinessApplies || Boolean(activeLoan), preBusinessApplies ? 'Pre-business loan recovery is derived from the loan start date and Business Start Date.' : 'No pre-business loan recovery is currently applicable.'),
      step('historicalRecords', live(compliance).length + live(maintenance).length > 0 || skipped.historicalRecords?.status === 'NOT_APPLICABLE', 'Historical compliance and maintenance can be entered now or filled later.'),
      step('fuelBaseline', live(fuelLogs).length > 0, 'Fuel cost/KM evidence is incomplete until real refuelling records exist; full-tank evidence strengthens the result.'),
      step('cloudBackup', Boolean(backup.enabled && backup.hasAccessToken), 'Cloud backup is not connected. Local-first operation remains available.'),
    ],
  }
}
export const FirstRunSetupService = Object.freeze({ getFirstRunSetupState, setStepState, completeFirstRunSetup, isFirstRunSetupRequired, getCalculationSetupStatus })
