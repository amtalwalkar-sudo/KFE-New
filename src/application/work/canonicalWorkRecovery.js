const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}
const sameRecord = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
const versionOf = record => {
  const value = Date.parse(record?.updatedAt || '')
  return Number.isFinite(value) ? value : null
}

const reconcileEntity = async (entityType, canonicalRecords, localRecords, mirrorRecord) => {
  const canonicalById = new Map(canonicalRecords.filter(record => record?.id).map(record => [record.id, record]))
  for (const local of localRecords.filter(record => record?.id)) {
    const canonical = canonicalById.get(local.id)
    if (!canonical) {
      await mirrorRecord(entityType, local)
      continue
    }
    const localVersion = versionOf(local)
    const canonicalVersion = versionOf(canonical)
    if (localVersion === null || canonicalVersion === null) {
      if (!sameRecord(local, canonical)) {
        throw new Error(`Canonical recovery conflict for ${entityType}/${local.id}: comparable updatedAt versions are required.`)
      }
      continue
    }
    if (localVersion > canonicalVersion) {
      // This is an unacknowledged local write from an interrupted mirror. Retry
      // it before applying the native snapshot back to IndexedDB.
      await mirrorRecord(entityType, local)
    } else if (localVersion === canonicalVersion && !sameRecord(local, canonical)) {
      throw new Error(`Canonical recovery conflict for ${entityType}/${local.id}: different records share updatedAt.`)
    }
  }
}

/**
 * Reconcile interrupted IndexedDB-first writes without allowing an older native
 * snapshot to erase them. Native canonical records win unless IndexedDB contains
 * a demonstrably newer pending write, which must be acknowledged by native SQLite
 * before any snapshot is copied back to IndexedDB.
 */
export async function recoverCanonicalWorkSnapshot({
  readCanonical,
  readLocal,
  mirrorRecord,
  syncCanonicalRecords,
}) {
  const [canonical, local] = await Promise.all([readCanonical(), readLocal()])
  await reconcileEntity('SHIFT', canonical.shifts.records, local.shifts, mirrorRecord)
  await reconcileEntity('TRIP', canonical.trips.records, local.trips, mirrorRecord)
  const refreshed = await readCanonical()
  await syncCanonicalRecords({ shifts: refreshed.shifts.records, trips: refreshed.trips.records })
  return refreshed
}
