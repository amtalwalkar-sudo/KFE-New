import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const scripts = packageJson.scripts || {}

assert.equal(packageJson.version, '2.1.0', 'release version must remain 2.1.0')
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
assert.match(release, /Status:\*\* HISTORICAL PHASE 10 FREEZE EVIDENCE/, 'historical Phase 10 evidence must be clearly labelled')
assert.match(release, /Version at original freeze:\*\* 2.1.0/, 'historical release version must be recorded')
assert.match(release, /Android APK were required to be generated from the same identified source revision/i, 'historical APK evidence rule must remain documented')
assert.match(release, /Physical-device validation: \*\*deferred until after Phase 13\*\*/, 'physical-device audit must remain deferred')

const roadmap = readFileSync('KFE_LAUNCH_MASTER_PLAN.md', 'utf8')
assert.match(roadmap, /\| 10 \| Release Candidate Freeze \|/, 'Phase 10 release-candidate phase must remain present')
assert.match(roadmap, /exact release candidate/i, 'exact release-candidate control must remain documented')
assert.match(roadmap, /Physical Android\/phone testing is part of Phase 11/i, 'physical-device acceptance must be part of Phase 11')

console.log('Phase 10 hardening/release contract passed')
