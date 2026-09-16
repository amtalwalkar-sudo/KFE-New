import { validateFuelEntry } from '../../domain/work/fuel.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { captureWorkLocation } from './locationProvider.js'

export async function recordFuelEntry({ odometer, pricePerKg, amount }) {
  const validation = validateFuelEntry({ odometer, pricePerKg, amount })
  if (!validation.valid) return { ok: false, reason: validation.reason }

  const location = await captureWorkLocation()
  try {
    const record = await FuelRepository.create({
      odometer: validation.odometer,
      pricePerKg: validation.pricePerKg,
      amount: validation.amount,
      quantityKg: validation.quantityKg,
      ...location
    })
    return { ok: true, record }
  } catch (error) {
    return { ok: false, reason: error?.message || 'FUEL_ENTRY_FAILED' }
  }
}
