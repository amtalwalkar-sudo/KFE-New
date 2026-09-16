let provider = null

export const configureLocationProvider = nextProvider => {
  if (typeof nextProvider !== 'function') throw new TypeError('Location provider must be a function.')
  provider = nextProvider
}

export const captureWorkLocation = async () => {
  if (!provider) return null
  return provider()
}
