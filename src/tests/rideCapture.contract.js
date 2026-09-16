import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const service = read('services/rideCaptureService.js')
const adapter = read('services/adapters/rideCaptureAdapter.js')
const normalization = read('domain/canonicalNormalization.js')
const repository = read('repositories/shiftTripRepository.js')
const contract = fs.readFileSync(path.join(root, '..', 'docs', 'KFE-CANONICAL-DATA-CONTRACT.md'), 'utf8')

console.log('--- Running KFE Phase 3 Ride Capture Contract Tests ---')

// Provider-independent adapter boundary: no OCR/model vendor is selected here.
assert(adapter.includes('createRideCaptureAdapter'), 'Provider-independent adapter factory missing')
assert(adapter.includes('extractScreenshot'), 'Screenshot extraction adapter boundary missing')
assert(adapter.includes('RIDE_CAPTURE_FIELDS'), 'Canonical extraction field contract missing')
for (const forbidden of ['@google/genai', 'gemini', 'openai', 'anthropic']) assert(!adapter.toLowerCase().includes(forbidden), `Ride Capture adapter must not couple to ${forbidden}`)

// Required screenshot-derived fields remain explicit and bounded.
for (const field of ['operator','status','pickup','drop','rideStartAt','rideEndAt','durationMinutes','distanceKm','fare','cancelReason']) assert(adapter.includes(`'${field}'`), `Ride extraction field missing: ${field}`)

// Extraction must be validated before canonical persistence.
assert(service.includes('extractScreenshot(adapter, image)'), 'Screenshot extraction entry point missing')
assert(service.includes('validateExtractedRide'), 'Extraction validation boundary missing')
assert(service.includes('normalizeTripInput'), 'Extracted values must pass canonical normalization')
assert(service.includes("tripKmProvenance: 'OCR_MULTIMODAL'"), 'OCR provenance must be explicit')
assert(service.includes("revenueProvenance: 'OCR_MULTIMODAL'"), 'OCR revenue provenance must be explicit')
assert(service.includes("['COMPLETED', 'CANCELLED']"), 'Ride status validation missing')
assert(service.includes('rideEndAt cannot be before rideStartAt'), 'Ride time boundary validation missing')
assert(service.includes('distanceKm'), 'Distance extraction validation missing')
assert(service.includes('fare'), 'Fare extraction validation missing')

// Confirmation persists through the existing canonical Trip authority rather than a parallel ride store.
assert(service.includes('ShiftTripRepository.createTrip'), 'Confirmation must use canonical Trip repository')
assert(service.includes('ShiftTripRepository.completeTrip'), 'Completed capture must use canonical Trip completion')
assert(service.includes('ShiftTripRepository.cancelTrip'), 'Cancelled capture must use canonical Trip cancellation')
assert(!service.includes('createRideRecord'), 'No competing Ride persistence authority may be introduced')
assert(!service.includes('ride_capture'), 'No competing Ride persistence store may be introduced')

// Existing canonical Trip lineage and mutation/audit guarantees remain in force.
assert(repository.includes('shiftId: normalized.shiftId'), 'Canonical Trip must retain shift relationship')
assert(repository.includes('tripKmAuthority'), 'Trip distance authority boundary missing')
assert(repository.includes('revenueAuthority'), 'Trip revenue authority boundary missing')
assert(repository.includes('saveMutation(mutations, audit, record.id, \'TRIP\', \'CREATE\''), 'Trip creation must retain mutation/audit lineage')
assert(contract.includes('provenance'), 'Canonical contract must retain provenance boundary')

// Duration is a derived presentation value when timestamps are available; it is not a second business authority.
assert(service.includes('durationMinutes'), 'Duration must be available to review flow')
assert(service.includes('new Date(normalized.tripEndAt) - new Date(normalized.tripStartAt)'), 'Duration fallback must derive from validated timestamps')
assert(!service.includes('durationMinutes *'), 'Duration must not become a financial/calculation authority')

console.log('✅ Phase 3 Ride Capture Contract Tests Passed Successfully!')
