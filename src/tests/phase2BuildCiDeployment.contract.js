import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/consolidated-baseline.yml', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(packageJson.type, 'module', 'package must explicitly declare ESM for contract/test scripts')
assert.equal(packageJson.scripts?.build, 'vite build', 'production build script must remain canonical')
assert.equal(packageJson.scripts?.test, 'node src/tests/runAllContracts.js', 'contract runner must remain canonical')
assert.ok(existsSync('package-lock.json'), 'package lockfile must be committed')
assert.ok(existsSync('vite.config.js'), 'Vite configuration must exist')
assert.ok(existsSync('capacitor.config.json'), 'Capacitor configuration must exist')
assert.ok(existsSync('.github/workflows/consolidated-baseline.yml'), 'canonical CI workflow must exist')

assert.match(workflow, /uses:\s+actions\/checkout@v5/, 'CI must use checkout v5')
assert.match(workflow, /uses:\s+actions\/setup-java@v5/, 'CI must use setup-java v5')
assert.match(workflow, /uses:\s+actions\/setup-node@v5/, 'CI must use setup-node v5')
assert.match(workflow, /node-version:\s+22/, 'CI Node version must remain 22')
assert.match(workflow, /cache:\s+gradle/, 'Gradle dependency caching must be enabled')
assert.match(workflow, /cache:\s+npm/, 'npm dependency caching must be enabled')
assert.match(workflow, /npm ci/, 'CI must use lockfile-enforcing npm ci')
assert.match(workflow, /npx cap sync android/, 'CI must verify Capacitor synchronization')
assert.match(workflow, /\.\/gradlew assembleDebug/, 'CI must verify Android debug compilation')
assert.match(workflow, /actions\/upload-pages-artifact@v4/, 'canonical CI must package Pages artifact')
assert.match(workflow, /actions\/deploy-pages@v4/, 'canonical CI must deploy Pages')
assert.match(workflow, /github\.event_name === 'push' && github\.ref === 'refs\/heads\/main'/, 'Pages deployment must be restricted to main pushes')
assert.match(workflow, /needs: build-and-test/, 'deployment must depend on successful validation')
assert.ok(!existsSync('.github/workflows/deploy-pages.yml'), 'duplicate Pages deployment workflow must remain removed')

console.log('Phase 2 build/CI/deployment contract passed')
