import { validateFuelEntry } from '../../domain/work/fuel.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'

export async function recordFuelEntry({ odometer, pricePerKg, amount, isFullTank = true }) {
  const validation = validateFuelEntry({ odometer, pricePerKg, amount, isFullTank })
  if (!validation.valid) return { ok: false, reason: validation.reason }
  try {
    // GPS is optional enrichment and must never delay the authoritative fuel save.
    // Resolve the vehicle, then commit the validated record immediately without
    // waiting for a location provider, permission prompt, or GPS fix.
    const vehicleId = await ShiftTripRepository.getPrimaryVehicleId()
    if (!vehicleId) return { ok: false, reason: 'PRIMARY_VEHICLE_REQUIRED_FOR_FUEL_ENTRY' }
    const record = await FuelRepository.create({ ...validation, vehicleId })
    return { ok: true, record }
  } catch (error) {
    return { ok: false, reason: error?.message || 'FUEL_ENTRY_FAILED' }
  }
}
