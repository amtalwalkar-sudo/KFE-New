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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
