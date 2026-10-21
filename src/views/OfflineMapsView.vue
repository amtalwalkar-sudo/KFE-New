<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { OfflineMapService } from '../infrastructure/location/offlineMapService.js'

const regionIds = ['mumbai-metro', 'pune', 'nashik']
const regions = ref([])
const busyRegion = ref('')
const progress = ref({})
const error = ref('')
const notice = ref('')
const loading = ref(true)
const listeners = []
const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const formatBytes = value => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = bytes / 1024, unit = 0
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++ }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[unit]}`
}
const regionLabel = id => ({ 'mumbai-metro': 'Mumbai metro', pune: 'Pune', nashik: 'Nashik' }[id] || id)
const installedCount = computed(() => regions.value.filter(x => x.status?.installed).length)

async function refresh() {
  loading.value = true
  error.value = ''
  regions.value = regionIds.map(regionId => ({
    regionId,
    status: null,
    region: regionLabel(regionId),
    checking: true
  }))
  try {
    // Native status uses a shared temporary manifest file, so serialize these
    // checks to avoid concurrent calls racing while reading/deleting it.
    for (const regionId of regionIds) {
      let item
      try {
        item = { regionId, status: await OfflineMapService.status(regionId) }
      } catch (e) {
        item = { regionId, status: null, error: e?.message || 'Status unavailable' }
      }
      const status = item.status
      regions.value = regions.value.map(current => current.regionId === regionId ? ({
        ...item,
        region: status?.region || status?.availableRegions?.find(x => x.regionId === regionId)?.region || regionLabel(regionId),
        checking: false
      }) : current)
    }
  } catch (e) {
    error.value = e?.message || 'Could not read offline map status.'
  } finally { loading.value = false }
}

async function download(region) {
  if (!isAndroid) {
    error.value = 'Map downloads require the installed Android KFE app.'
    return
  }
  if (!region.status?.manifestAvailable) {
    error.value = region.status?.manifestError || 'The regional package catalog is unavailable. Connect to the internet, then tap Refresh status and try again.'
    return
  }
  if (Number(region.status.bytesAvailable) < Number(region.status.bytesRequiredForUpdate)) {
    error.value = `Not enough free storage for ${region.region}. Free space required: ${formatBytes(region.status.bytesRequiredForUpdate)}.`
    return
  }
  error.value = ''
  notice.value = ''
  busyRegion.value = region.regionId
  progress.value[region.regionId] = 0
  try {
    await OfflineMapService.downloadUpdate(region.regionId)
    notice.value = `Download started for ${region.region}. Keep KFE open until verification finishes.`
  } catch (e) {
    error.value = e?.message || 'The offline map download could not start.'
    busyRegion.value = ''
  }
}

async function remove(region) {
  if (!region.status?.installed || busyRegion.value) return
  if (!confirm(`Remove the downloaded ${region.region} routing package from this phone?`)) return
  error.value = ''
  notice.value = ''
  busyRegion.value = region.regionId
  try {
    await OfflineMapService.remove(region.regionId)
    notice.value = `${region.region} offline routing package removed.`
    await refresh()
  } catch (e) { error.value = e?.message || 'Could not remove the offline map package.' }
  finally { busyRegion.value = '' }
}

onMounted(async () => {
  listeners.push(await OfflineMapService.addListener('downloadProgress', event => {
    const id = event?.regionId
    if (id) progress.value[id] = Math.max(0, Math.min(99, Number(event?.percent) || 0))
  }))
  listeners.push(await OfflineMapService.addListener('downloadComplete', async event => {
    const id = event?.regionId || busyRegion.value
    if (id) progress.value[id] = 100
    busyRegion.value = ''
    notice.value = `${event?.region || regionLabel(id)} downloaded, verified, and installed (version ${event?.version || 'latest'}).`
    await refresh()
  }))
  listeners.push(await OfflineMapService.addListener('downloadFailed', async event => {
    busyRegion.value = ''
    error.value = event?.message || 'Offline map download failed. The previous installed package, if any, was retained.'
    await refresh()
  }))
  await refresh()
})
onUnmounted(async () => { for (const handle of listeners) await handle?.remove?.() })
</script>

<template>
  <main class="offline-maps-page">
    <header class="page-head">
      <span class="eyebrow">OFFLINE ROUTING</span>
      <h1>Offline Maps</h1>
      <p>Download regional Valhalla road-routing data to this phone. Downloaded packages remain in KFE's private app storage and are available after restart.</p>
      <div class="summary" role="status">{{ installedCount }} of {{ regionIds.length }} regions downloaded</div>
    </header>

    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <p v-if="notice" class="alert notice" role="status">{{ notice }}</p>
    <p v-if="!isAndroid" class="alert notice">Map downloads and local routing require the installed Android KFE app. This screen cannot install native route tiles in a browser.</p>

    <div v-if="loading" class="loading" aria-live="polite">Checking package catalog and phone storage…</div>
    <section v-for="region in regions" :key="region.regionId" class="region-card">
      <div class="region-head">
        <div>
          <h2>{{ region.region }}</h2>
          <p class="sub">{{ region.regionId }}</p>
        </div>
        <span class="status" :class="{ ready: region.status?.installed }">{{ region.status?.installed ? (region.status?.manifestAvailable && region.status?.latestVersion !== region.status?.installedVersion ? 'Update available' : 'Downloaded') : 'Not downloaded' }}</span>
      </div>

      <div class="facts">
        <div><span>Package size</span><strong>{{ formatBytes(region.status?.bytesRequired) }}</strong></div>
        <div><span>Free phone storage</span><strong>{{ formatBytes(region.status?.bytesAvailable) }}</strong></div>
        <div><span>Required free space</span><strong>{{ formatBytes(region.status?.bytesRequiredForUpdate) }}</strong></div>
        <div><span>Installed version</span><strong>{{ region.status?.installed ? (region.status.installedVersion || 'Unknown') : '—' }}</strong></div>
        <div><span>Latest version</span><strong>{{ region.status?.latestVersion || 'Unavailable' }}</strong></div>
      </div>

      <p v-if="region.status?.installed" class="installed-note">Saved locally · {{ formatBytes(region.status.bytesInstalled) }} · installed {{ region.status.installedAt || 'date unavailable' }}</p>
      <p v-if="region.checking" class="sub" role="status">Checking package catalog and phone storage…</p>
      <p v-if="region.error" class="sub">{{ region.error }}. Refresh status to retry.</p>
      <p v-if="region.status?.manifestError" class="sub">Package catalog unavailable: {{ region.status.manifestError }}. The download button remains available to explain the issue; refresh after reconnecting.</p>
      <p v-if="region.status?.manifestAvailable && Number(region.status?.bytesAvailable) < Number(region.status?.bytesRequiredForUpdate)" class="sub storage-warning">Not enough free space for a safe download/update. Free up at least {{ formatBytes(Number(region.status.bytesRequiredForUpdate) - Number(region.status.bytesAvailable)) }} and refresh.</p>
      <p v-if="region.status?.installed && region.status?.latestVersion === region.status?.installedVersion" class="sub">This package is up to date.</p>

      <div v-if="busyRegion === region.regionId" class="progress-wrap" role="status" :aria-label="`Downloading ${region.region}`">
        <div class="progress-track"><div class="progress-fill" :style="{ width: `${progress[region.regionId] || 0}%` }"></div></div>
        <span>{{ progress[region.regionId] || 0 }}% downloaded · verifying package before installation</span>
      </div>

      <div class="actions">
        <button class="primary" :disabled="region.checking || !region.status || !!busyRegion || (region.status?.manifestAvailable && Number(region.status?.bytesAvailable) < Number(region.status?.bytesRequiredForUpdate)) || (region.status?.installed && region.status?.manifestAvailable && region.status?.installedVersion === region.status?.latestVersion)" @click="download(region)">
          {{ region.status?.installed ? (region.status?.manifestAvailable && region.status?.installedVersion === region.status?.latestVersion ? 'Already downloaded' : 'Update offline map') : 'Download offline map' }}
        </button>
        <button v-if="region.status?.installed" class="secondary" :disabled="!!busyRegion" @click="remove(region)">Remove download</button>
      </div>
    </section>

    <footer class="footnote">
      <strong>How this works</strong>
      <p>Each region is stored separately. KFE verifies the package size and SHA-256 checksum before activating it. Failed or interrupted updates do not replace a valid installed package. Offline route matching uses the downloaded region that covers the GPS trace.</p>
      <p>Map data © OpenStreetMap contributors. Regional coverage is limited to the published boundaries.</p>
      <button class="secondary refresh" :disabled="loading || !!busyRegion" @click="refresh">Refresh status</button>
    </footer>
  </main>
</template>
