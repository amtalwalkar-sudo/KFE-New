<script setup>
import { ref, computed } from 'vue'
import { useWorkCycleStore } from '../stores/workCycle'

const emit = defineEmits(['close', 'shift-closed'])
const store = useWorkCycleStore()

// State flags
const isSubmitting = ref(false)
const submitError = ref('')
const isRevenueManuallyEdited = ref(false)

// Safe fallback for initial odometer initialization
const endOdometer = ref(
  store.lastKnownOdometer && store.lastKnownOdometer >= store.onlineStartOdometer
    ? store.lastKnownOdometer
    : store.onlineStartOdometer || 0
)

const finalRevenue = ref(store.currentShiftIncrementalRevenue || 0)
const showTripEditModal = ref(false)
const selectedTrip = ref(null)

const onRevenueInput = () => {
  isRevenueManuallyEdited.value = true
}

// 1. Calculated Distance Metrics
const totalShiftKm = computed(() => {
  const end = Number(endOdometer.value) || 0
  const start = store.onlineStartOdometer || 0
  return Math.max(0, end - start)
})

const totalBusinessKm = computed(() => {
  return (store.currentShiftTrips || []).reduce(
    (acc, trip) => acc + (Number(trip.estimatedDistanceKm) || 0),
    0
  )
})

const calculatedDeadMiles = computed(() => {
  return Math.max(0, totalShiftKm.value - totalBusinessKm.value)
})

// 2. Sanity Checks & Warnings
const warnings = computed(() => {
  const list = []
  const start = store.onlineStartOdometer || 0
  const end = Number(endOdometer.value) || 0

  if (end < start) {
    list.push(`End Odometer (${end}) cannot be less than Start Odometer (${start}).`)
  }
  if (totalShiftKm.value > 1000) {
    list.push('Shift distance exceeds 1,000 km. Please double-check your reading.')
  }
  if (totalShiftKm.value > 0 && totalShiftKm.value < totalBusinessKm.value) {
    list.push(`Shift distance (${totalShiftKm.value} km) is less than logged trips (${totalBusinessKm.value.toFixed(1)} km).`)
  }
  if (Number(finalRevenue.value) < 0) {
    list.push('Final revenue cannot be negative.')
  }
  return list
})

const isValid = computed(() => warnings.value.length === 0 && totalShiftKm.value >= 0)

// 3. Inline Trip Handlers
const openEditTrip = (trip) => {
  selectedTrip.value = { ...trip }
  showTripEditModal.value = true
}

const saveTripEdit = () => {
  if (!selectedTrip.value) return
  store.updateChildTrip(selectedTrip.value.id, {
    fare: Number(selectedTrip.value.fare) || 0,
    estimatedDistanceKm: Number(selectedTrip.value.estimatedDistanceKm) || 0
  })

  // Re-sync store revenue only if driver has not customized it manually
  if (!isRevenueManuallyEdited.value) {
    finalRevenue.value = store.currentShiftIncrementalRevenue
  }
  showTripEditModal.value = false
  selectedTrip.value = null
}

const deleteTrip = (tripId) => {
  store.deleteChildTrip(tripId)
  if (!isRevenueManuallyEdited.value) {
    finalRevenue.value = store.currentShiftIncrementalRevenue
  }
}

// 4. Submit Final Shift
const handleFinalCommit = async () => {
  if (!isValid.value || isSubmitting.value) return
  isSubmitting.value = true
  submitError.value = ''

  try {
    await store.goOffline({
      endOdometer: Number(endOdometer.value),
      finalReconciledRevenue: Number(finalRevenue.value)
    })
    emit('shift-closed')
  } catch (err) {
    submitError.value = err.message || 'Failed to save shift reconciliation. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="reconcile-overlay">
    <div class="reconcile-card">
      <header class="card-header">
        <h2>🏁 End Shift Reconciliation</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </header>

      <div class="card-body">
        <section class="form-section">
          <h3>1. Odometer Readings</h3>
          <div class="grid-2">
            <div class="stat-box">
              <label>Start Meter</label>
              <span class="value">{{ store.onlineStartOdometer || 0 }} km</span>
            </div>
            <div class="input-box">
              <label for="endOdo">End Meter (km)</label>
              <input id="endOdo" v-model.number="endOdometer" type="number" step="1" placeholder="e.g. 10150" />
            </div>
          </div>
          <div class="metric-banner">
            <span>Total Shift Distance:</span>
            <strong>{{ totalShiftKm }} km</strong>
          </div>
        </section>

        <section class="form-section">
          <div class="section-title-bar">
            <h3>2. Revenue Audit</h3>
            <span class="sub-text">Logged: ₹{{ store.currentShiftIncrementalRevenue }}</span>
          </div>
          <div class="input-box full-width">
            <label for="finalRev">Final Reconciled Revenue (₹)</label>
            <input id="finalRev" v-model.number="finalRevenue" type="number" step="10" @input="onRevenueInput" placeholder="Total cash + digital" />
          </div>
        </section>

        <section class="form-section">
          <h3>3. Logged Rides ({{ (store.currentShiftTrips || []).length }})</h3>
          <div v-if="!store.currentShiftTrips || store.currentShiftTrips.length === 0" class="empty-state">
            No active rides logged for this shift.
          </div>
          <div v-else class="trip-list">
            <div v-for="(trip, index) in store.currentShiftTrips" :key="trip.id" class="trip-item">
              <div class="trip-info">
                <span class="trip-number">Ride #{{ index + 1 }}</span>
                <span class="trip-details">
                  {{ trip.estimatedDistanceKm ? Number(trip.estimatedDistanceKm).toFixed(1) : 0 }} km | ₹{{ trip.fare }}
                </span>
              </div>
              <div class="trip-actions">
                <button class="btn-icon" @click="openEditTrip(trip)">✏️</button>
                <button class="btn-icon danger" @click="deleteTrip(trip.id)">🗑️</button>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section summary-box">
          <div class="summary-row">
            <span>Business / Paid Distance:</span>
            <span>{{ totalBusinessKm.toFixed(1) }} km</span>
          </div>
          <div class="summary-row highlight">
            <span>Calculated Dead Miles:</span>
            <span>{{ calculatedDeadMiles.toFixed(1) }} km</span>
          </div>
        </section>

        <div v-if="warnings.length > 0" class="warning-box">
          <div v-for="(warn, i) in warnings" :key="i" class="warning-item">
            ⚠️ {{ warn }}
          </div>
        </div>

        <div v-if="submitError" class="error-box">
          ❌ {{ submitError }}
        </div>
      </div>

      <footer class="card-footer">
        <button class="btn-submit" :disabled="!isValid || isSubmitting" @click="handleFinalCommit">
          {{ isSubmitting ? 'Saving Shift...' : '💾 Confirm & Save Shift' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.reconcile-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 12px; }
.reconcile-card { background: #ffffff; width: 100%; max-width: 480px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3); }
.card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #1e293b; color: #ffffff; }
.card-header h2 { font-size: 1.1rem; margin: 0; }
.close-btn { background: none; border: none; color: #ffffff; font-size: 1.2rem; cursor: pointer; }
.card-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.form-section { border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
.form-section h3 { font-size: 0.9rem; color: #475569; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.stat-box, .input-box { display: flex; flex-direction: column; }
.stat-box label, .input-box label { font-size: 0.8rem; color: #64748b; margin-bottom: 4px; }
.stat-box .value { font-size: 1.1rem; font-weight: bold; color: #0f172a; }
.input-box input { padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; }
.metric-banner { margin-top: 8px; background: #f1f5f9; padding: 8px 12px; border-radius: 8px; display: flex; justify-content: space-between; font-size: 0.9rem; }
.trip-list { display: flex; flex-direction: column; gap: 8px; max-height: 140px; overflow-y: auto; }
.trip-item { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
.trip-number { font-weight: bold; font-size: 0.85rem; display: block; }
.trip-details { font-size: 0.8rem; color: #64748b; }
.btn-icon { background: none; border: none; cursor: pointer; padding: 4px; }
.summary-box { background: #f8fafc; padding: 12px; border-radius: 8px; }
.summary-row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px; }
.summary-row.highlight { font-weight: bold; color: #2563eb; margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
.warning-box { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px; border-radius: 8px; font-size: 0.85rem; }
.error-box { background: #fee2e2; border: 1px solid #f87171; color: #b91c1c; padding: 10px; border-radius: 8px; font-size: 0.85rem; }
.card-footer { padding: 16px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
.btn-submit { width: 100%; padding: 14px; background: #16a34a; color: #ffffff; border: none; border-radius: 10px; font-size: 1rem; font-weight: bold; cursor: pointer; }
.btn-submit:disabled { background: #94a3b8; cursor: not-allowed; }
</style>
