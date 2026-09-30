import { createRouter, createWebHistory } from 'vue-router'
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

// Resolve the hosting directory from the current document URL. This keeps
// GitHub Pages under /KFE-New/ while remaining compatible with Capacitor
// (where the app is served from the local WebView origin).
const routerBase = new URL('./', window.location.href).pathname

const router = createRouter({
  history: createWebHistory(routerBase),
  routes
})

export default router
