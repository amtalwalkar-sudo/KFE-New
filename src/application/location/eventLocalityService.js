import { LocalityRepository } from '../../repositories/localityRepository.js'
import { resolveLocationNameDetailed } from './locationNameService.js'
import { WorkRuntimePorts } from '../work/workRuntimePorts.js'
import { isValidEventGpsTimestamp } from '../../domain/location/eventGpsPolicy.js'

export const LOCALITY_RESOLUTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const EVENTS = new Set(['PICKUP_START', 'TRIP_START', 'TRIP_END', 'TRIP_CANCELLED'])
const inFlight = new Map()

const validCoordinates = snapshot => {
  const latitude = snapshot?.latitude == null || snapshot.latitude === '' ? NaN : Number(snapshot.latitude)
  const longitude = snapshot?.longitude == null || snapshot.longitude === '' ? NaN : Number(snapshot.longitude)
  const accuracy = snapshot?.accuracy == null || snapshot.accuracy === '' ? NaN : Number(snapshot.accuracy)
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 75
}

export const isEligibleForLocalityResolution = (snapshot, now = Date.now()) => {
  if (!snapshot || !EVENTS.has(snapshot.eventType) || !validCoordinates(snapshot)) return false
  const eventTime = Date.parse(snapshot.eventAt || '')
  return Number.isFinite(eventTime) && eventTime > 0 && eventTime <= now
    && isValidEventGpsTimestamp(snapshot.eventAt, snapshot.capturedAt)
    && now - eventTime <= LOCALITY_RESOLUTION_MAX_AGE_MS
}

export const EventLocalityService = Object.freeze({
  async resolveSnapshot(snapshot, { now = Date.now() } = {}) {
    if (!snapshot?.id || !isEligibleForLocalityResolution(snapshot, now)) {
      return { placeName: null, state: 'NOT_ELIGIBLE' }
    }
    const existing = await LocalityRepository.getBySnapshotId(snapshot.id)
    if (existing?.placeName && existing.eventAt === snapshot.eventAt && existing.capturedAt === snapshot.capturedAt) {
      return { ...existing, state: 'RESOLVED', cacheHit: true }
    }
    // A snapshot ID can be re-used when an earlier invalid/stale fix is replaced.
    // Never reuse its locality label for a different event-time fix.
    if (existing) await LocalityRepository.deleteForSnapshot(snapshot.id)
    if (!WorkRuntimePorts.platform.isOnline()) return { placeName: null, state: 'OFFLINE' }
    if (inFlight.has(snapshot.id)) return inFlight.get(snapshot.id)
    const attempt = (async () => {
      const resolution = await resolveLocationNameDetailed(snapshot)
      if (!resolution?.placeName) return resolution
      const saved = await LocalityRepository.saveResolved({
        snapshotId: snapshot.id,
        placeName: resolution.placeName,
        provider: resolution.provider,
        resolvedAt: new Date().toISOString(),
        eventAt: snapshot.eventAt || null,
        capturedAt: snapshot.capturedAt || null,
      })
      return { ...saved, state: 'RESOLVED', cacheHit: false }
    })().finally(() => inFlight.delete(snapshot.id))
    inFlight.set(snapshot.id, attempt)
    return attempt
  },
  async resolveSnapshots(snapshots = []) {
    const results = []
    // Keep provider traffic predictable and avoid parallel bursts after reconnect.
    for (const snapshot of snapshots) {
      if (!isEligibleForLocalityResolution(snapshot)) continue
      results.push(await this.resolveSnapshot(snapshot))
    }
    return results
  },
  async savedForSnapshots(snapshots = []) {
    return LocalityRepository.forSnapshotIds(snapshots.map(snapshot => snapshot?.id).filter(Boolean))
  },
})
