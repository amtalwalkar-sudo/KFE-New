import { validateFuelEntry } from '../../domain/work/fuel.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { captureWorkLocation } from './locationProvider.js'

export async function recordFuelEntry({ odometer, pricePerKg, amount, isFullTank = true }) {
  const validation = validateFuelEntry({ odometer, pricePerKg, amount, isFullTank })
  if (!validation.valid) return { ok: false, reason: validation.reason }
  const location = await captureWorkLocation()
  try {
    const record = await FuelRepository.create({ ...validation, ...location })
    return { ok: true, record }
  } catch (error) {
    return { ok: false, reason: error?.message || 'FUEL_ENTRY_FAILED' }
  }
}
