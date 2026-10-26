import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import WorkModuleView from '../views/WorkModuleView.vue'
import ActivityTimelineView from '../views/ActivityTimelineView.vue'
import PerformanceView from '../views/PerformanceView.vue'
import AdminSettingsOnlyView from '../views/AdminSettingsOnlyView.vue'

const routes = [
  { path: '/', name: 'Work', component: WorkModuleView },
  // Timeline is a read-only projection of canonical operational records.
  { path: '/timeline', name: 'Timeline', component: ActivityTimelineView, meta: { shell: { header: false } } },
  // Performance is a read-only projection of saved operational records.
  { path: '/performance', name: 'Performance', component: PerformanceView, meta: { shell: { header: false } } },
  { path: '/admin', name: 'Admin', component: AdminSettingsOnlyView },
]

// Vite uses relative asset URLs so the same bundle works in Pages and Capacitor.
// Vue Router needs an absolute history base on project Pages, not "./" (which
// resolves to "/./" and leaves the route-view empty at /KFE-New/).
const pagesProjectBase = window.location.pathname === '/KFE-New'
  || window.location.pathname.startsWith('/KFE-New/')
  ? '/KFE-New/'
  : '/'
const routerBase = Capacitor.isNativePlatform() ? '/' : pagesProjectBase
const history = Capacitor.isNativePlatform()
  ? createWebHashHistory('/')
  : createWebHistory(routerBase)

const router = createRouter({
  history,
  routes
})

export default router
