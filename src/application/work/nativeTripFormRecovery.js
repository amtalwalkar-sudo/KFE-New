export const isAcceptedNativeTripFormOperation = (operation, mode, tripId) => {
  if (!operation || operation.found !== true || operation.status !== 'ACCEPTED' ||
      operation.entityType !== 'TRIP' || operation.entityId !== tripId) return false
  const expectedStatus = mode === 'FARE' ? 'COMPLETED' : mode === 'CANCEL' ? 'CANCELLED' : null
  if (!expectedStatus) return false
  if (operation.command === 'SUBMIT_TRIP_FORM') {
    return operation.outcome?.mode === mode &&
      operation.outcome?.tripId === tripId &&
      operation.outcome?.trip?.status === expectedStatus
  }
  if (operation.command === 'PUT_RECORD') {
    return operation.outcome?.record?.id === tripId &&
      operation.outcome?.record?.status === expectedStatus
  }
  return false
}
