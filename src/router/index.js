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

// GitHub Pages keeps normal HTML5 URLs. Native Capacitor WebView uses hash history so
// refreshing Timeline/Performance/Admin always reloads the app entry document instead
// of depending on a server rewrite for an arbitrary client-side route.
const routerBase = new URL('./', window.location.href).pathname
const history = Capacitor.isNativePlatform()
  ? createWebHashHistory('/')
  : createWebHistory(routerBase)

const router = createRouter({
  history,
  routes
})

export default router
