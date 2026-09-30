import { describe, expect, it } from 'vitest'
import { LocationService, deriveBetweenTripGpsState } from '../locationService.js'
import { movementDetectedFromDeviceMotion } from '../activityDetectionService.js'

describe('LocationService GPS state policy', () => {
  it('keeps the four frozen sampling intervals', () => {
    expect(LocationService.getIntervals()).toEqual({ WAITING: 7 * 60 * 1000, TRIP_ACTIVE: 9 * 60 * 1000, BETWEEN_TRIPS_MOVING: 2 * 60 * 1000, BETWEEN_TRIPS_STATIONARY: 6 * 60 * 1000 })
  })
  it('derives moving versus stationary between-trip state from GPS speed', () => {
    expect(deriveBetweenTripGpsState({ speed: 0 })).toBe('BETWEEN_TRIPS_STATIONARY')
    expect(deriveBetweenTripGpsState({ speed: 1.9 })).toBe('BETWEEN_TRIPS_STATIONARY')
    expect(deriveBetweenTripGpsState({ speed: 2.1 })).toBe('BETWEEN_TRIPS_MOVING')
  })
  it('allows explicit lifecycle transitions without making GPS authoritative', () => {
    LocationService.reset()
    LocationService.setState('TRIP_ACTIVE')
    expect(LocationService.getState()).toBe('TRIP_ACTIVE')
    LocationService.setState('BETWEEN_TRIPS_STATIONARY')
    expect(LocationService.getState()).toBe('BETWEEN_TRIPS_STATIONARY')
    LocationService.setState('BETWEEN_TRIPS_MOVING')
    expect(LocationService.getState()).toBe('BETWEEN_TRIPS_MOVING')
    LocationService.setState('WAITING')
    expect(LocationService.getState()).toBe('WAITING')
  })
})

describe('ActivityDetectionService', () => {
  it('treats device motion as a low-power trigger, not a GPS movement measurement', () => {
    expect(movementDetectedFromDeviceMotion({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } })).toBe(false)
    expect(movementDetectedFromDeviceMotion({ accelerationIncludingGravity: { x: 6, y: 0, z: 9.81 } })).toBe(true)
  })
})
