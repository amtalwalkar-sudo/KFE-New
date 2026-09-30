import { describe, expect, it } from 'vitest'
import { calculateMileageAccounting } from '../mileageAccountingService'

const shift = (startOdometer, endOdometer) => ({
  startOdometer,
  endOdometer,
  totalDistance: Number(endOdometer) - Number(startOdometer)
})

const gap = (previousOdometer, newOdometer, category = null) => ({
  previousOdometer,
  newOdometer,
  gapDistance: Number(newOdometer) - Number(previousOdometer),
  category
})

describe('MileageAccountingService', () => {
  it('keeps an odometer gap unclassified until explicitly allocated', () => {
    const metrics = calculateMileageAccounting(
      [shift(1, 2), shift(2, 3), shift(4, 5)],
      [gap(3, 4)]
    )

    expect(metrics.recordedShiftDistance).toBe(3)
    expect(metrics.interShiftDistance).toBe(1)
    expect(metrics.totalVehicleDistance).toBe(4)
    expect(metrics.unclassifiedKm).toBe(1)
    expect(metrics.deadMiles).toBe(0)
    expect(metrics.personalTrips).toBe(0)
    expect(metrics.unclassifiedGapCount).toBe(1)
  })

  it('accounts classified gaps without losing the total vehicle distance', () => {
    const metrics = calculateMileageAccounting(
      [shift(1, 2), shift(2, 3), shift(4, 5)],
      [
        gap(3, 4, 'DEAD_MILES'),
        gap(5, 7, 'PERSONAL_TRIPS')
      ]
    )

    expect(metrics.recordedShiftDistance).toBe(3)
    expect(metrics.interShiftDistance).toBe(3)
    expect(metrics.totalVehicleDistance).toBe(6)
    expect(metrics.deadMiles).toBe(1)
    expect(metrics.personalTrips).toBe(2)
    expect(metrics.unclassifiedKm).toBe(0)
    expect(metrics.reconciledInterShiftDistance).toBe(3)
  })

  it('safely parses numeric strings and ignores invalid distances', () => {
    const metrics = calculateMileageAccounting(
      [{ startOdometer: '1', endOdometer: '4', totalDistance: '3' }],
      [
        { gapDistance: '2', category: 'DEAD_MILES' },
        { gapDistance: '-4', category: 'PERSONAL_TRIPS' },
        { gapDistance: 'invalid', category: null }
      ]
    )

    expect(metrics.recordedShiftDistance).toBe(3)
    expect(metrics.interShiftDistance).toBe(2)
    expect(metrics.totalVehicleDistance).toBe(5)
    expect(metrics.deadMiles).toBe(2)
    expect(metrics.personalTrips).toBe(0)
    expect(metrics.unclassifiedKm).toBe(0)
  })
})
