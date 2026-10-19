<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { OfflineMapService } from '../infrastructure/location/offlineMapService.js'

const regionIds = ['mumbai-metro', 'pune', 'nashik']
const regions = ref([])
const busyRegion = ref('')
const progress = ref({})
const error = ref('')
const notice = ref('')
const loading = ref(true)
const listeners = []
const isAndroid = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

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
  try {
    const result = await Promise.all(regionIds.map(async regionId => {
      try { return { regionId, status: await OfflineMapService.status(regionId) } }
      catch (e) { return { regionId, status: null, error: e?.message || 'Status unavailable' } }
    }))
    regions.value = result.map(item => ({
      ...item,
      region: item.status?.region || item.status?.availableRegions?.find(x => x.regionId === item.regionId)?.region || regionLabel(item.regionId)
    }))
  } catch (e) {
    error.value = e?.message || 'Could not read offline map status.'
  } finally { loading.value = false }
}

async function download(region) {
  if (!region.status?.manifestAvailable) {
    error.value = region.status?.manifestError || 'Latest package information is unavailable. Connect to the internet and refresh.'
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
        <span class="status" :class="{ ready: region.status?.installed }">{{ region.status?.installed ? 'Downloaded' : 'Not downloaded' }}</span>
      </div>

      <div class="facts">
        <div><span>Package size</span><strong>{{ formatBytes(region.status?.bytesRequired) }}</strong></div>
        <div><span>Free phone storage</span><strong>{{ formatBytes(region.status?.bytesAvailable) }}</strong></div>
        <div><span>Required free space</span><strong>{{ formatBytes(region.status?.bytesRequiredForUpdate) }}</strong></div>
        <div><span>Installed version</span><strong>{{ region.status?.installed ? (region.status.installedVersion || 'Unknown') : '—' }}</strong></div>
        <div><span>Latest version</span><strong>{{ region.status?.latestVersion || 'Unavailable' }}</strong></div>
      </div>

      <p v-if="region.status?.installed" class="installed-note">Saved locally · {{ formatBytes(region.status.bytesInstalled) }} · installed {{ region.status.installedAt || 'date unavailable' }}</p>
      <p v-if="region.status?.manifestError" class="sub">{{ region.status.manifestError }}</p>
      <p v-if="region.status?.installed && region.status?.latestVersion === region.status?.installedVersion" class="sub">This package is up to date.</p>

      <div v-if="busyRegion === region.regionId" class="progress-wrap" role="status" :aria-label="`Downloading ${region.region}`">
        <div class="progress-track"><div class="progress-fill" :style="{ width: `${progress[region.regionId] || 0}%` }"></div></div>
        <span>{{ progress[region.regionId] || 0 }}% downloaded · verifying package before installation</span>
      </div>

      <div class="actions">
        <button class="primary" :disabled="!isAndroid || loading || !!busyRegion || !region.status?.manifestAvailable || Number(region.status?.bytesAvailable) < Number(region.status?.bytesRequiredForUpdate) || (region.status?.installed && region.status?.installedVersion === region.status?.latestVersion)" @click="download(region)">
          {{ region.status?.installed ? 'Update package' : 'Download map' }}
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

<style scoped>
.offline-maps-page{max-width:760px;margin:0 auto;padding:20px 16px 112px;display:grid;gap:14px;color:var(--kfe-ui-text)}
.page-head{display:grid;gap:7px}.eyebrow{font-size:.68rem;letter-spacing:.12em;font-weight:900;color:var(--kfe-accent)}h1{font-size:clamp(1.8rem,7vw,2.25rem);letter-spacing:-.035em;margin:0}h2{font-size:1.05rem;margin:0}.page-head p,.footnote p{margin:0;color:var(--kfe-muted-text);line-height:1.5}.summary{font-weight:800;font-size:.9rem;padding:10px 12px;border-radius:12px;background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border);width:max-content;max-width:100%}
.region-card,.footnote{background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border);border-radius:18px;padding:16px;display:grid;gap:13px;box-shadow:var(--kfe-ui-shadow)}.region-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.sub{font-size:.82rem;color:var(--kfe-muted-text);margin:5px 0 0;overflow-wrap:anywhere}.status{font-size:.72rem;font-weight:900;padding:6px 9px;border-radius:999px;border:1px solid var(--kfe-ui-border);white-space:nowrap}.status.ready{color:var(--kfe-success);border-color:color-mix(in srgb,var(--kfe-success) 45%,var(--kfe-ui-border))}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:9px}.facts div{display:grid;gap:4px;padding:10px;border-radius:12px;background:var(--kfe-ui-bg);min-width:0}.facts span{font-size:.72rem;color:var(--kfe-muted-text)}.facts strong{font-size:.9rem;overflow-wrap:anywhere}.installed-note{font-size:.82rem;margin:0;color:var(--kfe-success);font-weight:700}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.actions button,.refresh{min-height:48px;border-radius:13px;padding:10px 12px;font-weight:900}.primary{border:0;background:var(--kfe-accent);color:var(--kfe-on-accent)}.secondary{border:1px solid var(--kfe-ui-border);background:transparent;color:var(--kfe-ui-text)}button:disabled{opacity:.45}.progress-wrap{display:grid;gap:7px;font-size:.8rem;color:var(--kfe-muted-text)}.progress-track{height:9px;border-radius:99px;overflow:hidden;background:var(--kfe-ui-bg);border:1px solid var(--kfe-ui-border)}.progress-fill{height:100%;background:var(--kfe-accent);transition:width .2s ease}.alert{padding:12px 14px;border-radius:13px;font-weight:700;margin:0;overflow-wrap:anywhere}.error{background:color-mix(in srgb,var(--kfe-danger) 12%,var(--kfe-ui-surface));color:var(--kfe-danger)}.notice{background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border)}.loading{color:var(--kfe-muted-text);padding:10px 2px}.footnote{gap:9px}.refresh{width:100%}@media(max-width:420px){.facts{grid-template-columns:1fr}.actions{grid-template-columns:1fr}.region-card,.footnote{padding:14px}}
</style>
