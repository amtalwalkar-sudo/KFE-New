const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'
const SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'
const CANONICAL_DB_VERSION = 10
const DATA_SOURCE_KEY = 'kfe:active-data-source'
const DATA_SOURCE_CHANGE_EVENT = 'kfe:data-source-changed'
const CANONICAL_DB_CHANGE_EVENT = 'kfe:canonical-data-changed'
const CANONICAL_DB_CHANNEL = 'kfe-canonical-db-changes'

const dbInstances = new Map()
const initializationPromises = new Map()

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

const getActiveSource = () => typeof sessionStorage === 'undefined' ? 'canonical' : (sessionStorage.getItem(DATA_SOURCE_KEY) === 'synthetic' ? 'synthetic' : 'canonical')
const dbNameFor = source => source === 'synthetic' ? SYNTHETIC_DB_NAME : CANONICAL_DB_NAME
const openDatabase = name => new Promise((resolve, reject) => {
  const request = indexedDB.open(name, CANONICAL_DB_VERSION)
  request.onupgradeneeded = e => {
    const db = e.target.result
    if (!db.objectStoreNames.contains('shifts')) { const store = db.createObjectStore('shifts', { keyPath: 'id' }); store.createIndex('shiftEndAt', 'shiftEndAt', { unique: false }) }
    if (!db.objectStoreNames.contains('fuel_logs')) { const store = db.createObjectStore('fuel_logs', { keyPath: 'id' }); store.createIndex('createdAt', 'createdAt', { unique: false }) }
    if (!db.objectStoreNames.contains('odoGaps')) db.createObjectStore('odoGaps', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('pending_mutations')) { const store = db.createObjectStore('pending_mutations', { keyPath: 'id' }); store.createIndex('createdAt', 'createdAt', { unique: false }); store.createIndex('status', 'status', { unique: false }) }
    if (!db.objectStoreNames.contains('days')) { const store = db.createObjectStore('days', { keyPath: 'id' }); store.createIndex('status', 'status', { unique: false }); store.createIndex('dayStartAt', 'dayStartAt', { unique: false }) }
    if (!db.objectStoreNames.contains('trips')) { const store = db.createObjectStore('trips', { keyPath: 'id' }); store.createIndex('dayId', 'dayId', { unique: false }); store.createIndex('shiftId', 'shiftId', { unique: false }); store.createIndex('status', 'status', { unique: false }); store.createIndex('tripStartAt', 'tripStartAt', { unique: false }) }
    if (!db.objectStoreNames.contains('gps_snapshots')) { const store = db.createObjectStore('gps_snapshots', { keyPath: 'id' }); store.createIndex('entityType', 'entityType', { unique: false }); store.createIndex('entityId', 'entityId', { unique: false }); store.createIndex('capturedAt', 'capturedAt', { unique: false }) }
    if (!db.objectStoreNames.contains('movement_artifacts')) { const store = db.createObjectStore('movement_artifacts', { keyPath: 'id' }); store.createIndex('shiftId', 'shiftId', { unique: false }); store.createIndex('generatedAt', 'generatedAt', { unique: false }) }
    createSimpleStore(db, 'vehicles', ['registrationNumber', 'active']); createSimpleStore(db, 'drivers', ['status', 'name'])
    createSimpleStore(db, 'compliance_records', ['vehicleId', 'complianceType', 'validUntil']); createSimpleStore(db, 'maintenance_records', ['vehicleId', 'performedOn'])
    createSimpleStore(db, 'loans', ['status', 'startDate']); createSimpleStore(db, 'loan_payments', ['loanId', 'paidOn', 'status']); createSimpleStore(db, 'prepayments', ['loanId', 'paidOn'])
    createSimpleStore(db, 'driver_targets', ['driverId', 'effectiveFrom', 'active']); createSimpleStore(db, 'break_even_inputs', ['effectiveFrom'])
    createSimpleStore(db, 'settings', ['settingKey', 'updatedAt']); createSimpleStore(db, 'audit_history', ['entityId', 'entityType', 'action', 'createdAt'])
    if (db.objectStoreNames.contains('driver_collected_data')) db.deleteObjectStore('driver_collected_data')
    if (db.objectStoreNames.contains('admin_records')) db.deleteObjectStore('admin_records')
    if (db.objectStoreNames.contains('financial_inputs')) db.deleteObjectStore('financial_inputs')
  }
  request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); dbInstances.delete(name); initializationPromises.delete(name) }; resolve(db) }
  request.onerror = () => reject(request.error || new Error('KFE database could not be opened.'))
})
const initializeDatabase = async name => {
  if (dbInstances.has(name)) return dbInstances.get(name)
  if (initializationPromises.has(name)) return initializationPromises.get(name)
  const promise = openDatabase(name).then(db => { dbInstances.set(name, db); return db }).finally(() => initializationPromises.delete(name))
  initializationPromises.set(name, promise)
  return promise
}
export const setActiveDataSource = source => {
  if (!['canonical','synthetic'].includes(source)) throw new Error('Invalid KFE data source.')
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(DATA_SOURCE_KEY, source)
  for (const db of dbInstances.values()) { try { db.close() } catch (_) {} }
  dbInstances.clear(); initializationPromises.clear()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DATA_SOURCE_CHANGE_EVENT, { detail: { dataSource: source } }))
  return source
}
export const getActiveDataSource = () => getActiveSource()
export const initializeCanonicalStorage = async ({ dataSource } = {}) => initializeDatabase(dbNameFor(dataSource || getActiveSource()))
export const initializeSyntheticStorage = async () => initializeDatabase(SYNTHETIC_DB_NAME)
export const openCanonicalDB = () => initializeCanonicalStorage({ dataSource: 'canonical' })

export const getLastOdometer = async () => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const request = db.transaction('shifts', 'readonly').objectStore('shifts').getAll()
    request.onsuccess = () => { const shifts = request.result || []; const completed = shifts.filter(s => s.status === 'COMPLETED').sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt)); resolve(completed.length ? Number(completed[0].endOdometer) || 0 : 0) }
    request.onerror = () => reject(request.error || new Error('Failed to read odometer history.'))
  })
}

export { CANONICAL_DB_NAME, SYNTHETIC_DB_NAME, CANONICAL_DB_VERSION, CANONICAL_DB_CHANGE_EVENT, CANONICAL_DB_CHANNEL, DATA_SOURCE_KEY, DATA_SOURCE_CHANGE_EVENT }
