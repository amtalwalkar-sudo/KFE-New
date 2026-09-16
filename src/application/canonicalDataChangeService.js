import { subscribeCanonicalDataChanges as subscribePersistenceChanges } from '../repositories/canonicalDataChangeRepository.js'

export const subscribeCanonicalDataChanges = callback =>
  subscribePersistenceChanges(callback)
