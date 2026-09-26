import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const scripts = packageJson.scripts || {}

assert.equal(packageJson.version, '2.0.0', 'release version must remain 2.0.0')
assert.equal(typeof scripts.build, 'string', 'production build script must exist')
assert.equal(typeof scripts.test, 'string', 'test script must exist')
assert.ok(existsSync('dist'), 'production dist directory must exist after build')
assert.ok(existsSync('android'), 'Capacitor Android project must exist')
assert.ok(existsSync('capacitor.config.json'), 'Capacitor configuration must exist')
assert.ok(existsSync('src/tests/runAllContracts.js'), 'full contract runner must exist')
assert.ok(existsSync('docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md'), 'CI failure protocol must remain documented')
assert.ok(existsSync('KFE_LAUNCH_MASTER_PLAN.md'), 'authoritative launch roadmap must remain documented')
assert.ok(existsSync('KFE_RELEASE_CANDIDATE_PHASE10.md'), 'Phase 10 freeze evidence must exist')

const capacitor = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
assert.equal(capacitor.appId, 'com.kanishka.pwa', 'release app ID must remain canonical')

const release = readFileSync('KFE_RELEASE_CANDIDATE_PHASE10.md', 'utf8')
assert.match(release, /Status:\*\* FROZEN \/ NON-DEVICE PASS/, 'release candidate must be explicitly frozen')
assert.match(release, /Version:\*\* 2\.0\.0/, 'release candidate version must be recorded')
assert.match(release, /Android APK:/, 'release candidate must define APK evidence')
assert.match(release, /Physical-device validation: \*\*deferred until after Phase 13\*\*/, 'physical-device audit must remain deferred')

const roadmap = readFileSync('KFE_LAUNCH_MASTER_PLAN.md', 'utf8')
assert.match(roadmap, /\| 10 \| Release Candidate Freeze \|/, 'Phase 10 release-candidate phase must remain present')
assert.match(roadmap, /exact release candidate/, 'release-candidate control must remain documented')

console.log('Phase 10 hardening/release contract passed')
