/**
 * Reconcile the PWA cache with Android's native SQLite authority.
 *
 * Existing records from native SQLite are authoritative regardless of updatedAt:
 * the PWA timestamp only describes the local cache/write timeline and cannot prove
 * that a full-record snapshot includes later native overlay transitions. Promote a
 * local record only when native has no record for that ID (for example, an
 * interrupted first mirror). Then re-read SQLite and converge IndexedDB to it.
 */
const reconcileEntity = async (entityType, canonicalRecords, localRecords, mirrorRecord) => {
  const canonicalIds = new Set(canonicalRecords.filter(record => record?.id).map(record => record.id))
  for (const local of localRecords.filter(record => record?.id)) {
    // Existing native records remain authoritative unless the PWA record carries
    // an explicit durable pending-operation marker. That marker is written before
    // the bridge call, so retrying it is intentional and idempotent—not a guess
    // based on updatedAt. Unmarked stale PWA snapshots are never promoted.
    const hasPendingNativeWrite = Boolean(local?._nativeCanonicalSync?.operationId && local?._nativeCanonicalSync?.fingerprint)
    if (canonicalIds.has(local.id) && !hasPendingNativeWrite) continue
    await mirrorRecord(entityType, local)
  }
}

/**
 * Android native SQLite owns existing shift/trip lifecycle and fare state.
 * Local-only records may be promoted to recover an interrupted first write, but a
 * newer local updatedAt is never sufficient to replace an existing native record.
 * Only a fresh native snapshot is copied back to IndexedDB.
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
