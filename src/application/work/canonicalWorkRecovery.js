/**
 * Reconcile the PWA cache with Android's durable canonical SQLite snapshot.
 *
 * PWA commands own shift start/end; native overlay commands own trip execution and
 * fare/cancellation while the WebView is unavailable. Both write paths converge
 * through this durable record boundary. Existing canonical records are authoritative
 * regardless of local updatedAt: a PWA timestamp cannot prove that a full-record
 * snapshot includes a later native overlay transition. Promote a local record only
 * when native has no record for that ID (for example, an interrupted first mirror),
 * then re-read SQLite and converge IndexedDB to it.
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
 * SQLite is the durable cross-surface record authority, not permission for the
 * native overlay to start/end shifts. PWA-originated shift lifecycle writes and
 * native trip/fare/cancellation writes are reconciled with the same stale-snapshot
 * rule. Local-only records may be promoted to recover an interrupted first write,
 * but a newer local updatedAt is never sufficient to replace an existing canonical
 * record. Only a fresh native snapshot is copied back to IndexedDB.
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
