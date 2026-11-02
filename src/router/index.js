import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import WorkModuleView from '../views/WorkModuleView.vue'
import ActivityTimelineView from '../views/ActivityTimelineView.vue'
import PerformanceView from '../views/PerformanceView.vue'
import AdminView from '../views/AdminView.vue'

const routes = [
  { path: '/', name: 'Work', component: WorkModuleView },
  { path: '/timeline', name: 'Timeline', component: ActivityTimelineView, meta: { shell: { header: false } } },
  { path: '/performance', name: 'Performance', component: PerformanceView, meta: { shell: { header: false } } },
  { path: '/admin', name: 'Admin', component: AdminView },
]

/** Router construction receives platform identity from the infrastructure composition root. */
export const createKfeRouter = ({ isNativePlatform = false } = {}) => {
  const pagesProjectBase = window.location.pathname === '/KFE-New'
    || window.location.pathname.startsWith('/KFE-New/')
    ? '/KFE-New/'
    : '/'
  const routerBase = isNativePlatform ? '/' : pagesProjectBase
  const history = isNativePlatform
    ? createWebHashHistory('/')
    : createWebHistory(routerBase)
  return createRouter({ history, routes })
}
