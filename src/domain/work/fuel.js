export function calculateFuelQuantity({ pricePerKg, amount }) {
  const price = Number(pricePerKg)
  const total = Number(amount)
  if (!Number.isFinite(price) || price <= 0) return { valid: false, reason: 'PRICE_PER_KG_REQUIRED' }
  if (!Number.isFinite(total) || total < 0) return { valid: false, reason: 'AMOUNT_REQUIRED' }
  return { valid: true, quantityKg: total / price }
}

export function validateFuelEntry({ odometer, pricePerKg, amount, isFullTank = true }) {
  const odo = Number(odometer)
  if (!Number.isFinite(odo) || odo < 0) return { valid: false, reason: 'ODOMETER_REQUIRED' }
  const quantity = calculateFuelQuantity({ pricePerKg, amount })
  if (!quantity.valid) return quantity
  return { valid: true, odometer: odo, pricePerKg: Number(pricePerKg), amount: Number(amount), quantityKg: quantity.quantityKg, isFullTank: isFullTank !== false }
}
