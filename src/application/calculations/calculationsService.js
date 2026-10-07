import { FuelRepository } from '../../repositories/fuelRepository.js'
import { getKfeReferenceNow } from '../../domain/time/ist.js'

export const CalculationsService = Object.freeze({
  async recordFuelBaseline({ odometer, pricePerKg, amount, isFullTank = true }) {
    const values = { odometer: Number(odometer), pricePerKg: Number(pricePerKg), amount: Number(amount) }
    if (!Object.values(values).every(Number.isFinite) || values.amount <= 0 || values.pricePerKg <= 0) {
      throw new Error('Odometer, price/kg and amount are required.')
    }
    return FuelRepository.create({
      ...values,
      quantityKg: values.amount / values.pricePerKg,
      isFullTank: Boolean(isFullTank),
      capturedAt: getKfeReferenceNow().toISOString(),
      provenance: 'MANUAL_CALCULATION_INPUT',
    })
  },
})
