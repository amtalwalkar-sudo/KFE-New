import { FuelRepository } from '../../repositories/fuelRepository.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { calculateFuelQuantityKg } from '../../domain/math/fuel.js'

export const CalculationsService = Object.freeze({
  referenceNow() { return getKfeReferenceNow() },
  reportingRange(period, now = getKfeReferenceNow()) { return reportingRangeFor(period, now) },
  fuelQuantityKg(amount, pricePerKg) { return calculateFuelQuantityKg(amount, pricePerKg) },
  async recordFuelBaseline({ odometer, pricePerKg, amount, isFullTank = true }) {
    const values = { odometer: Number(odometer), pricePerKg: Number(pricePerKg), amount: Number(amount) }
    if (!Object.values(values).every(Number.isFinite) || values.odometer < 0 || values.amount <= 0 || values.pricePerKg <= 0) {
      throw new Error('Odometer, price/kg and amount are required.')
    }
    return FuelRepository.create({
      ...values,
      quantityKg: calculateFuelQuantityKg(values.amount, values.pricePerKg),
      isFullTank: Boolean(isFullTank),
      capturedAt: getKfeReferenceNow().toISOString(),
      provenance: 'MANUAL_CALCULATION_INPUT',
    })
  },
})
