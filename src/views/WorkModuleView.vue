<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'

const store = useShiftTripStore()
const fuelStore = useFuelStore()
const startOdo = ref('')
const gapPersonal = ref(0)
const personalToll = ref('')
const personalParking = ref('')
const selectedOperator = ref('')
const closingOdo = ref('')
const toll = ref('')
const parking = ref('')
const tollTreatment = ref('NONE')
const reviewTrips = ref(false)
const cancelPanel = ref(false)
const cancelReason = ref('DRIVER_MISTAKE')
const cancelledRevenue = ref('')
const fuelFormOpen = ref(false)
const fuelOdometer = ref('')
const fuelPrice = ref('')
const fuelAmount = ref('')
const message = ref('')
const error = ref('')
const clock = ref(Date.now())
const swipeStartX = ref(null)
const swipeTracking = ref(false)
const swipeOffset = ref(0)
let interval

const gap = computed(() => store.calculateGap(startOdo.value))
const gapKm = computed(() => Number(gap.value?.gapKm || 0))
const gapDead = computed(() => Math.max(0, gapKm.value - Number(gapPersonal.value || 0)))
const allocatedGap = computed(() => Number(gapPersonal.value || 0) + gapDead.value)
const fuelQuantity = computed(() => fuelStore.calculateQuantity(fuelPrice.value, fuelAmount.value))
const tripTimer = computed(() => {
  if (!store.trip?.tripStartAt) return '00:00:00'
  const seconds = Math.max(0, Math.floor((clock.value - Date.parse(store.trip.tripStartAt)) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
const locationEventLabel = eventType => ({ ONLINE: 'Online', OFFLINE: 'Offline', START: 'Trip start', END: 'Trip end', CANCELLED: 'Trip cancelled' }[eventType] || eventType || 'Location')
const locationPlace = location => location?.placeName || (Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude)) ? `${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}` : 'Location unavailable')
const locationTime = location => location?.capturedAt ? new Date(location.capturedAt).toLocaleString() : 'Time unavailable'
const notify = text => { message.value = text; error.value = ''; window.setTimeout(() => { if (message.value === text) message.value = '' }, 2200) }
const fail = text => { error.value = text; message.value = '' }

const adjustGapAllocation = (category, amount) => {
  if (!gap.value.valid || gapKm.value <= 0) return
  const current = Number(gapPersonal.value || 0)
  if (category === 'PERSONAL') gapPersonal.value = Math.min(gapKm.value, Math.max(0, current + amount))
  else gapPersonal.value = Math.max(0, Math.min(gapKm.value, current - amount))
}
const goOnline = async () => {
  const needsGap = gap.value.valid && gapKm.value > 0
  const result = await store.startShift(startOdo.value, needsGap ? { personalKm: gapPersonal.value, deadKm: gapDead.value, personalToll: personalToll.value, personalParking: personalParking.value } : null)
  if (result.requiresGapAllocation) return fail(`Allocate exactly ${result.gapKm} km as Personal or Dead KM before going Online.`)
  if (!result.ok) return fail(result.reason)
  startOdo.value = ''; gapPersonal.value = 0; personalToll.value = ''; personalParking.value = ''; notify('Online.')
}
const goOffline = async (confirmLargeDistance = false) => {
  const trips = reviewTrips.value ? store.completedTrips.map(t => ({ id: t.id, operator: t.operator, tripKm: t.tripKm ?? '', revenue: t.revenue ?? '' })) : []
  const result = await store.endShift({ closingOdometer: closingOdo.value, toll: toll.value, parking: parking.value, tollParkingRevenueTreatment: tollTreatment.value, trips, confirmLargeDistance })
  if (result.requiresConfirmation) {
    const confirmed = window.confirm(`⚠️ Closing odometer shows ${result.distanceKm} km for this shift. This is above the 500 km/day safety threshold. If the odometer is correct, confirm to end the Shift.`)
    if (!confirmed) return
    return goOffline(true)
  }
  if (!result.ok) return fail(result.reason)
  closingOdo.value = ''; toll.value = ''; parking.value = ''; tollTreatment.value = 'NONE'; reviewTrips.value = false; notify('Offline.')
}
const toggleOnline = async () => {
  if (store.isTripActive) return fail('End the active Trip before going Offline.')
  return store.isOnline ? goOffline() : goOnline()
}
const startTrip = async () => {
  const result = await store.startTrip(selectedOperator.value || store.defaultOperator)
  if (!result.ok) return fail(result.reason)
  selectedOperator.value = result.trip.operator
  notify('Trip started.')
}
const endTrip = async () => { if (await store.endTrip()) notify('Trip completed.') }
const cancelAccidentalTrip = async () => {
  if (!confirm('Cancel this accidental trip? It will be recorded as a cancelled driver-mistake trip.')) return
  if (await store.cancelTrip({ reason: 'DRIVER_MISTAKE' })) notify('Accidental trip cancelled.')
}
const cancelTripWithRevenue = async () => {
  if (!confirm('Record this trip as cancelled? Optional revenue will be retained if entered.')) return
  if (await store.cancelTrip({ reason: cancelReason.value, revenue: cancelledRevenue.value })) { cancelledRevenue.value = ''; cancelPanel.value = false; notify('Cancelled trip recorded.') }
}
const saveFuel = async () => {
  const result = await fuelStore.save({ odometer: fuelOdometer.value, pricePerKg: fuelPrice.value, amount: fuelAmount.value })
  if (!result.ok) return fail(result.reason)
  fuelOdometer.value = ''; fuelPrice.value = ''; fuelAmount.value = ''; fuelFormOpen.value = false
  notify(`Refuelling recorded: ${result.record.quantityKg.toFixed(2)} kg.`)
}
const primaryTripAction = () => store.isTripActive ? endTrip() : startTrip()
const tripActionLabel = computed(() => store.isTripActive ? 'SWIPE → END TRIP' : 'SWIPE → START TRIP')
const tripActionHint = computed(() => store.isTripActive ? 'Swipe from left to right to end this trip' : 'Swipe from left to right to start this trip')
const swipeStyle = computed(() => ({ transform: `translateX(${swipeOffset.value}px)` }))
const onSwipeStart = event => { if (event.pointerType === 'mouse' && event.button !== 0) return; swipeStartX.value = event.clientX; swipeTracking.value = true; swipeOffset.value = 0; event.currentTarget.setPointerCapture?.(event.pointerId) }
const onSwipeMove = event => { if (!swipeTracking.value || swipeStartX.value == null) return; swipeOffset.value = Math.max(0, Math.min(event.clientX - swipeStartX.value, 120)) }
const onSwipeEnd = async event => { if (!swipeTracking.value || swipeStartX.value == null) return; const distance = event.clientX - swipeStartX.value; swipeTracking.value = false; swipeStartX.value = null; swipeOffset.value = 0; if (distance >= 80) await primaryTripAction() }
const onSwipeCancel = () => { swipeTracking.value = false; swipeStartX.value = null; swipeOffset.value = 0 }
const onSwipeKey = async event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); await primaryTripAction() } }

onMounted(async () => { await store.initialize(); await fuelStore.refresh(); startOdo.value = store.lastKnownOdometer ?? ''; selectedOperator.value = store.defaultOperator; interval = window.setInterval(() => { clock.value = Date.now() }, 1000) })
onUnmounted(() => window.clearInterval(interval))
</script>

<template>
  <div class="cockpit">
    <header class="hero"><div><small>KFE WORK</small><h1>Driver Cockpit</h1></div><div class="online-control"><span>OFFLINE</span><button class="online-toggle" :class="{active:store.isOnline}" :disabled="store.isTripActive" role="switch" :aria-checked="store.isOnline" :aria-label="store.isOnline ? 'Go Offline' : 'Go Online'" @click="toggleOnline"><span/></button><span>ONLINE</span></div></header>
    <div v-if="message" class="message">{{ message }}</div><div v-if="error" class="error">{{ error }}</div>
    <section class="card state"><div><span>Shift</span><strong>{{ store.isOnline ? 'Active' : 'Ready' }}</strong></div><div><span>Financial Day</span><strong>{{ store.isFinancialDayActive ? 'Active' : 'Not active' }}</strong></div></section>

    <section v-if="!store.isOnline" class="card gate"><h2>Start Shift</h2><p class="muted">The Online toggle opens this gate. The shift starts only after the odometer check succeeds.</p><label>Current odometer (km)<input v-model="startOdo" type="number" min="0" inputmode="decimal"></label><div v-if="gap.valid && gapKm > 0" class="gap"><strong>Odometer gap: {{ gapKm }} km</strong><p>ERP calculates the gap. Just allocate it between Personal and Dead KM.</p><div class="allocation-summary"><div><span>Personal KM</span><strong>{{ gapPersonal }}</strong></div><div><span>Dead KM</span><strong>{{ gapDead }}</strong></div></div><div class="allocation-actions"><button type="button" @click="adjustGapAllocation('PERSONAL', 10)">Personal +10 km</button><button type="button" @click="adjustGapAllocation('DEAD', 10)">Dead +10 km</button><button type="button" @click="adjustGapAllocation('PERSONAL', 1)">Personal +1 km</button><button type="button" @click="adjustGapAllocation('DEAD', 1)">Dead +1 km</button></div><small>Allocated {{ allocatedGap }} / {{ gapKm }} km. Every click transfers km between the two categories.</small><div class="two"><label>Personal toll (optional)<input v-model="personalToll" type="number" min="0" step="0.01"></label><label>Personal parking (optional)<input v-model="personalParking" type="number" min="0" step="0.01"></label></div></div><p v-else-if="gap.valid" class="muted">No odometer gap.</p><p v-else-if="startOdo" class="error-text">{{ gap.reason }}</p></section>

    <section v-else-if="!store.isTripActive" class="card gate"><h2>Start Trip</h2><div class="current-operator"><span>Operator for this trip</span><strong>{{ selectedOperator || store.defaultOperator }}</strong></div><p class="muted">Check this before every ride. The selected operator carries forward until changed.</p><div class="operators"><button v-for="operator in store.operators" :key="operator" :class="{selected:(selectedOperator || store.defaultOperator)===operator}" @click="selectedOperator=operator">{{ operator }}</button></div></section>

    <section v-if="store.isTripActive" class="card trip"><small>TRIP ACTIVE</small><h2>{{ store.trip.operator }}</h2><div class="timer">{{ tripTimer }}</div><button class="quiet" @click="cancelAccidentalTrip">Cancel accidental trip</button><button class="secondary" @click="cancelPanel=!cancelPanel">Record cancelled trip / revenue</button><div v-if="cancelPanel" class="cancel-panel"><label>Cancellation reason<select v-model="cancelReason"><option value="DRIVER_MISTAKE">Driver mistake</option><option value="OPERATOR_CANCELLED">Operator cancelled</option><option value="CUSTOMER_CANCELLED">Customer cancelled</option></select></label><label>Revenue if applicable (optional)<input v-model="cancelledRevenue" type="number" min="0" step="0.01"></label><button class="danger" @click="cancelTripWithRevenue">Record cancellation</button></div></section>

    <section v-if="store.lifecycleLocations.length" class="card locations"><div class="section-heading"><div><small>SHIFT GPS</small><h2>Location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.lifecycleLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{ locationEventLabel(location.eventType) }}</strong><span>{{ locationPlace(location) }}</span><small>{{ locationTime(location) }}</small></div></div></section>
    <section v-if="store.tripLocations.length" class="card locations"><div class="section-heading"><div><small>TRIP GPS</small><h2>Trip location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.tripLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{ locationEventLabel(location.eventType) }}</strong><span>{{ locationPlace(location) }}</span><small>{{ locationTime(location) }}</small></div></div></section>

    <section v-if="store.isOnline && !store.isTripActive" class="card gate"><h2>CNG Refuelling</h2><p class="muted">ERP calculates quantity from amount ÷ price per kg. GPS and timestamp are captured automatically when available.</p><button class="secondary" @click="fuelFormOpen=!fuelFormOpen">{{ fuelFormOpen ? 'Hide fuel form' : 'Add refuelling' }}</button><div v-if="fuelFormOpen" class="fuel-form"><label>Odometer (km)<input v-model="fuelOdometer" type="number" min="0"></label><label>Price per kg (₹)<input v-model="fuelPrice" type="number" min="0" step="0.01"></label><label>Amount (₹)<input v-model="fuelAmount" type="number" min="0" step="0.01"></label><div class="calculated"><span>ERP-calculated quantity</span><strong>{{ fuelQuantity.toFixed(2) }} kg</strong></div><button class="primary" :disabled="fuelStore.saving" @click="saveFuel">{{ fuelStore.saving ? 'Saving…' : 'Save refuelling' }}</button></div></section>

    <section v-if="store.isOnline && !store.isTripActive" class="card gate"><h2>End Shift</h2><p class="muted">Closing odometer is required. Enter the shift-end revenue here through the existing Shift End flow.</p><label>Closing odometer (km)<input v-model="closingOdo" type="number" min="0"></label><div class="two"><label>Business toll (optional)<input v-model="toll" type="number" min="0" step="0.01"></label><label>Business parking (optional)<input v-model="parking" type="number" min="0" step="0.01"></label></div><label v-if="Number(toll||0)>0 || Number(parking||0)>0">Business toll/parking treatment<select v-model="tollTreatment"><option value="NONE">None</option><option value="INCLUDED">Included in revenue/fare</option><option value="EXCLUDED">Excluded from revenue/fare</option></select></label><button class="secondary" @click="reviewTrips=!reviewTrips">{{ reviewTrips ? 'Hide optional trip review' : 'Optional trip review / correction' }}</button><div v-if="reviewTrips" class="reviews"><p v-if="!store.completedTrips.length" class="muted">No completed trips.</p><div v-for="t in store.completedTrips" :key="t.id" class="review"><select v-model="t.operator"><option v-for="operator in store.operators" :key="operator">{{ operator }}</option></select><input v-model="t.tripKm" type="number" min="0" step="0.1" placeholder="KM optional"><input v-model="t.revenue" type="number" min="0" step="0.01" placeholder="₹ optional"></div></div></section>

    <div v-if="store.isOnline" class="action-reserve"></div><div v-if="store.isOnline" class="persistent-action"><div class="swipe-bar trip-action" :style="swipeStyle" role="button" tabindex="0" aria-label="Swipe from left to right to start or end the current trip" @pointerdown="onSwipeStart" @pointermove="onSwipeMove" @pointerup="onSwipeEnd" @pointercancel="onSwipeCancel" @pointerleave="onSwipeEnd" @keydown="onSwipeKey"><span>→</span><span>{{ tripActionLabel }}</span></div><small class="swipe-hint">{{ tripActionHint }}</small></div>
  </div>
</template>

<style scoped>
.cockpit{max-width:600px;margin:auto;padding:16px 16px 142px;color:#0f172a}.hero{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.hero small{font-size:.65rem;font-weight:900;color:#64748b;letter-spacing:.12em}.hero h1{margin:2px 0;font-size:1.45rem}.online-control{display:flex;align-items:center;gap:5px}.online-control span{font-size:.55rem;font-weight:900;color:#64748b}.online-toggle{width:48px;height:28px;border:0;border-radius:20px;background:#cbd5e1;padding:3px;cursor:pointer}.online-toggle:disabled{opacity:.55}.online-toggle span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s}.online-toggle.active{background:#16a34a}.online-toggle.active span{transform:translateX(20px)}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 2px rgba(15,23,42,.05)}.state{display:flex;justify-content:space-between}.state div{display:flex;flex-direction:column;gap:3px}.state span,.muted{font-size:.75rem;color:#64748b}.gate h2{margin:0 0 5px;font-size:1rem}.gate label{display:block;font-size:.76rem;font-weight:800;margin:11px 0}.gate input,.gate select,.review input,.review select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;margin-top:5px;font:inherit}.secondary,.quiet,.primary,.danger{width:100%;padding:13px;border:0;border-radius:9px;font-weight:900;margin-top:12px}.secondary{background:#e2e8f0;color:#1e293b}.quiet{background:transparent;color:#64748b}.primary{background:#111827;color:#fff}.danger{background:#dc2626;color:#fff}.gap{background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:12px}.current-operator{display:flex;justify-content:space-between;padding:12px;background:#f1f5f9;border-radius:10px}.operators{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.operators button{padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-weight:800}.operators button.selected{border:2px solid #111827}.trip{text-align:center}.timer{font:700 2rem ui-monospace,SFMono-Regular,Menlo,monospace;margin:14px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.review{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px}.review input,.review select{font-size:.7rem;padding:8px}.message,.error{padding:10px 12px;border-radius:9px;margin-bottom:12px;font-size:.8rem}.message{background:#dcfce7;color:#166534}.error{background:#fee2e2;color:#991b1b}.error-text{color:#991b1b}.fuel-form{margin-top:8px}.calculated{display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f1f5f9;border-radius:10px;margin-top:12px;font-size:.75rem}.calculated strong{font-size:1rem}.cancel-panel{margin-top:8px;text-align:left}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.section-heading small{font-size:.62rem;font-weight:900;color:#64748b;letter-spacing:.1em}.section-heading h2{margin:2px 0 0;font-size:1rem}.optional-badge{font-size:.6rem;font-weight:900;color:#64748b;background:#f1f5f9;border-radius:999px;padding:5px 8px}.location-row{display:flex;gap:10px;padding:10px 0;border-top:1px solid #e2e8f0}.location-detail{min-width:0;display:flex;flex-direction:column;gap:2px}.location-detail strong{font-size:.78rem}.location-detail span{font-size:.8rem;font-weight:700;overflow-wrap:anywhere}.location-detail small{font-size:.67rem;color:#64748b}.allocation-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.allocation-summary div{display:flex;flex-direction:column;gap:3px;padding:10px;background:#fff;border:1px solid #fed7aa;border-radius:8px}.allocation-summary span{font-size:.65rem;color:#64748b}.allocation-summary strong{font-size:1.1rem}.allocation-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.allocation-actions button{padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-weight:850}.action-reserve{height:64px}.persistent-action{position:fixed;left:0;right:0;bottom:60px;height:64px;padding:5px 12px 4px;box-sizing:border-box;background:rgba(248,250,252,.98);border-top:1px solid #e2e8f0;z-index:9998}.swipe-bar{width:100%;height:42px;border-radius:12px;background:#dc2626;color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;user-select:none;touch-action:pan-y;transition:transform .16s;cursor:grab}.swipe-hint{display:block;text-align:center;color:#64748b;font-size:.62rem;margin-top:2px}@media(max-width:380px){.two,.review,.allocation-actions{grid-template-columns:1fr}}
</style>
