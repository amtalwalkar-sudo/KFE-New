import { subscribeCanonicalDataChanges as subscribePersistenceChanges } from '../utils/indexedDB.js'

export const subscribeCanonicalDataChanges = callback =>
  subscribePersistenceChanges(callback)
