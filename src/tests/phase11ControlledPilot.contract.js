import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
// Keep the pilot gate wording test tied to the frozen gate document.

assert.ok(existsSync('KFE_CONTROLLED_PILOT_GATE_PHASE11.md'))
const gate = readFileSync('KFE_CONTROLLED_PILOT_GATE_PHASE11.md', 'utf8')

assert.match(gate, /Phase 11 — Controlled Real-World Pilot/)
assert.match(gate, /Status:\*\* ACTIVE — REAL-WORLD EVIDENCE PENDING/)
assert.match(gate, /controlled real business activity/)
assert.match(gate, /CI, browser automation, synthetic data, emulator evidence, documentation, or a contract test alone cannot satisfy this exit/)
assert.match(gate, /DO NOT CLOSE PHASE 11 WITHOUT REAL PILOT EVIDENCE/)
assert.match(gate, /Physical Android\/phone validation remains deferred until after Phase 13/)

console.log('Phase 11 controlled pilot evidence gate passed')
