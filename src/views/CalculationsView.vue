<script setup>
import { computed, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { getKfeReferenceNow, reportingRangeFor } from '../domain/time/ist.js'

const loading=ref(false), error=ref(''), snapshot=ref(null), metrics=ref(null), selected=ref(null), period=ref('MONTH')
const num=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-IN',{maximumFractionDigits:2}):'—'
const live=xs=>(xs||[]).filter(x=>!x?.deletedAt&&!x?.deleted)

const baseCalculations=[
 {id:'actual-pl',name:'Actual Profit / Loss',group:'PROFITABILITY',key:'actualProfitLoss',chain:['Canonical revenue','Fuel actuals','Toll / parking','Maintenance actuals','Financing cash payments','Actual P/L'],explain:'Uses recorded actual business facts; provisions are not treated as payments.'},
 {id:'provisional-pl',name:'Provisional Profit / Loss',group:'PROFITABILITY',key:'provisionalProfitLoss',chain:['Revenue','Actual expenses','Outstanding/provision buckets','Provisional P/L'],explain:'Extends the performance view with the applicable provisional expense burden.'},
 {id:'monthly-be',name:'Monthly Break-even',group:'TARGET & BREAK-EVEN',key:'monthlyBreakEvenRevenue',chain:['Break-even Input','Fuel cost / KM','Vehicle KM','Loan obligation','Pre-business recovery','Renewal provision','Maintenance / KM','Monthly Break-even'],explain:'Authoritative only when all required upstream evidence is complete.'},
 {id:'daily-be',name:'Daily Break-even',group:'TARGET & BREAK-EVEN',key:'dailyBreakEvenRevenue',chain:['Monthly Break-even','Calendar days in target month','Daily Break-even'],explain:'Allocates the authoritative monthly requirement across calendar days.'},
 {id:'driver-target',name:'Driver Target',group:'TARGET & BREAK-EVEN',key:'driverTarget',chain:['Monthly Break-even','Admin driver profit / take-home','Monthly target base','Current driver target'],explain:'Depends on the authoritative monthly break-even and applicable Driver Target input.'},
 {id:'fuel-cost-km',name:'Fuel Cost / KM',group:'OPERATING COSTS',key:'fuelCostPerKm',chain:['Qualifying fuel records','Full-tank evidence','Fuel quantity / cost','Fuel cost / KM'],explain:'The displayed rate is evidence-sensitive; provisional evidence must be visible as such.'},
 {id:'maintenance-km',name:'Maintenance / KM',group:'OPERATING COSTS',key:'maintenanceProvisionPerKm',chain:['Effective Break-even Input','Maintenance provision / KM'],explain:'The indicative/provision rate comes from the applicable effective Break-even Input.'},
 {id:'loan-burden',name:'Loan / EMI burden',group:'FINANCE',key:'scheduledEmi',chain:['Loan contract','Loan payments','Prepayments','Scheduled obligation','Outstanding position'],explain:'Loan position is derived from the canonical loan and payment records.'},
 {id:'prebusiness',name:'Pre-business recovery',group:'FINANCE',key:'preBusinessRecovery',chain:['Business Start Date','Qualifying pre-business burden','12-month date-to-date recovery','Recovery burden'],explain:'Only supported pre-business recovery categories belong in this calculation.'},
 {id:'shift-km',name:'Shift KM',group:'MOVEMENT',key:'shiftKm',chain:['Shift start odometer','Shift end odometer','Total vehicle KM'],explain:'Vehicle KM is the odometer delta; it is not reconstructed from trip distance.'},
 {id:'trip-km',name:'Trip KM',group:'MOVEMENT',key:'tripKm',chain:['Native GPS evidence','Haversine fallback','Async road matching','Completed trip movement'],explain:'Completed-trip enrichment never blocks fare entry; GPS/Haversine remains the fallback.'},
 {id:'dead-km',name:'Dead KM',group:'MOVEMENT',key:'deadKm',chain:['Shift KM','Trip KM','Personal KM','Dead KM reconciliation'],explain:'Dead KM is reconciled from the authoritative shift movement allocation.'},
 {id:'personal-km',name:'Personal KM',group:'MOVEMENT',key:'personalKm',chain:['Shift-start gap allocation','Personal KM','Business movement reconciliation'],explain:'Personal KM is allocated at shift start and excluded from business operating calculations.'},
 {id:'revenue',name:'Revenue reconciliation',group:'REVENUE',key:'revenue',chain:['Completed shift revenue','Completed trip fares','Cancellation records','Revenue reconciliation'],explain:'Completed shift revenue is the ERP revenue authority; trip fares are supporting detail.'},
 {id:'period-totals',name:'Day / Week / Month totals',group:'REPORTING',key:'periodTotals',chain:['Business Start Date','IST reporting range','Canonical records','Performance metrics','Period totals'],explain:'Reporting periods are bounded by Business Start Date.'},
 {id:'timeline',name:'Timeline figures',group:'REPORTING',key:'timeline',chain:['Canonical events','Revenue','Movement','Expenses','Finance','Timeline read model'],explain:'Timeline is a read model; it must agree with the canonical calculations.'},
 {id:'performance',name:'Performance figures',group:'REPORTING',key:'performance',chain:['Performance snapshot','Authoritative calculations','Daily / Weekly / Monthly','Performance display'],explain:'Performance consumes canonical calculation outputs rather than maintaining a parallel business-rule engine.'}
]

function rangeFor(p){const now=getKfeReferenceNow();return reportingRangeFor(p,now)}
async function load(){
 loading.value=true;error.value=''
 try{
   snapshot.value=await PerformanceService.getSnapshot()
   metrics.value=PerformanceService.getMetrics(snapshot.value,rangeFor(period.value))
 }catch(e){error.value=e.message||'Unable to run calculation sanity check.'}
 finally{loading.value=false}
}
onMounted(load)

const diagnostics=computed(()=>metrics.value?PerformanceService.getDiagnostics(metrics.value)||{}:{})
const statusFor=computed(()=>id=>{
 const m=metrics.value||{}, d=diagnostics.value
 if(id==='monthly-be') return d.breakEven?'ISSUE':(m.completeness?.breakEven?'OK':'INCOMPLETE')
 if(id==='daily-be') return d.dailyBreakEven?'ISSUE':(m.dailyBreakEven?.status==='AUTHORITATIVE'?'OK':'INCOMPLETE')
 if(id==='driver-target') return d.target?'ISSUE':(m.driverTargetAvailable?'OK':'INCOMPLETE')
 if(id==='maintenance-km') return Number.isFinite(Number(m.breakEvenInputs?.maintenanceProvisionPerKm))||Number.isFinite(Number(m.maintenanceProvisionPerKm))?'OK':'INCOMPLETE'
 if(id==='fuel-cost-km') return m.breakEvenInputs?.fuelEvidence?.status==='AUTHORITATIVE'?'OK':m.breakEvenInputs?.fuelEvidence?.status==='INDICATIVE'?'INCOMPLETE':'MISSING'
 if(id==='actual-pl') return Number.isFinite(Number(m.performanceHeadlineActualProfit??m.actualProfit))?'OK':'INCOMPLETE'
 if(id==='provisional-pl') return Number.isFinite(Number(m.performanceHeadlineProvisionalProfit??m.indicativeProfit))?'OK':'INCOMPLETE'
 if(id==='shift-km') return Number(m.vehicleKm??m.totalShiftKm)>=0?'OK':'MISSING'
 if(id==='trip-km') return m.businessKmIntegrityStatus==='COMPLETE'?'OK':m.businessKmIntegrityStatus==='OVER_ESTIMATE'?'ISSUE':'INCOMPLETE'
 if(id==='dead-km') return Number(m.deadKm??0)>=0?'OK':'MISSING'
 if(id==='personal-km') return Number(m.personalKm??0)>=0?'OK':'MISSING'
 if(id==='revenue') return Number.isFinite(Number(m.revenue))?'OK':'MISSING'
 if(id==='period-totals'||id==='timeline'||id==='performance') return 'OK'
 if(id==='loan-burden') return live(snapshot.value?.loans).length?'OK':'INCOMPLETE'
 if(id==='prebusiness') return metrics.value?.breakEvenInputs?'OK':'INCOMPLETE'
 return 'OK'
})
const issueRows=computed(()=>{
 const rows=baseCalculations.map(x=>({...x,status:statusFor.value(x.id)}))
 const d=diagnostics.value
 const issueDetails=[
  d.breakEven,d.target,d.dailyBreakEven,d.provision
 ].filter(Boolean)
 return rows.filter(x=>x.status!=='OK').map(x=>{
   const detail=issueDetails.find(y=>String(y.calculation||'').toLowerCase().includes(x.name.toLowerCase().split(' ')[0]))
   return {...x,detail}
 })
})
const allRows=computed(()=>baseCalculations.map(x=>({...x,status:statusFor.value(x.id)})))
const statusIcon=s=>s==='OK'?'🟢':s==='ISSUE'?'🔴':s==='INCOMPLETE'?'🟡':'⚪'
const statusText=s=>s==='OK'?'Correct':s==='ISSUE'?'Issue':s==='INCOMPLETE'?'Incomplete':'Not available'
const valueFor=id=>{
 const m=metrics.value||{}
 const map={
  'actual-pl':m.performanceHeadlineActualProfit??m.actualProfit,
  'provisional-pl':m.performanceHeadlineProvisionalProfit??m.indicativeProfit,
  'monthly-be':m.monthlyBreakEvenRevenue,
  'daily-be':m.dailyBreakEvenRevenue,
  'driver-target':m.driverTarget,
  'fuel-cost-km':m.breakEvenInputs?.fuelCostPerKm??m.fuelCostPerKm,
  'maintenance-km':m.breakEvenInputs?.maintenanceProvisionPerKm??m.maintenanceProvisionPerKm,
  'loan-burden':m.breakEvenInputs?.scheduledEmiMonthly??m.scheduledEmi,
  'prebusiness':m.breakEvenInputs?.preBusinessRecoveryMonthly??m.preBusinessRecovery,
  'shift-km':m.vehicleKm??m.totalShiftKm,
  'trip-km':m.tripKm??m.businessKm,
  'dead-km':m.deadKm,
  'personal-km':m.personalKm,
  'revenue':m.revenue
 }
 if(id==='period-totals'||id==='timeline'||id==='performance') return 'Read model'
 return map[id]===undefined?'—':num(map[id])
}
function detailFor(row){selected.value=selected.value===row.id?null:row.id}
</script>

<template>
<section class="calc-page" aria-label="Calculation Sanity Check">
  <header class="calc-header">
    <div><div class="eyebrow">ADMIN · CALCULATIONS</div><h1>Calculations</h1><p>End-to-end calculation sanity check. Issues are surfaced first.</p></div>
    <button class="refresh" :disabled="loading" @click="load">{{loading?'Checking…':'↻ Check now'}}</button>
  </header>
  <div class="period-row">
    <button v-for="p in ['DAY','WEEK','MONTH']" :key="p" :class="{active:period===p}" @click="period=p;load()">{{p}}</button>
  </div>
  <p v-if="error" class="calc-error">{{error}}</p>
  <section v-if="!loading&&issueRows.length" class="issues">
    <div class="section-title"><strong>Issues first</strong><span>{{issueRows.length}} item{{issueRows.length===1?'':'s'}} need attention</span></div>
    <article v-for="row in issueRows" :key="'issue-'+row.id" class="calc-card issue-card" @click="detailFor(row)">
      <div class="card-top"><span>{{statusIcon(row.status)}} {{statusText(row.status)}}</span><strong>{{row.name}}</strong><span>{{valueFor(row.id)}}</span></div>
      <p>{{row.detail?.why||'An upstream input or authoritative result is unavailable for this calculation.'}}</p>
      <small v-if="row.detail?.fix">Fix: {{row.detail.fix}}</small>
      <div v-if="selected===row.id" class="trace">
        <strong>Calculation path</strong>
        <div class="chain"><span v-for="(step,i) in row.chain" :key="step">{{i?' → ':''}}{{step}}</span></div>
        <div v-if="row.detail?.blockedBy"><strong>Blocked by:</strong> {{row.detail.blockedBy}}</div>
        <div v-if="row.detail?.reason"><strong>Reason:</strong> {{row.detail.reason}}</div>
        <div v-if="row.detail?.rootCause"><strong>Root cause:</strong> {{row.detail.rootCause}}</div>
      </div>
    </article>
  </section>
  <section class="all">
    <div class="section-title"><strong>All calculations</strong><span>{{allRows.length}} end-to-end checks</span></div>
    <article v-for="row in allRows" :key="row.id" class="calc-card" :class="{selected:selected===row.id}" @click="detailFor(row)">
      <div class="card-top"><span>{{statusIcon(row.status)}} {{statusText(row.status)}}</span><strong>{{row.name}}</strong><span>{{valueFor(row.id)}}</span></div>
      <p>{{row.explain}}</p>
      <div v-if="selected===row.id" class="trace">
        <strong>Calculation path</strong>
        <div class="chain"><span v-for="(step,i) in row.chain" :key="step">{{i?' → ':''}}{{step}}</span></div>
        <div class="source-row"><span>Period</span><strong>{{period}}</strong></div>
        <div v-if="row.id==='monthly-be'" class="source-row"><span>Evidence</span><strong>{{metrics?.calculationEvidence?.breakEven?.status||'—'}}</strong></div>
        <div v-if="row.id==='driver-target'" class="source-row"><span>Authority</span><strong>{{metrics?.driverTargetAuthority||'—'}}</strong></div>
        <div v-if="row.id==='fuel-cost-km'" class="source-row"><span>Evidence</span><strong>{{metrics?.calculationEvidence?.fuelCostPerKm?.status||'—'}}</strong></div>
      </div>
    </article>
  </section>
  <footer class="calc-note">This screen is diagnostic only. It does not change business records or calculation rules.</footer>
</section>
</template>

<style scoped>
.calc-page{padding:18px 16px 110px;max-width:980px;margin:0 auto}
.calc-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}
.eyebrow,.section-title span{font-size:11px;letter-spacing:.08em;opacity:.65}.calc-header h1{margin:3px 0;font-size:26px}.calc-header p{margin:0;opacity:.7}.refresh{padding:10px 14px;border-radius:10px;border:1px solid currentColor;background:transparent;font-weight:700}
.period-row{display:flex;gap:8px;margin:12px 0 18px}.period-row button{flex:1;padding:10px;border:1px solid currentColor;border-radius:10px;background:transparent}.period-row button.active{font-weight:800}
.section-title{display:flex;justify-content:space-between;align-items:center;margin:18px 0 9px}.calc-card{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:14px;padding:13px 14px;margin:8px 0;background:color-mix(in srgb,currentColor 4%,transparent);cursor:pointer}.issue-card{border-width:2px}.card-top{display:grid;grid-template-columns:110px 1fr auto;gap:10px;align-items:center}.card-top>span:first-child{font-size:11px;font-weight:800}.calc-card p{margin:8px 0 0;font-size:13px;opacity:.72}.calc-card small{display:block;margin-top:7px;font-weight:700}.trace{margin-top:12px;padding-top:10px;border-top:1px dashed currentColor;font-size:13px}.chain{margin:8px 0 12px;line-height:1.8}.source-row{display:flex;justify-content:space-between;padding:6px 0}.calc-error{padding:12px;border:1px solid currentColor;border-radius:10px}.calc-note{margin-top:18px;font-size:12px;opacity:.6}@media(max-width:620px){.calc-header{display:block}.refresh{margin-top:10px}.card-top{grid-template-columns:1fr auto}.card-top>span:first-child{grid-column:1/-1}}
</style>
