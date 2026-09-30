export function readKfeShellSelection(key) {
  return globalThis.localStorage?.getItem(key) || null
}

export function persistKfeShellSelection(key, value) {
  globalThis.localStorage?.setItem(key, value)
  return value
}
