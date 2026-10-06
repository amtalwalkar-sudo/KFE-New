import { runNativeSwipeVisualParityAudit } from '../../tools/native-swipe-visual-parity-audit.mjs'

try {
  runNativeSwipeVisualParityAudit()
  console.log('Native swipe visual parity contract passed.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
