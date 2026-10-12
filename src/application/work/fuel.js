import { validateFuelEntry } from '../../domain/work/fuel.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { captureWorkLocation } from './locationProvider.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'

export async function recordFuelEntry({ odometer, pricePerKg, amount, isFullTank = true }) {
  const validation = validateFuelEntry({ odometer, pricePerKg, amount, isFullTank })
  if (!validation.valid) return { ok: false, reason: validation.reason }
  // GPS is optional enrichment, never a prerequisite for recording a refuel.
  // Some Android/browser location providers can stall while permission or GPS is
  // unavailable; cap the wait and persist the validated entry without coordinates.
  let location = null
  try {
    location = await Promise.race([
      captureWorkLocation(),
      new Promise(resolve => setTimeout(() => resolve(null), 1200))
    ])
  } catch (_) {
    location = null
  }
  try {
    // Persist the validated refuel before optional vehicle-master repair/backfill.
    // A slow IndexedDB vehicle lookup must never leave the driver waiting on Save.
    const record = await FuelRepository.create({ ...validation, ...(location || {}) })
    void ShiftTripRepository.getPrimaryVehicleId()
      .then(vehicleId => vehicleId ? FuelRepository.update(record.id, { vehicleId }) : null)
      .catch(() => {})
    return { ok: true, record }
  } catch (error) {
    return { ok: false, reason: error?.message || 'FUEL_ENTRY_FAILED' }
  }
}
