import { AdminRepository } from '../../repositories/adminRepository.js'
import { AdminService } from '../admin/adminService.js'

const SETTING_ID = 'kfe-first-run-setup'
const SETTING_KEY = 'firstRunSetup'
const readState = async () => (await AdminRepository.getSetting(SETTING_ID))?.values || null
const saveState = async values => {
  const now = new Date().toISOString()
  await AdminRepository.saveSetting(SETTING_ID, SETTING_KEY, values)
  return structuredClone(values)
}
const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)

export const getFirstRunSetupState = async () => (await readState()) || { version: 1, status: 'not-started', steps: {}, completedAt: null }
export const setStepState = async (key, state) => {
  const current = await getFirstRunSetupState()
  return saveState({ ...current, version: 1, steps: { ...(current.steps || {}), [key]: state } })
}
export const completeFirstRunSetup = async () => {
  const current = await getFirstRunSetupState()
  return saveState({ ...current, version: 1, status: 'completed', completedAt: new Date().toISOString() })
}
export const isFirstRunSetupRequired = async () => {
  const state = await getFirstRunSetupState()
  if (state.status === 'completed') return false
  const [businessSetup, vehicles, drivers] = await Promise.all([AdminService.list('businessSetup'), AdminService.list('vehicle'), AdminService.list('driver')])
  if (live(businessSetup).length || live(vehicles).length || live(drivers).length) {
    await saveState({ ...state, version: 1, status: 'completed', completedAt: new Date().toISOString(), autoCompletedForExistingData: true })
    return false
  }
  return true
}

export const FirstRunSetupService = Object.freeze({ getFirstRunSetupState, setStepState, completeFirstRunSetup, isFirstRunSetupRequired })
