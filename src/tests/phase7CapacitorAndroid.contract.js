import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const capacitorConfig = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'))
const androidManifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const androidAppGradle = fs.readFileSync('android/app/build.gradle', 'utf8')
const androidSettings = fs.readFileSync('android/settings.gradle', 'utf8')

// Phase 7 is a native packaging/integration boundary. The web application
// remains the source of the UI and is loaded from the production build output.
assert.ok(packageJson.dependencies['@capacitor/core'])
assert.ok(packageJson.dependencies['@capacitor/android'])
assert.ok(packageJson.devDependencies['@capacitor/cli'])
assert.equal(capacitorConfig.webDir, 'dist')
assert.equal(capacitorConfig.appId, 'com.kanishka.pwa')
assert.equal(capacitorConfig.appName, 'KanishkaApp')

// The generated Android project must be a real Capacitor application and
// include the native plugins already required by the frozen application.
assert.match(androidSettings, /include ':app'/)
assert.match(androidSettings, /capacitor\.settings\.gradle/)
assert.match(androidAppGradle, /implementation project\(':capacitor-android'\)/)
assert.match(androidAppGradle, /implementation project\(':capacitor-local-notifications'\)/)
assert.match(androidAppGradle, /implementation project\(':capawesome-team-capacitor-android-foreground-service'\)/)
assert.match(androidManifest, /android\.permission\.INTERNET/)
assert.match(androidManifest, /android:name="\.MainActivity"/)
assert.match(androidManifest, /android\.intent\.action\.MAIN/)
assert.match(androidManifest, /android\.intent\.category\.LAUNCHER/)

console.log('Phase 7 Capacitor / Android integration contract passed')
