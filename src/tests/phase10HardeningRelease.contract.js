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
assert.ok(existsSync('docs/KFE-DEVELOPMENT-PHASES.md'), 'phase roadmap must remain documented')

const roadmap = readFileSync('docs/KFE-DEVELOPMENT-PHASES.md', 'utf8')
assert.match(roadmap, /Phase 10.*Hardening \/ Release/, 'Phase 10 roadmap entry must remain present')
assert.match(roadmap, /RELEASE CANDIDATE/, 'Phase 10 release-candidate exit condition must remain documented')

console.log('Phase 10 hardening/release contract passed')
