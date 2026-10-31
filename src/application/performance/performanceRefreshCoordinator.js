/**
 * Serializes refreshes while coalescing any number of change notifications
 * received during an active read into one follow-up read.
 */
export const createCoalescedRefresh = refresh => {
  if (typeof refresh !== 'function') throw new TypeError('A refresh callback is required.')
  let active = null
  let pending = false
  let disposed = false

  const request = () => {
    if (disposed) return Promise.resolve()
    if (active) {
      pending = true
      return active
    }
    active = (async () => {
      do {
        pending = false
        await refresh()
      } while (pending && !disposed)
    })().finally(() => {
      active = null
      if (pending && !disposed) void request()
    })
    return active
  }

  return Object.freeze({
    request,
    dispose() {
      disposed = true
      pending = false
    },
  })
}
