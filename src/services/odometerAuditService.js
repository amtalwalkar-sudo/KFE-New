import { OdoGapRepository } from '../repositories/odoGapRepository'

const UNEXPLAINED_DISCREPANCY = 'UNEXPLAINED_DISCREPANCY'

export const OdometerAuditService = {
  async auditShiftBoundary(previousOdometer, newShiftStartOdometer) {
    const previous = Number(previousOdometer)
    const current = Number(newShiftStartOdometer)

    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current <= previous) {
      return null
    }

    const observation = {
      previousOdometer: previous,
      newOdometer: current,
      gapDistance: current - previous,
      reason: UNEXPLAINED_DISCREPANCY
    }

    try {
      return await OdoGapRepository.create(observation)
    } catch (error) {
      // Audit persistence must never block or invalidate a completed shift.
      console.error('Non-blocking odometer audit persistence failed:', error)
      return null
    }
  }
}
