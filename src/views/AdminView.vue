<script setup>
import { computed, onMounted, ref, toRaw } from 'vue'
import AdminSourceForm from '../components/admin/AdminSourceForm.vue'
import AdminShell from '../components/admin/AdminShell.vue'
import BackupRestorePanel from '../components/admin/BackupRestorePanel.vue'
import FinanceLedgerPanel from '../components/admin/FinanceLedgerPanel.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'
import { FormDraftService } from '../application/forms/formDraftService.js'
import { BackupService } from '../application/backup/backupService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { AdminReadModelService } from '../application/admin/adminReadModelService.js'
import CalculationsView from './CalculationsView.vue'
import { ApplicationSettingsService } from '../presentation/settings/settingsPreferenceService.js'

import {
  ADMIN_NAVIGATION_ITEMS as items,
  ADMIN_NAVIGATION_CATEGORIES as categories,
  ADMIN_SETTINGS_MENU as settingsMenu,
  getAdminSettingsKey,
  isAdminSettingsItem,
  groupAdminNavigationItems,
} from '../presentation/admin/adminNavigation.js'
const selected=ref(null),settingsOpen=ref(false),settingsSelected=ref('backup'),masterSelected=ref(null)
const notificationsEnabled=ref(readNotificationsPreference())
const records=ref([]),all=ref({vehicle:[],driver:[],loan:[],compliance:[],maintenance:[],driverTarget:[],breakEvenInputs:[],loanPayment:[],prepayment:[],settlement:[]})
const performanceSnapshot=ref(null),loading=ref(false),saving=ref(false),error=ref(''),notice=ref('')
const formOpen=ref(false),editing=ref(null),draft=ref({}),formErrors=ref({})
const actionKey=ref(null),actionRecord=ref(null),actionDraft=ref({}),paymentCalculated=ref(false),paymentConfirmed=ref(false)
const expandedLoanSchedules=ref({})
const prepaymentDraft=ref({loanId:'',paidOn:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()),amount:0,reason:'',notes:''}),prepaymentCalculated=ref(false),prepaymentConfirmed=ref(false)
const targetDraft=ref({driverId:'',month:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()).slice(0,7),desiredDriverProfit:0,nonWorkingDates:'',targetHours:'',targetKm:''})
const maintenanceRateDraft=ref({rate:'',changeDate:AdminReadModelService.dateKey(AdminReadModelService.referenceNow())})
const draftWorkflowIds = ref({})
const draftWorkflowResolutions = new Map()
const draftWorkflowKey = (formId, workflowStep, parentId = null) => [formId, workflowStep, parentId || ''].join(':')
async function beginDraftWorkflow(formId, workflowStep, parentId = null) {
  const key = draftWorkflowKey(formId, workflowStep, parentId)
  const pending = draftWorkflowResolutions.get(key)
  if (pending) return pending
  const resolution = (async () => {
    try {
      const parentType = parentId ? 'ADMIN_RECORD' : 'WORKFLOW'
      const existing = await FormDraftService.latestWorkflow('admin-' + formId, workflowStep, parentType, parentId)
      const workflowId = parentId ? null : (existing?.workflowId || FormDraftService.newWorkflowId())
      draftWorkflowIds.value = { ...draftWorkflowIds.value, [key]: workflowId }
      return true
    } catch (cause) {
      error.value = cause?.message || 'Unable to recover the unfinished Admin form. Try again before entering data.'
      return false
    }
  })()
  draftWorkflowResolutions.set(key, resolution)
  try { return await resolution }
  finally { if (draftWorkflowResolutions.get(key) === resolution) draftWorkflowResolutions.delete(key) }
}
const buildDraftIdentity = (formId, parentId = null, workflowStep = 'EDIT') => {
  const workflowId = draftWorkflowIds.value[draftWorkflowKey(formId, workflowStep, parentId)]
  if (!workflowId && !parentId) return null
  return {
    formId: 'admin-' + formId, workflowStep,
    parentType: parentId ? 'ADMIN_RECORD' : 'WORKFLOW',
    parentId: parentId || null,
    workflowId
  }
}
const sourceFormDraftIdentity = computed(() => buildDraftIdentity(selected.value || 'source', editing.value, editing.value !== null ? 'EDIT' : 'CREATE'))
const targetFormDraftIdentity = computed(() => buildDraftIdentity('driver-target', null, 'EDIT_TARGET'))
const maintenanceRateFormDraftIdentity = computed(() => buildDraftIdentity('maintenance-rate', null, 'EDIT_RATE'))
const prepaymentFormDraftIdentity = computed(() => buildDraftIdentity('prepayment', null, 'PREPAYMENT'))
const actionFormDraftIdentity = computed(() => buildDraftIdentity(
  actionKey.value === 'loanPayment' ? 'loan-payment-' + (actionRecord.value?.id || 'new') : 'settlement-' + (actionRecord.value?.id || 'new'),
  actionRecord.value?.id || null,
  actionKey.value === 'loanPayment' ? 'LOAN_PAYMENT' : 'SETTLEMENT'
))
async function clearFormDraft(identity) {
  if (!identity) return
  try { await FormDraftService.clear(identity, { committed: true }) }
  catch (_) { notice.value = (notice.value ? notice.value + ' ' : '') + 'Saved successfully; an unfinished draft could not be cleared. Reopen the form and verify before continuing.' }
}
const targetFields=computed(()=>[
 {key:'driverId',label:'Driver',type:'select',section:'Target period',required:true,options:all.value.driver.map(d=>({value:d.id,label:label('driver',d)}))},
 {key:'month',label:'Month',type:'month',section:'Target period',required:true},
 {key:'desiredDriverProfit',label:'Desired driver profit / take-home',type:'number',section:'Target amount',required:true,min:0,step:0.01,help:'The target engine derives break-even and provision amounts separately.'},
 {key:'nonWorkingDates',label:'Planned non-working / holiday dates',type:'textarea',section:'Availability',placeholder:'YYYY-MM-DD, one per line or comma separated'},
 {key:'active',label:'Active',type:'checkbox',section:'Availability',defaultValue:true,toggleLabel:'Target active'},
 {key:'notes',label:'Notes',type:'textarea',section:'Additional context'}
])
const prepaymentFields=computed(()=>[
 {key:'loanId',label:'Loan',type:'select',section:'Loan to prepay',required:true,options:all.value.loan.map(x=>({value:x.id,label:label('loan',x)}))},
 {key:'amount',label:'Actual prepayment amount',type:'number',section:'Prepayment details',required:true,min:0,step:0.01},
 {key:'paidOn',label:'Payment date',type:'date',section:'Prepayment details',required:true},
 {key:'reason',label:'Reason',type:'textarea',section:'Additional context'},
 {key:'notes',label:'Notes',type:'textarea',section:'Additional context'}
])
const loanPaymentFields=[
 {key:'paidOn',label:'Payment date',type:'date',section:'Actual payment',required:true},
 {key:'amount',label:'Actual amount paid',type:'number',section:'Actual payment',required:true,min:0,step:0.01},
 {key:'notes',label:'Notes',type:'textarea',section:'Additional context'}
]
const settlementFields=[
 {key:'settledOn',label:'Payment date',type:'date',section:'Payment details',required:true},
 {key:'amount',label:'Amount paid',type:'number',section:'Payment details',required:true,min:0,step:0.01},
 {key:'paymentMethod',label:'Payment method',type:'select',section:'Payment reference',options:['Cash','Bank transfer','UPI','Card','Cheque','Other'],defaultValue:'Cash'},
 {key:'referenceNumber',label:'Payment reference',type:'text',section:'Payment reference'},
 {key:'notes',label:'Notes',type:'textarea',section:'Additional context'}
]
const money=v=>Number.isFinite(Number(v))?'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2}):'—'
const clone=v=>structuredClone(toRaw(v))
const live=xs=>(xs||[]).filter(x=>!x?.deletedAt&&!x?.deleted)
function label(key,record){const v=record?.values||record||{};if(key==='businessSetup')return v.businessStartDate ? `Business start · ${v.businessStartDate}` : 'Business Setup';if(key==='vehicle')return [v.registrationNumber,v.make,v.model].filter(Boolean).join(' · ')||record?.id;if(key==='driver')return v.name||record?.id;if(key==='loan')return [v.lender,v.accountReference].filter(Boolean).join(' · ')||record?.id;if(key==='compliance')return v.complianceType||record?.id;if(key==='maintenance')return v.maintenanceType||record?.id;return record?.id||'—'}
const currentItem=computed(()=>items.find(x=>x.key===selected.value)||(selected.value==='prepayment'?{key:'prepayment',category:'Finance',title:'Loan Prepayment',icon:'↘'}:null))
const masterMode=computed(()=>['vehicle','driver','compliance'].includes(selected.value))
const masterRecord=computed(()=>masterSelected.value?records.value.find(x=>x.id===masterSelected.value)||null:null)
const provisionRange=computed(()=>{
  const now=AdminReadModelService.referenceNow()
  const dates=[
    ...live(performanceSnapshot.value?.shifts).map(x=>x.shiftStartAt||x.shiftEndAt),
    ...live(performanceSnapshot.value?.compliance).map(x=>x.validFrom),
    ...live(performanceSnapshot.value?.maintenance).map(x=>x.performedOn)
  ].map(x=>new Date(x)).filter(x=>!Number.isNaN(x.getTime()))
  const from=dates.sort((a,b)=>a-b)[0]||now
  return {from,to:now}
})
const performanceProvisionMetrics=computed(()=>{
  if(!performanceSnapshot.value)return null
  return PerformanceService.getMetrics(performanceSnapshot.value,provisionRange.value)
})
const maintenanceProvisionTotal=computed(()=>performanceProvisionMetrics.value?Number(performanceProvisionMetrics.value.maintenanceProvision)||0:0)
const maintenanceProvisionBalance=computed(()=>performanceProvisionMetrics.value?Number(performanceProvisionMetrics.value.maintenanceProvisionBalance)||0:0)
const complianceRevenueSummary = record => {
  if (!record || !performanceSnapshot.value) return { total: 0, days: 0, average: 0 }
  const v = record.values || record
  const from = new Date(v.validFrom)
  const until = new Date(v.validUntil)
  const now = AdminReadModelService.referenceNow()
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || from > until) return { total: 0, days: 0, average: 0 }
  const to = new Date(Math.min(until.getTime(), now.getTime()))
  if (to < from) return { total: 0, days: 0, average: 0 }
  const byDay = {}
  for (const shift of live(performanceSnapshot.value.shifts)) {
    const date = new Date(shift.shiftEndAt || shift.shiftStartAt)
    if (Number.isNaN(date.getTime()) || date < from || date > to) continue
    const key = date.toISOString().slice(0, 10)
    byDay[key] = (byDay[key] || 0) + (Number(shift.revenue) || 0)
  }
  const total = Object.values(byDay).reduce((sum, value) => sum + value, 0)
  const days = Object.keys(byDay).length
  return { total, days, average: days ? total / days : 0 }
}
const currentDefinition=computed(()=>currentItem.value?ADMIN_FORM_DEFINITIONS[currentItem.value.key]:null)
const activeDefinition=computed(()=>{if(!currentDefinition.value)return null;const d=clone(currentDefinition.value);for(const f of d.fields||[]){if(f.key==='vehicleId')f.options=all.value.vehicle.map(x=>({value:x.id,label:label('vehicle',x)}));if(f.key==='driverId')f.options=all.value.driver.map(x=>({value:x.id,label:label('driver',x)}));if(f.key==='loanId')f.options=all.value.loan.map(x=>({value:x.id,label:label('loan',x)}))}return d})
const sourcePayments=id=>live(performanceSnapshot.value?.settlements).filter(x=>x.sourceId===id&&String(x.direction||(x.settlementType==='Receipt'?'IN':'OUT')).toUpperCase()==='OUT')
const sumPayments=id=>sourcePayments(id).reduce((s,x)=>s+(Number(x.amount)||0),0)
const entityFinancial=record=>{if(!record)return null;if(selected.value==='loan'){const loan=live(performanceSnapshot.value?.loans).find(x=>x.id===record.id)||record;const p=AdminReadModelService.getLoanPosition({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),asOf:AdminReadModelService.referenceNow()});return {principal:Number(loan.principal)||0,paid:p.actualPaid||0,prepaid:p.actualPrepayment||0,remaining:p.outstandingPrincipal||0,emi:p.emi||0,pending:Math.max(0,(p.scheduledDue||0)-(p.actualPaid||0)),overdue:p.totalOverdue||0}}if(selected.value==='maintenance'||selected.value==='compliance'){const v=record.values||record,paid=sumPayments(record.id);const result={cost:Number(v.cost)||0,paid,remaining:(Number(v.cost)||0)-paid};if(selected.value==='maintenance'){result.provisionAccumulated=Number(performanceProvisionMetrics.value?.maintenanceProvision)||0;result.provisionBalance=Number(maintenanceProvisionBalance.value)||0}return result}return null}
const loanHistory=record=>{const s=performanceSnapshot.value||{};return [...live(s.loanPayments).filter(x=>x.loanId===record.id).map(x=>({kind:'EMI payment',date:x.paidOn,amount:Number(x.amount)||0})),...live(s.prepayments).filter(x=>x.loanId===record.id).map(x=>({kind:'Prepayment',date:x.paidOn,amount:Number(x.amount)||0}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
const sourceHistory=record=>sourcePayments(record.id).sort((a,b)=>String(b.settledOn||'').localeCompare(String(a.settledOn||'')))
const loanPosition=record=>{const loan=live(performanceSnapshot.value?.loans).find(x=>x.id===record.id)||record;return AdminReadModelService.getLoanPosition({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),asOf:AdminReadModelService.referenceNow()})}
const loanSchedule=record=>loanPosition(record).overdue||[]
const loanAmortizationSchedule=record=>(loanPosition(record).schedule||[]).map(row=>{
  const paid=Math.max(0,Number(row.scheduledInterestPaid)||0)+Math.max(0,Number(row.scheduledPrincipalPaid)||0)
  const due=Math.max(0,(Number(row.originalEmiAmount)||0)-paid)
  const fullyPaid=due<=1
  const dueDate=AdminReadModelService.dateKey(new Date(row.dueDate))
  const today=AdminReadModelService.dateKey(AdminReadModelService.referenceNow())
  const isPastDue=dueDate<today
  const isDue=dueDate<=today
  return {...row,dueDateKey:dueDate,paidScheduledAmount:paid,remainingScheduledAmount:due,paymentState:fullyPaid?'Paid':isPastDue?'Overdue':paid>0?'Partially paid':isDue?'Due':'Upcoming'}
})
function toggleLoanSchedule(loanId){expandedLoanSchedules.value={...expandedLoanSchedules.value,[loanId]:!expandedLoanSchedules.value[loanId]}}
const currentMonth=computed(()=>AdminReadModelService.dateKey(AdminReadModelService.referenceNow()).slice(0,7))
const currentMaintenanceRate=computed(()=>{const now=AdminReadModelService.dateKey(AdminReadModelService.referenceNow());return live(all.value.breakEvenInputs).filter(x=>String(x.values?.effectiveFrom||'')<=now).sort((a,b)=>String(b.values?.effectiveFrom||'').localeCompare(String(a.values?.effectiveFrom||'')))[0]||null})
const targetHistory=computed(()=>live(all.value.driverTarget).sort((a,b)=>String(b.values?.effectiveFrom||'').localeCompare(String(a.values?.effectiveFrom||''))))
const currentTarget=computed(()=>{
  const driverId=targetDraft.value.driverId
  const month=targetDraft.value.month||currentMonth.value
  const effectiveMonth=monthStart(month)
  const matches=live(all.value.driverTarget).filter(x=>x.values?.driverId===driverId&&String(x.values?.effectiveFrom||'')<=effectiveMonth)
  return matches.sort((a,b)=>String(b.values?.effectiveFrom||'').localeCompare(String(a.values?.effectiveFrom||'')))[0]||null
})
const currentTargetHistory=computed(()=>targetHistory.value.filter(x=>x.id!==currentTarget.value?.id))

const maintenanceHistory=computed(()=>live(all.value.breakEvenInputs).filter(x=>x.values?.maintenanceProvisionPerKm!=null).sort((a,b)=>String(b.values?.effectiveFrom||'').localeCompare(String(a.values?.effectiveFrom||''))))
const driverNames=computed(()=>Object.fromEntries(all.value.driver.map(x=>[x.id,label('driver',x)])))
const groupedItems=computed(()=>groupAdminNavigationItems(items,categories))
function readNotificationsPreference(){return ApplicationSettingsService.getNotificationsEnabled()}
function chooseNotifications(enabled){notificationsEnabled.value=ApplicationSettingsService.setNotificationsEnabled(enabled);clearMessages()}
function clearMessages(){error.value='';notice.value=''}
function onDraftError(cause){error.value=cause?.message||'Unable to preserve unfinished form draft.'}
function closeAction(){actionKey.value=null;actionRecord.value=null;actionDraft.value={};paymentCalculated.value=false;paymentConfirmed.value=false}
async function openItem(key, options = {}){
  if(isAdminSettingsItem(key)){clearMessages();selected.value=null;settingsOpen.value=true;settingsSelected.value=getAdminSettingsKey(key);return}
  clearMessages()
  if(key==='prepayment'&&!await beginDraftWorkflow('prepayment','PREPAYMENT'))return
  if(key==='driverTarget'&&!await beginDraftWorkflow('driver-target','EDIT_TARGET'))return
  if(key==='maintenanceRate'&&!await beginDraftWorkflow('maintenance-rate','EDIT_RATE'))return
  settingsOpen.value=false;selected.value=key;masterSelected.value=null;formOpen.value=false;editing.value=null;draft.value={};closeAction()
  if(key==='prepayment'){resetPrepayment();if(options.loanId)selectPrepaymentLoan(options.loanId)}
  if(key==='driverTarget')resetTarget()
  if(key==='maintenanceRate')resetMaintenanceRate()
  load()
}
function openMasterRecord(record){clearMessages();masterSelected.value=record.id;formOpen.value=false;editing.value=null;draft.value={}}
function backMasterList(){clearMessages();masterSelected.value=null;formOpen.value=false;editing.value=null;draft.value={}}
function masterFieldValue(field,record){const v=record?.values?.[field.key];if(v===undefined||v===null||v==='')return '—';if(field.type==='checkbox')return v?'Yes':'No';if(field.type==='select'){if(field.key==='vehicleId')return label('vehicle',all.value.vehicle.find(x=>x.id===v));if(field.key==='driverId')return label('driver',all.value.driver.find(x=>x.id===v));const opts=field.options||[];const found=opts.find(x=>x?.value===v);return found?.label||v}return String(v)}
function back(){selected.value=null;settingsOpen.value=false;formOpen.value=false;editing.value=null;draft.value={};closeAction();clearMessages()}
function openSettings(){clearMessages();selected.value=null;settingsOpen.value=true}
function openLoanPrepayment(record){return openItem('prepayment',{loanId:record.id})}
function chooseSetting(key){settingsSelected.value=key;clearMessages()}
async function add(){
  if(saving.value)return
  clearMessages();formErrors.value={}
  if(!await beginDraftWorkflow(selected.value||'source','CREATE'))return
  editing.value=null;draft.value=Object.fromEntries((currentDefinition.value?.fields||[]).map(field=>[field.key,field.defaultValue]));formOpen.value=true
}
async function edit(record){
  if(saving.value)return
  formErrors.value={}
  if(!await beginDraftWorkflow(selected.value||'source','EDIT',record.id))return
  editing.value=record.id;draft.value=clone(record.values||{});formOpen.value=true
}
function updateDraft(v){draft.value={...v}}
async function openAction(kind,record){
  const formId=kind==='loanPayment'?'loan-payment-'+record.id:'settlement-'+record.id
  const workflowStep=kind==='loanPayment'?'LOAN_PAYMENT':'SETTLEMENT'
  if(!await beginDraftWorkflow(formId,workflowStep,record.id))return
  actionKey.value=kind;actionRecord.value=record;paymentCalculated.value=false;paymentConfirmed.value=false
  const f=entityFinancial(record)
  actionDraft.value=kind==='loanPayment'?{loanId:record.id,paidOn:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()),amount:Math.max(0,Number(f?.overdue||f?.emi||0)),notes:''}:{settledOn:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()),amount:Math.max(0,Number(f?.remaining||0)),paymentMethod:'Cash',referenceNumber:'',notes:''}
}
const loanPaymentPreview=computed(()=>{if(actionKey.value!=='loanPayment'||!actionRecord.value||!paymentCalculated.value)return null;const loan=live(performanceSnapshot.value?.loans).find(x=>x.id===actionRecord.value.id)||actionRecord.value;return AdminReadModelService.previewPaymentAllocation({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),amount:Number(actionDraft.value.amount)||0,paidOn:actionDraft.value.paidOn})})
function resetPrepayment(){prepaymentDraft.value={loanId:'',paidOn:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()),amount:0,reason:'',notes:''};prepaymentCalculated.value=false;prepaymentConfirmed.value=false}
function selectPrepaymentLoan(id){const loan=all.value.loan.find(x=>x.id===id);const p=loan?AdminReadModelService.getLoanPosition({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),asOf:AdminReadModelService.referenceNow()}):null;prepaymentDraft.value={...prepaymentDraft.value,loanId:id,amount:Math.max(0,Number(p?.outstandingPrincipal||0))};prepaymentCalculated.value=false;prepaymentConfirmed.value=false}
const selectedPrepaymentLoan=computed(()=>all.value.loan.find(x=>x.id===prepaymentDraft.value.loanId)||null)
const selectedPrepaymentPosition=computed(()=>selectedPrepaymentLoan.value?AdminReadModelService.getLoanPosition({loan:selectedPrepaymentLoan.value,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),asOf:AdminReadModelService.referenceNow()}):null)
const prepaymentEstimate=computed(()=>{const loan=selectedPrepaymentLoan.value;if(!loan||!prepaymentCalculated.value)return null;const estimate=AdminReadModelService.estimatePrepayment({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),amount:Number(prepaymentDraft.value.amount)||0,paidOn:prepaymentDraft.value.paidOn});if(!estimate.available)return estimate;const h={id:'preview',loanId:loan.id,paidOn:prepaymentDraft.value.paidOn,amount:estimate.appliedAmount,status:'Applied'};const before=AdminReadModelService.getLoanPosition({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:live(performanceSnapshot.value?.prepayments),asOf:prepaymentDraft.value.paidOn});const after=AdminReadModelService.getLoanPosition({loan,payments:live(performanceSnapshot.value?.loanPayments),prepayments:[...live(performanceSnapshot.value?.prepayments),h],asOf:prepaymentDraft.value.paidOn});const bd=before.scheduledFinalDate?new Date(before.scheduledFinalDate):null,ad=after.scheduledFinalDate?new Date(after.scheduledFinalDate):null;return {...estimate,reducedMonths:bd&&ad?Math.max(0,Math.round((bd.getFullYear()-ad.getFullYear())*12+(bd.getMonth()-ad.getMonth()))):0,remainingAfter:after.outstandingPrincipal,interestRemainingAfter:after.remainingInterest}})
function resetTarget(){
  const month=currentMonth.value
  const current=live(all.value.driverTarget).filter(x=>String(x.values?.effectiveFrom||'')===monthStart(month)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null
  targetDraft.value={driverId:current?.values?.driverId||'',month,desiredDriverProfit:current?.values?.desiredDriverProfit??0,nonWorkingDates:Array.isArray(current?.values?.nonWorkingDates)?current.values.nonWorkingDates.join('\n'):String(current?.values?.nonWorkingDates||''),active:current?.values?.active!==false,notes:String(current?.values?.notes||'')}
}

function onTargetFieldChange({key,value}){targetDraft.value={...targetDraft.value,[key]:value};if(key==='driverId'||key==='month')syncTargetFromSelection()}
function onPrepaymentFieldChange({key,value}){if(key==='loanId'){selectPrepaymentLoan(value);return}prepaymentDraft.value={...prepaymentDraft.value,[key]:value};prepaymentCalculated.value=false;prepaymentConfirmed.value=false}
function onActionFieldChange({key,value}){actionDraft.value={...actionDraft.value,[key]:value};if(actionKey.value==='loanPayment'){paymentCalculated.value=false;paymentConfirmed.value=false}}
function submitTargetForm(values){targetDraft.value={...targetDraft.value,...values};saveTarget()}
function submitMaintenanceRateForm(values){maintenanceRateDraft.value={...maintenanceRateDraft.value,...values};saveMaintenanceRate()}
function submitPrepaymentForm(values){prepaymentDraft.value={...prepaymentDraft.value,...values};prepaymentCalculated.value=true}
function submitActionForm(values){actionDraft.value={...actionDraft.value,...values};if(actionKey.value==='loanPayment'){paymentCalculated.value=true;paymentConfirmed.value=false}else saveSourcePayment()}
function syncTargetFromSelection(){
  const current=currentTarget.value
  targetDraft.value={...targetDraft.value,desiredDriverProfit:current?.values?.desiredDriverProfit??0,nonWorkingDates:Array.isArray(current?.values?.nonWorkingDates)?current.values.nonWorkingDates.join('\n'):String(current?.values?.nonWorkingDates||'')}
}
function resetMaintenanceRate(){maintenanceRateDraft.value={rate:currentMaintenanceRate.value?.values?.maintenanceProvisionPerKm??'',changeDate:AdminReadModelService.dateKey(AdminReadModelService.referenceNow()),notes:String(currentMaintenanceRate.value?.values?.notes||'')}}
function monthStart(m){return (m||currentMonth.value)+'-01'}
async function saveTarget(){if(loading.value)return;clearMessages();loading.value=true;try{if(!targetDraft.value.driverId||Number(targetDraft.value.desiredDriverProfit)<0)throw new Error('Driver and monthly target are required.');await AdminService.save('driverTarget',{driverId:targetDraft.value.driverId,effectiveFrom:monthStart(targetDraft.value.month),desiredDriverProfit:Number(targetDraft.value.desiredDriverProfit),nonWorkingDates:String(targetDraft.value.nonWorkingDates||''),active:targetDraft.value.active!==false,notes:String(targetDraft.value.notes||'')});await clearFormDraft(targetFormDraftIdentity.value);notice.value='Monthly driver target saved.';await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Unable to save target.'}finally{loading.value=false}}
async function saveMaintenanceRate(){if(loading.value)return;clearMessages();loading.value=true;try{const rate=Number(maintenanceRateDraft.value.rate);if(!Number.isFinite(rate)||rate<0)throw new Error('Maintenance per KM must be zero or greater.');await AdminService.save('breakEvenInputs',{effectiveFrom:maintenanceRateDraft.value.changeDate,maintenanceProvisionPerKm:rate,notes:String(maintenanceRateDraft.value.notes||'')});await clearFormDraft(maintenanceRateFormDraftIdentity.value);notice.value='Maintenance per KM rate saved.';await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Unable to save rate.'}finally{loading.value=false}}
function clearFieldError({key}){if(!(key in formErrors.value))return;const next={...formErrors.value};delete next[key];formErrors.value=next}
function onSourceFieldChange(change){draft.value={...draft.value,[change.key]:change.value};clearFieldError(change)}
async function save(values){if(saving.value)return;clearMessages();formErrors.value={};saving.value=true;try{
  const id=editing.value
  const draftIdentity = sourceFormDraftIdentity.value
  const sourceType=selected.value==='maintenance'?'Maintenance':'Compliance'
  const isSource=selected.value==='compliance'||selected.value==='maintenance'
  const payload=isSource?{...values,cost:Number(values.cost)||0}:values
   const saved=await AdminService.save(selected.value,payload,id)
   await clearFormDraft(draftIdentity)
   // Source records are obligations/expense facts. Actual cash settlement is a
   // separate authoritative record with its own actual payment date.
   // Never synthesize a payment merely because a source record was saved.
   notice.value=(id!==null?'Record updated.':'Record created.');formOpen.value=false;editing.value=null;await load()
}catch(e){formErrors.value=e.validation&&typeof e.validation==='object'?e.validation:{};error.value=e.validation?Object.values(e.validation).flat().join(' '):e.message||'Save failed.'}finally{saving.value=false}}
async function saveLoanPayment(){if(loading.value)return;clearMessages();loading.value=true;try{await AdminService.save('loanPayment',{...actionDraft.value,amount:Number(actionDraft.value.amount)});await clearFormDraft(actionFormDraftIdentity.value);notice.value='Loan payment recorded.';closeAction();await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Payment failed.'}finally{loading.value=false}}
async function saveSourcePayment(){if(loading.value)return;clearMessages();loading.value=true;try{await AdminService.save('settlement',{settlementType:'Payment',sourceType:selected.value==='maintenance'?'Maintenance':'Compliance',sourceId:actionRecord.value.id,settledOn:actionDraft.value.settledOn,amount:Number(actionDraft.value.amount),paymentMethod:actionDraft.value.paymentMethod,referenceNumber:String(actionDraft.value.referenceNumber||''),notes:String(actionDraft.value.notes||'')});await clearFormDraft(actionFormDraftIdentity.value);notice.value='Payment recorded.';closeAction();await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Payment failed.'}finally{loading.value=false}}
async function recordPrepayment(){if(loading.value||!prepaymentEstimate.value?.available||!prepaymentConfirmed.value)return;clearMessages();loading.value=true;try{await AdminService.save('prepayment',{loanId:prepaymentDraft.value.loanId,paidOn:prepaymentDraft.value.paidOn,amount:prepaymentEstimate.value.appliedAmount,reason:String(prepaymentDraft.value.reason||''),notes:String(prepaymentDraft.value.notes||'')});await clearFormDraft(prepaymentFormDraftIdentity.value);notice.value='Prepayment recorded.';resetPrepayment();await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Prepayment failed.'}finally{loading.value=false}}
async function remove(record){if(!confirm('Delete this record? Related records may prevent deletion.'))return;clearMessages();loading.value=true;try{await AdminService.remove(selected.value,record.id);notice.value='Record deleted.';await load()}catch(e){error.value=e.message||'Delete failed.'}finally{loading.value=false}}
async function resetData(){if(!confirm('Reset all KFE data? Business records will be erased and application preferences restored to defaults. A recovery checkpoint will be retained.'))return;if(!confirm('Final confirmation: erase all current KFE business records and reset application preferences to defaults? A recovery checkpoint will be retained.'))return;loading.value=true;clearMessages();try{await BackupService.resetData();const defaults=ApplicationSettingsService.resetPreferences();notificationsEnabled.value=defaults.notificationsEnabled;notice.value='All canonical KFE data has been reset. Application preferences restored to defaults.'}catch(e){error.value=e.message||'Data reset failed.'}finally{loading.value=false}}
async function load(){loading.value=true;error.value='';try{for(const k of Object.keys(all.value))all.value[k]=await AdminService.list(k);records.value=selected.value&&!['prepayment','driverTarget','maintenanceRate','ledger','calculations'].includes(selected.value)?await AdminService.list(selected.value):[];performanceSnapshot.value=await PerformanceService.getSnapshot()}catch(e){error.value=e.message||'Unable to load Admin data.'}finally{loading.value=false}}
onMounted(()=>{load()})
</script>

<template>
<AdminShell
  :show-back="Boolean(selected || settingsOpen)"
  :title="settingsOpen ? 'Settings' : selected ? (currentItem?.title || 'Admin') : 'Admin'"
  :settings-open="settingsOpen"
  @back="back"
  @toggle-settings="settingsOpen ? settingsOpen=false : openSettings()"
>


<template v-if="!selected&&!settingsOpen">
  <header class="admin-hero">
    <div class="admin-hero-kicker">ADMINISTRATION</div>
    <h1>Business control centre</h1>
    <p>Manage the source records and planning inputs behind KFE calculations. Changes are validated and saved through the authoritative Admin service.</p>
    <div class="admin-hero-foot"><span><strong>{{categories.length}}</strong> Admin sections</span><button type="button" class="admin-hero-settings" @click="openSettings">Settings <span aria-hidden="true">↗</span></button></div>
  </header>
  <div class="admin-workspace">
    <section v-for="group in groupedItems" :key="group.category" class="admin-category">
      <div class="admin-category-heading"><span class="category-label">{{group.category}}</span><span class="admin-category-count">{{group.items.length}}</span></div>
      <div class="admin-category-grid">
        <button v-for="item in group.items" :key="item.key" type="button" class="admin-item" @click="openItem(item.key)">
          <span class="admin-item-icon" aria-hidden="true">{{item.icon}}</span>
          <span class="admin-item-copy"><strong>{{item.title}}</strong><small>{{item.key==='businessSetup'?'Set the business start boundary':item.key==='vehicle'?'Vehicle identity and lifecycle':item.key==='driver'?'Driver identity and assignment':item.key==='compliance'?'Validity and compliance cost':item.key==='maintenance'?'Authoritative actual maintenance':item.key==='settingsBackup'?'Export, restore and protect KFE data':item.key==='settingsApplication'?'Theme and notification preferences':item.key==='settingsReset'?'Reset business data with recovery safeguards':'Loan terms, payments, prepayments and repayment schedule'}}</small></span>
          <span class="admin-item-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </div>
</template>

<template v-else-if="settingsOpen">
<section class="settings-screen"><div class="settings-menu"><button v-for="item in settingsMenu" :key="item.key" class="settings-item" :class="{active:settingsSelected===item.key}" @click="chooseSetting(item.key)"><span>{{item.icon}}</span><strong>{{item.title}}</strong><span>›</span></button></div><section v-if="settingsSelected==='backup'" class="settings-panel"><h2>Backup &amp; Restore</h2><BackupRestorePanel/></section><section v-else-if="settingsSelected==='application'" class="settings-panel"><h2>Application Settings</h2><div class="application-setting"><strong>Appearance</strong><p>Dark theme is always enabled in KFE.</p></div><div class="application-setting"><strong>Notifications</strong><p>Save your preference for KFE app notifications. Native Work action controls remain independent.</p><label class="notification-toggle"><input type="checkbox" :checked="notificationsEnabled" @change="chooseNotifications($event.target.checked)"><span>Enable notifications</span></label></div></section><section v-else class="settings-panel"><h2>Data Reset</h2><p>This permanently clears canonical KFE business records.</p><p class="reset-safety-note">Before resetting, create a phone backup JSON file and keep it somewhere you control. KFE retains a private recovery checkpoint, but that internal copy is not a substitute for your own exported backup.</p><button class="danger-button" :disabled="loading" @click="resetData">Reset all data</button></section></section>
</template>

<template v-else-if="selected==='calculations'">
<CalculationsView/>
</template>

<template v-else>
<section class="detail-screen"><div class="detail-title"><span class="item-icon">{{currentItem.icon}}</span><div><div class="category-label">{{currentItem.category}}</div><h1>{{currentItem.title}}</h1></div></div><p v-if="error" class="message error">{{error}}</p><p v-if="notice" class="message notice">✓ {{notice}}</p>

<template v-if="selected==='driverTarget'">
<section class="clean-card">
  <div class="card-heading">
    <div><strong>Current monthly driver profit target</strong><span v-if="currentTarget">Active for {{targetDraft.month}}</span><span v-else>No monthly driver profit is currently set for {{targetDraft.month}}</span></div>
    <strong class="big-value">{{currentTarget?money(currentTarget.values?.desiredDriverProfit):'—'}} / month</strong>
  </div>
  <AdminSourceForm :fields="targetFields" :model-value="targetDraft" :draft-identity="targetFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="onTargetFieldChange" @submit="submitTargetForm" @draft-error="onDraftError"/>
  <p class="rule-note">This is the driver-entered monthly profit / take-home amount. Break-even and maintenance-per-KM are calculated separately and added by the target engine. Saving a new amount replaces the current amount for the selected month; the previous value remains in history.</p>
  <button class="primary wide" :disabled="loading||!targetDraft.driverId" @click="saveTarget">Save new target</button>
</section>
<section class="history-card">
  <div class="category-label">TARGET HISTORY</div>
  <article v-for="row in currentTargetHistory" :key="row.id" class="history-row">
    <div><strong>{{driverNames[row.values?.driverId]||row.values?.driverId}}</strong><span>{{String(row.values?.effectiveFrom||'').slice(0,7)}}</span></div>
    <strong>{{money(row.values?.desiredDriverProfit)}} / month</strong>
  </article>
  <div v-if="!currentTargetHistory.length" class="empty">No previous targets yet.</div>
</section>
</template>

<template v-else-if="selected==='maintenanceRate'">
<section class="clean-card"><div class="card-heading"><div><strong>Current maintenance per KM</strong><span>Effective from {{currentMaintenanceRate?.values?.effectiveFrom||'—'}}</span></div><strong class="big-value">{{currentMaintenanceRate?.values?.maintenanceProvisionPerKm!=null?'₹'+Number(currentMaintenanceRate.values.maintenanceProvisionPerKm).toFixed(2):'—'}} / km</strong></div><AdminSourceForm :fields="[{key:'rate',label:'New rate per KM',type:'number',section:'Effective-dated planning input',required:true,min:0,step:0.01},{key:'changeDate',label:'Change date',type:'date',section:'Effective-dated planning input',required:true},{key:'notes',label:'Notes',type:'textarea',section:'Additional context'}]" :model-value="maintenanceRateDraft" :draft-identity="maintenanceRateFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="(change)=>{maintenanceRateDraft={...maintenanceRateDraft,[change.key]:change.value}}" @submit="submitMaintenanceRateForm" @draft-error="onDraftError"/>
<p class="rule-note">The new rate applies from the change date until another change is made. Historical calculations use the rate applicable on their original date.</p><button class="primary wide" :disabled="loading" @click="saveMaintenanceRate">Save new rate</button></section><section class="history-card"><div class="category-label">RATE HISTORY</div><article v-for="row in maintenanceHistory" :key="row.id" class="history-row"><div><strong>{{row.values?.effectiveFrom}}</strong></div><strong>₹{{Number(row.values?.maintenanceProvisionPerKm||0).toFixed(2)}} / km</strong></article><div v-if="!maintenanceHistory.length" class="empty">No rate history yet.</div></section>
</template>

<template v-else-if="selected==='ledger'">
<section class="clean-card ledger-card">
  <div class="card-heading"><div><strong>Finance Ledger</strong><span>Read-only historical source records</span></div></div>
  <FinanceLedgerPanel :snapshot="performanceSnapshot||{}"/>
</section>
</template>

<template v-else-if="selected==='prepayment'">
<section class="clean-card"><div class="card-heading"><strong>Loan prepayment</strong><span>Calculate first. Nothing is recorded until confirmation.</span></div><AdminSourceForm :fields="prepaymentFields" :model-value="prepaymentDraft" :draft-identity="prepaymentFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="onPrepaymentFieldChange" @submit="submitPrepaymentForm" @draft-error="onDraftError"/>
<button class="primary wide" :disabled="!prepaymentDraft.loanId||Number(prepaymentDraft.amount)<=0||loading" @click="prepaymentCalculated=true">Calculate effect</button><div v-if="prepaymentCalculated&&prepaymentEstimate" class="calculation-box"><div v-if="prepaymentEstimate.available" class="metric-grid"><div><span>Prepayment</span><strong>{{money(prepaymentEstimate.appliedAmount)}}</strong></div><div><span>Remaining after</span><strong>{{money(prepaymentEstimate.remainingAfter)}}</strong></div><div><span>Reduced tenure</span><strong>{{prepaymentEstimate.reducedMonths}} months</strong></div><div><span>Interest remaining</span><strong>{{money(prepaymentEstimate.interestRemainingAfter)}}</strong></div></div><p v-else class="message error">{{prepaymentEstimate.reason}}</p><template v-if="prepaymentEstimate.available"><label class="confirm-line"><input :checked="prepaymentConfirmed" type="checkbox" @change="prepaymentConfirmed=$event.target.checked"> I confirm this calculated prepayment.</label><button class="primary wide" :disabled="!prepaymentConfirmed||loading" @click="recordPrepayment">Continue to pay</button></template></div></section>
</template>

<template v-else-if="masterMode">
<div v-if="!masterSelected">
  <div class="detail-actions"><button class="primary" @click="add">＋ Create {{currentDefinition?.createLabel||currentItem.title}}</button></div>
  <section v-if="selected==='maintenance'" class="clean-card provision-total">
  <div><span>Maintenance provision</span><strong>{{money(maintenanceProvisionTotal)}}</strong></div>
  <div class="metric-grid"><div><span>Maintenance pool balance</span><strong>{{money(maintenanceProvisionBalance)}}</strong></div></div>
</section>
  <div v-if="formOpen"><AdminSourceForm :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="editing===null" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" :submit-label="editing!==null?'Update record':'Save record'" @draft-error="onDraftError"/></div>
  <div v-if="loading&&!records.length" class="empty">Loading…</div>
  <div v-else-if="records.length" class="record-list">
    <button v-for="record in records" :key="record.id" class="clean-card master-list-row" @click="openMasterRecord(record)">
      <span><strong>{{label(selected,record)}}</strong><small>{{selected==='vehicle'?[record.values?.registrationNumber,record.values?.make,record.values?.model].filter(Boolean).join(' · '):selected==='driver'?[record.values?.phone,record.values?.licenseNumber].filter(Boolean).join(' · '):[record.values?.validFrom,record.values?.validUntil].filter(Boolean).join(' → ')}}</small>
      <small v-if="selected==='compliance'">Cost {{money(record.values?.cost)}}</small></span><span>›</span>
    </button>
  </div>
  <div v-else-if="!loading" class="empty">No records yet.</div>
</div>
<div v-else>
  <div class="detail-actions"><button class="secondary" @click="backMasterList">‹ {{currentItem.title}} list</button><button class="primary" @click="edit(masterRecord)">Edit {{currentItem.title}}</button></div>
  <section class="clean-card master-detail-card">
    <div class="master-detail-heading"><strong>{{label(selected,masterRecord)}}</strong><span>{{masterRecord?.updatedAt||'—'}}</span></div>
    <div class="master-fields"><div v-for="field in currentDefinition.fields" :key="field.key" class="master-field"><span>{{field.label}}</span><strong>{{masterFieldValue(field,masterRecord)}}</strong></div></div>
  </section>
  <section v-if="selected==='compliance'" class="clean-card">
    <div class="metric-grid"><div><span>Cost</span><strong>{{money(masterRecord?.values?.cost)}}</strong></div><div><span>Paid</span><strong>{{money(entityFinancial(masterRecord)?.paid)}}</strong></div><div><span>Remaining cost</span><strong>{{money(entityFinancial(masterRecord)?.remaining)}}</strong></div></div>
    <div class="calculation-box"><div class="metric-grid"><div><span>Revenue observed</span><strong>{{money(complianceRevenueSummary(masterRecord).total)}}</strong></div><div><span>Revenue days</span><strong>{{complianceRevenueSummary(masterRecord).days}}</strong></div><div><span>Average revenue / day</span><strong>{{money(complianceRevenueSummary(masterRecord).average)}}</strong></div></div></div>
    <button class="secondary wide" @click="openAction('settlement',masterRecord)">Record payment</button>
    <div v-if="sourceHistory(masterRecord).length" class="history-inline"><span>Payment history</span><small v-for="x in sourceHistory(masterRecord).slice(0,5)" :key="x.id">{{x.settledOn?.slice(0,10)}} · {{money(x.amount)}}</small></div>
    <div v-if="actionRecord?.id===masterRecord.id&&actionKey==='settlement'" class="calculation-box"><AdminSourceForm :fields="settlementFields" :model-value="actionDraft" :draft-identity="actionFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="onActionFieldChange" @submit="submitActionForm" @draft-error="onDraftError"/><button class="primary wide" :disabled="Number(actionDraft.amount)<=0||loading" @click="saveSourcePayment">Confirm &amp; record payment</button></div>
  </section>
  <AdminSourceForm v-if="formOpen" :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="false" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" submit-label="Update record" @draft-error="onDraftError"/>
  <div class="record-footer"><button class="text-button" @click="remove(masterRecord)">Delete</button></div>
</div>
</template>
<template v-else>
<div class="detail-actions"><button class="primary" @click="add">＋ Create {{currentDefinition?.createLabel||currentItem.title}}</button></div><AdminSourceForm v-if="formOpen" :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="editing===null" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" @draft-error="onDraftError" :submit-label="editing!==null?'Update record':'Save record'"/><div v-if="loading&&!records.length" class="empty">Loading…</div><div v-else-if="records.length" class="record-list"><article v-for="record in records" :key="record.id" class="clean-card record-card"><div class="record-top"><div><strong>{{label(selected,record)}}</strong><span>{{record.updatedAt||'—'}}</span></div><button class="text-button" @click="edit(record)">Edit</button></div><div v-if="selected==='loan'&&entityFinancial(record)" class="loan-summary"><div v-if="entityFinancial(record).remaining<=0" class="paid-banner">LOAN FULLY PAID</div><div class="metric-grid"><div><span>Loan amount</span><strong>{{money(entityFinancial(record).principal)}}</strong></div><div><span>EMI</span><strong>{{money(entityFinancial(record).emi)}}</strong></div><div><span>Pending</span><strong>{{money(entityFinancial(record).pending)}}</strong></div><div><span>Delayed</span><strong>{{money(entityFinancial(record).overdue)}}</strong></div><div><span>Remaining</span><strong>{{money(entityFinancial(record).remaining)}}</strong></div></div><div v-if="loanSchedule(record).length" class="loan-due"><strong>Delayed / unpaid EMIs</strong><div v-for="row in loanSchedule(record)" :key="row.id" class="history-row"><span>EMI {{row.emiNumber}} · {{AdminReadModelService.dateKey(new Date(row.dueDate))}}</span><strong>{{money(row.originalEmiAmount)}} · {{money(row.unpaidOverdueInterest||0)}} delayed interest</strong></div></div><button class="secondary wide" type="button" :aria-expanded="Boolean(expandedLoanSchedules[record.id])" @click="toggleLoanSchedule(record.id)">{{expandedLoanSchedules[record.id]?'Hide':'View'}} amortization schedule ({{loanAmortizationSchedule(record).length}} EMIs)</button><div v-if="expandedLoanSchedules[record.id]" class="loan-amortization" role="region" :aria-label="'Amortization schedule for '+label('loan',record)"><div class="loan-amortization-row loan-amortization-heading"><span>EMI / due date</span><span>Principal</span><span>Interest</span><span>Paid</span><span>Status</span></div><div v-for="row in loanAmortizationSchedule(record)" :key="row.id" class="loan-amortization-row"><span>EMI {{row.emiNumber}}<small>{{row.dueDateKey}}</small></span><span>{{money(row.originalPrincipalComponent)}}</span><span>{{money(row.originalInterestComponent)}}</span><span>{{money(row.paidScheduledAmount)}}<small v-if="row.remainingScheduledAmount>1">Remaining {{money(row.remainingScheduledAmount)}}</small></span><span :class="'schedule-state schedule-state-'+row.paymentState.toLowerCase().replace(' ','-')">{{row.paymentState}}</span></div><p class="rule-note">EMIs are marked Paid only from saved payment allocations when the scheduled amount remaining is ₹1 or less. Unrecorded or unsaved payments do not change this schedule.</p></div><button v-if="entityFinancial(record).remaining>0" class="secondary wide" @click="openAction('loanPayment',record)">Record payment</button><button v-if="entityFinancial(record).remaining>0" class="secondary wide" @click="openLoanPrepayment(record)">Record prepayment</button><div v-if="loanHistory(record).length" class="history-inline"><span>Payment history</span><small v-for="x in loanHistory(record).slice(0,5)" :key="x.kind+x.date+x.amount">{{x.kind}} · {{x.date?.slice(0,10)}} · {{money(x.amount)}}</small></div><div v-if="actionRecord?.id===record.id&&actionKey==='loanPayment'" class="calculation-box"><AdminSourceForm :fields="loanPaymentFields" :model-value="actionDraft" :draft-identity="actionFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="onActionFieldChange" @submit="submitActionForm" @draft-error="onDraftError"/><button class="primary wide" :disabled="Number(actionDraft.amount)<=0||loading" @click="paymentCalculated=true;paymentConfirmed=false">Calculate payment</button><div v-if="loanPaymentPreview?.available" class="metric-grid"><div v-for="a in loanPaymentPreview.allocations" :key="a.obligationId"><span>EMI {{a.obligationId.split(':').at(-1)}}</span><strong>{{money((a.overdueInterest||0)+(a.scheduledInterest||0)+(a.scheduledPrincipal||0))}}</strong></div></div><p v-else-if="loanPaymentPreview" class="message error">{{loanPaymentPreview.reason}}</p><label v-if="loanPaymentPreview?.available" class="confirm-line"><input :checked="paymentConfirmed" type="checkbox" @change="paymentConfirmed=$event.target.checked"> I confirm this payment allocation.</label><button v-if="loanPaymentPreview?.available" class="primary wide" :disabled="!paymentConfirmed||loading" @click="saveLoanPayment">Confirm &amp; record payment</button></div></div><template v-else-if="selected==='maintenance'"><div class="loan-summary"><div class="metric-grid"><div><span>Actual maintenance cost</span><strong>{{money(entityFinancial(record).cost)}}</strong></div><div><span>Total maintenance provision</span><strong>{{money(maintenanceProvisionTotal)}}</strong></div><div><span>Total maintenance paid</span><strong>{{money(performanceProvisionMetrics?.maintenancePayments||0)}}</strong></div><div><span>Maintenance pool balance</span><strong>{{money(maintenanceProvisionBalance)}}</strong></div></div><button class="secondary wide" @click="openAction('settlement',record)">Record payment</button><div v-if="sourceHistory(record).length" class="history-inline"><span>Payment history</span><small v-for="x in sourceHistory(record).slice(0,5)" :key="x.id">{{x.settledOn?.slice(0,10)}} · {{money(x.amount)}}</small></div><div v-if="actionRecord?.id===record.id&&actionKey==='settlement'" class="calculation-box"><AdminSourceForm :fields="settlementFields" :model-value="actionDraft" :draft-identity="actionFormDraftIdentity" :busy="loading" :show-actions="false" @field-change="onActionFieldChange" @submit="submitActionForm" @draft-error="onDraftError"/><button class="primary wide" :disabled="Number(actionDraft.amount)<=0||loading" @click="saveSourcePayment">Confirm &amp; record payment</button></div></div></template><div class="record-footer"><button class="text-button" @click="remove(record)">Delete</button></div></article></div><div v-else-if="!loading" class="empty">No records yet.</div>
</template>
</section>
</template>
</AdminShell>
</template>
