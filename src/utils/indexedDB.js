const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'
const CANONICAL_DB_VERSION = 9
const CANONICAL_DB_CHANGE_EVENT = 'kfe:canonical-data-changed'
const CANONICAL_DB_CHANNEL = 'kfe-canonical-db-changes'

let dbInstance = null
let initializationPromise = null
let isInitialized = false

let changeChannel = null
const getChangeChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!changeChannel) changeChannel = new BroadcastChannel(CANONICAL_DB_CHANNEL)
  return changeChannel
}

export const notifyCanonicalDataChanged = ({ stores = [], reason = 'mutation' } = {}) => {
  const detail = { stores: [...new Set(stores)], reason, changedAt: new Date().toISOString() }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CANONICAL_DB_CHANGE_EVENT, { detail }))
  getChangeChannel()?.postMessage(detail)
}

export const subscribeCanonicalDataChanges = callback => {
  if (typeof window === 'undefined') return () => {}
  const handler = event => callback(event.detail || {})
  window.addEventListener(CANONICAL_DB_CHANGE_EVENT, handler)
  const channel = getChangeChannel()
  const channelHandler = event => callback(event.data || {})
  channel?.addEventListener('message', channelHandler)
  return () => {
    window.removeEventListener(CANONICAL_DB_CHANGE_EVENT, handler)
    channel?.removeEventListener('message', channelHandler)
  }
}

const createSimpleStore = (db, name, indexes = []) => {
  if (db.objectStoreNames.contains(name)) return
  const store = db.createObjectStore(name, { keyPath: 'id' })
  indexes.forEach(index => store.createIndex(index, index, { unique: false }))
}

export const openCanonicalDB = () => new Promise((resolve, reject) => {
  if (dbInstance) return resolve(dbInstance)
  const request = indexedDB.open(CANONICAL_DB_NAME, CANONICAL_DB_VERSION)
  request.onupgradeneeded = (e) => {
    const db = e.target.result
    if (!db.objectStoreNames.contains('shifts')) { const store = db.createObjectStore('shifts', { keyPath: 'id' }); store.createIndex('shiftEndAt', 'shiftEndAt', { unique: false }) }
    if (!db.objectStoreNames.contains('fuel_logs')) { const store = db.createObjectStore('fuel_logs', { keyPath: 'id' }); store.createIndex('createdAt', 'createdAt', { unique: false }) }
    if (!db.objectStoreNames.contains('odoGaps')) db.createObjectStore('odoGaps', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('pending_mutations')) { const store = db.createObjectStore('pending_mutations', { keyPath: 'id' }); store.createIndex('createdAt', 'createdAt', { unique: false }); store.createIndex('status', 'status', { unique: false }) }
    if (!db.objectStoreNames.contains('days')) { const store = db.createObjectStore('days', { keyPath: 'id' }); store.createIndex('status', 'status', { unique: false }); store.createIndex('dayStartAt', 'dayStartAt', { unique: false }) }
    if (!db.objectStoreNames.contains('trips')) { const store = db.createObjectStore('trips', { keyPath: 'id' }); store.createIndex('dayId', 'dayId', { unique: false }); store.createIndex('shiftId', 'shiftId', { unique: false }); store.createIndex('status', 'status', { unique: false }); store.createIndex('tripStartAt', 'tripStartAt', { unique: false }) }
    if (!db.objectStoreNames.contains('gps_snapshots')) { const store = db.createObjectStore('gps_snapshots', { keyPath: 'id' }); store.createIndex('entityType', 'entityType', { unique: false }); store.createIndex('entityId', 'entityId', { unique: false }); store.createIndex('capturedAt', 'capturedAt', { unique: false }) }
    if (!db.objectStoreNames.contains('movement_artifacts')) { storeOrCreate(db, 'movement_artifacts', ['shiftId', 'generatedAt']) }
    createSimpleStore(db, 'vehicles', ['registrationNumber', 'active'])
    createSimpleStore(db, 'drivers', ['status', 'name'])
    createSimpleStore(db, 'compliance_records', ['vehicleId', 'complianceType', 'validUntil'])
    createSimpleStore(db, 'maintenance_records', ['vehicleId', 'performedOn'])
    createSimpleStore(db, 'driver_collected_data', ['driverId', 'vehicleId', 'recordedOn'])
    createSimpleStore(db, 'loans', ['status', 'startDate'])
    createSimpleStore(db, 'loan_payments', ['loanId', 'paidOn', 'status'])
    createSimpleStore(db, 'prepayments', ['loanId', 'paidOn'])
    createSimpleStore(db, 'driver_targets', ['driverId', 'effectiveFrom', 'active'])
    createSimpleStore(db, 'break_even_inputs', ['effectiveFrom'])
    createSimpleStore(db, 'settings', ['settingKey', 'updatedAt'])
    createSimpleStore(db, 'audit_history', ['entityId', 'entityType', 'action', 'createdAt'])
    if (db.objectStoreNames.contains('admin_records')) db.deleteObjectStore('admin_records')
    if (db.objectStoreNames.contains('financial_inputs')) db.deleteObjectStore('financial_inputs')
  }
  request.onsuccess = () => { dbInstance = request.result; dbInstance.onversionchange = () => { dbInstance.close(); dbInstance = null; isInitialized = false; initializationPromise = null }; resolve(dbInstance) }
  request.onerror = () => reject(request.error || new Error('Canonical database could not be opened.'))
})

const storeOrCreate = (db, name, indexes = []) => {
  if (db.objectStoreNames.contains(name)) return
  const store = db.createObjectStore(name, { keyPath: 'id' })
  indexes.forEach(index => store.createIndex(index, index, { unique: false }))
}

export const initializeCanonicalStorage = async () => {
  if (isInitialized && dbInstance) return dbInstance
  if (initializationPromise) return initializationPromise
  initializationPromise = (async () => { const db = await openCanonicalDB(); isInitialized = true; return db })()
  try { return await initializationPromise } catch (error) { isInitialized = false; throw error } finally { initializationPromise = null }
}

export const getLastOdometer = async () => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const request = db.transaction('shifts', 'readonly').objectStore('shifts').getAll()
    request.onsuccess = () => { const shifts = request.result || []; const completed = shifts.filter(s => s.status === 'COMPLETED').sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt)); resolve(completed.length ? Number(completed[0].endOdometer) || 0 : 0) }
    request.onerror = () => reject(request.error || new Error('Failed to read odometer history.'))
  })
}

export { CANONICAL_DB_NAME, CANONICAL_DB_VERSION, CANONICAL_DB_CHANGE_EVENT, CANONICAL_DB_CHANNEL }
