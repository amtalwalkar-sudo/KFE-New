export const CALCULATION_STATUS = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  INDICATIVE: 'INDICATIVE',
  UNAVAILABLE: 'UNAVAILABLE',
})

export const calculationEvidence = ({ status = CALCULATION_STATUS.UNAVAILABLE, source = null, reason = null, dependencies = {} } = {}) => ({
  status,
  source,
  reason,
  dependencies,
})

export const isAuthoritative = evidence => evidence?.status === CALCULATION_STATUS.AUTHORITATIVE
export const isIndicative = evidence => evidence?.status === CALCULATION_STATUS.INDICATIVE
