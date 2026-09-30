export function captureCurrentLocation() {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString()
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }
    )
  })
}
