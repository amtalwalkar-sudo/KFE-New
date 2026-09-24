import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const scripts = packageJson.scripts || {}

assert.equal(typeof scripts.build, 'string', 'production build script must exist')
assert.equal(typeof scripts.test, 'string', 'test script must exist')
assert.ok(existsSync('dist'), 'production dist directory must exist after build')
assert.ok(existsSync('android'), 'Capacitor Android project must exist')
assert.ok(existsSync('capacitor.config.json'), 'Capacitor configuration must exist')
assert.ok(existsSync('src/tests/runAllContracts.js'), 'full contract runner must exist')
assert.ok(existsSync('docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md'), 'CI failure protocol must remain documented')
assert.ok(existsSync('KFE_LAUNCH_MASTER_PLAN.md'), 'authoritative launch roadmap must remain documented')

const roadmap = readFileSync('KFE_LAUNCH_MASTER_PLAN.md', 'utf8')
assert.match(roadmap, /\| 10 \| Release Candidate Freeze \|/, 'Phase 10 release-candidate phase must remain present')
assert.match(roadmap, /exact release candidate/, 'Release-candidate control must remain documented')

console.log('Phase 10 hardening/release contract passed')
