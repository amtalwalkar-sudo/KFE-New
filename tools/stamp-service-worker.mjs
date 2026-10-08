import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const resolveBuildId = () => {
  const explicit = process.env.KFE_BUILD_ID || process.env.GITHUB_SHA
  if (explicit) return explicit
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

const buildId = resolveBuildId().replace(/[^A-Za-z0-9._-]/g, '-')
const path = 'dist/service-worker.js'
const source = await readFile(path, 'utf8')
if (!source.includes('__KFE_BUILD_ID__')) {
  throw new Error('Expected __KFE_BUILD_ID__ placeholder in dist/service-worker.js')
}
await writeFile(path, source.replaceAll('__KFE_BUILD_ID__', buildId), 'utf8')
console.log(`Stamped service-worker cache with build id ${buildId}`)
