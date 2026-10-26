import assert from 'node:assert/strict'
import fs from 'node:fs'

const router = fs.readFileSync('src/router/index.js', 'utf8')
const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const blank = fs.readFileSync('src/views/BlankWorkspaceView.vue', 'utf8')
assert.match(router, /path: '\/timeline', name: 'Timeline', component: ActivityTimelineView/)
assert.match(router, /path: '\/performance', name: 'Performance', component: BlankWorkspaceView/)
assert.match(router, /import ActivityTimelineView from '\.\.\/views\/ActivityTimelineView\.vue'/)
for (const label of ['Work', 'Timeline', 'Performance', 'Admin']) assert.ok(shell.includes(`aria-label="${label}"`) || shell.includes(`<span>${label}</span>`), `bottom navigation retains ${label}`)
assert.match(blank, /aria-hidden="true"/)
for (const file of ['src/views/PerformanceView.vue','src/views/TimelineView.vue','src/styles/performance.css','src/application/timeline/activityTimelineService.js','src/application/timeline/timelineService.js','src/application/performance/performancePresentation.js']) assert.equal(fs.existsSync(file), false, `obsolete screen-only file removed: ${file}`)
assert.ok(fs.existsSync('src/application/timeline/activityTimelineReadService.js'))
assert.ok(fs.existsSync('src/views/ActivityTimelineView.vue'))
assert.ok(fs.existsSync('src/styles/activity-timeline.css'))
console.log('Timeline route restored; Performance remains intentionally blank: PASS')
