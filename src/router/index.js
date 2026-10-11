import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import WorkModuleView from '../views/WorkModuleView.vue'
import PerformanceView from '../views/PerformanceView.vue'
import AdminView from '../views/AdminView.vue'
import TimelineView from '../views/TimelineView.vue'

const routes = [
  { path: '/', name: 'Work', component: WorkModuleView },
  { path: '/timeline', name: 'Timeline', component: TimelineView },
  { path: '/performance', name: 'Performance', component: PerformanceView, meta: { shell: { header: false } } },
  { path: '/admin', name: 'Admin', component: AdminView },
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
