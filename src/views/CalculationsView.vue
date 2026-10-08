<script setup>
import { computed, onMounted, ref, toRaw } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { FirstRunSetupService } from '../application/setup/firstRunSetupService.js'
import { AdminService } from '../application/admin/adminService.js'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import AdminRecordForm from '../components/admin/AdminRecordForm.vue'
import { CalculationsService } from '../application/calculations/calculationsService.js'
import { getKfeReferenceNow, reportingRangeFor } from '../domain/time/ist.js'

const loading=ref(false), saving=ref(false), error=ref(''), notice=ref('')
const snapshot=ref(null), metrics=ref(null), setupStatus=ref(null)
const openId=ref(null), draft=ref({}), activeDefinition=ref(null)
const fuelDraft=ref({odometer:'',pricePerKg:'',amount:'',isPartialTank:false})
const fuelFields=[
  {key:'odometer',label:'Odometer (km)',type:'number',required:true,min:0,step:1,section:'Refuelling evidence'},
  {key:'pricePerKg',label:'Price / kg',type:'number',required:true,min:0,exclusiveMin:true,step:0.01,section:'Refuelling evidence'},
  {key:'amount',label:'Amount',type:'number',required:true,min:0,exclusiveMin:true,step:0.01,section:'Refuelling evidence'},
  {key:'isPartialTank',label:'Partial tank fill',type:'checkbox',defaultValue:false,section:'Refuelling evidence',toggleLabel:'Partial fill'}
]

const live=xs=>(xs||[]).filter(x=>!x?.deletedAt&&!x?.deleted)
const clone=v=>structuredClone(toRaw(v))
const money=v=>Number.isFinite(Number(v))?'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2}):'—'

const setupMap=computed(()=>Object.fromEntries((setupStatus.value?.steps||[]).map(x=>[x.key,x])))
const activeVehicle=computed(()=>live(snapshot.value?.vehicles||snapshot.value?.vehicle).find(v=>v.values?.active!==false&&String(v.values?.status||'Active').toLowerCase()==='active')||null)
const drivers=computed(()=>live(snapshot.value?.drivers||snapshot.value?.driver))
const vehicles=computed(()=>live(snapshot.value?.vehicles||snapshot.value?.vehicle))
const loans=computed(()=>live(snapshot.value?.loans||snapshot.value?.loan))

const definitions=computed(()=>{
  const keys=['businessSetup','vehicle','driver','breakEvenInputs','driverTarget','loan']
  return Object.fromEntries(keys.map(key=>{
    const d=clone(ADMIN_FORM_DEFINITIONS[key])
    for(const f of d.fields||[]){
      if(f.key==='vehicleId')f.options=vehicles.value.map(x=>({value:x.id,label:[x.values?.registrationNumber,x.values?.make,x.values?.model].filter(Boolean).join(' · ')||x.id}))
      if(f.key==='driverId')f.options=drivers.value.map(x=>({value:x.id,label:x.values?.name||x.id}))
      if(f.key==='loanId')f.options=loans.value.map(x=>({value:x.id,label:[x.values?.lender,x.values?.accountReference].filter(Boolean).join(' · ')||x.id}))
    }
    return [key,d]
  }))
})

const inputItems=computed(()=>{
  const s=setupMap.value
  const items=[]
  const add=(id,title,description,step,priority=1)=>items.push({id,title,description,step,priority})
  if(s.businessSetup?.status==='INCOMPLETE')add('businessSetup','Set the business start date','KFE uses this date to bound every calculation and reporting period.','businessSetup')
  if(s.vehicle?.status==='INCOMPLETE')add('vehicle','Add the active vehicle','Vehicle and opening odometer are required for vehicle KM, fuel and break-even calculations.','vehicle')
  if(s.driver?.status==='INCOMPLETE')add('driver','Add the active driver','The driver is needed for target and driver-facing calculations.','driver')
  if(s.breakEvenInputs?.status==='INCOMPLETE')add('breakEvenInputs','Set maintenance cost per KM','This is the planning rate used by the break-even and target calculations.','breakEvenInputs')
  if(s.loan?.status==='INCOMPLETE')add('loan','Confirm vehicle financing','Enter the loan contract, or tell KFE there is no loan so the EMI burden can be resolved.','loan')
  if(s.driverTarget?.status==='INCOMPLETE')add('driverTarget','Set the monthly driver target','Enter the driver’s desired monthly profit / take-home. The target engine adds the applicable break-even burden.','driverTarget')
  const fuelEvidence=metrics.value?.breakEvenInputs?.fuelEvidence?.status
  if(s.fuelBaseline?.status==='INCOMPLETE'||fuelEvidence!=='AUTHORITATIVE')add('fuelBaseline','Record a full-tank fuel fill','Fuel cost per KM becomes authoritative from qualifying refuelling evidence.','fuelBaseline')
  return items.sort((a,b)=>a.priority-b.priority)
})

const resolvedCount=computed(()=>Math.max(0,(setupStatus.value?.steps||[]).filter(x=>x.status==='COMPLETE').length))
const totalInputs=computed(()=>inputItems.value.length)

function rangeFor(p){return reportingRangeFor(p,getKfeReferenceNow())}
async function load(){
  loading.value=true;error.value=''
  try{
    snapshot.value=await PerformanceService.getSnapshot()
    metrics.value=PerformanceService.getMetrics(snapshot.value,rangeFor('MONTH'))
    setupStatus.value=await FirstRunSetupService.getCalculationSetupStatus()
  }catch(e){error.value=e.message||'Unable to check calculation inputs.'}
  finally{loading.value=false}
}
function closeForm(){openId.value=null;draft.value={};activeDefinition.value=null}
function openAdminInput(id){
  error.value='';notice.value='';openId.value=id
  if(id==='fuelBaseline'){
    const logs=live(snapshot.value?.fuelLogs||snapshot.value?.fuel_logs)
    const latest=logs[0]
    fuelDraft.value={odometer:latest?.odometer??'',pricePerKg:latest?.pricePerKg??'',amount:'',isPartialTank:false}
    return
  }
  activeDefinition.value=definitions.value[id]
  draft.value={}
}
async function saveAdminInput(values){
  saving.value=true;error.value='';notice.value=''
  try{
    await AdminService.save(openId.value,values)
    notice.value='Saved. Rechecking calculations…'
    closeForm()
    await load()
  }catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Unable to save this input.'}
  finally{saving.value=false}
}
async function markLoanNotApplicable(){
  saving.value=true;error.value='';notice.value=''
  try{
    await FirstRunSetupService.setStepState('loan',{status:'NOT_APPLICABLE'})
    notice.value='Loan marked not applicable. Rechecking calculations…'
    closeForm()
    await load()
  }catch(e){error.value=e.message||'Unable to update loan setup.'}
  finally{saving.value=false}
}
function onFuelFieldChange({key,value}){fuelDraft.value={...fuelDraft.value,[key]:value}}
async function saveFuel(values){
  saving.value=true;error.value='';notice.value=''
  try{
    const odometer=Number(values.odometer), pricePerKg=Number(values.pricePerKg), amount=Number(values.amount)
    if(!Number.isFinite(odometer)||odometer<0||!Number.isFinite(pricePerKg)||pricePerKg<=0||!Number.isFinite(amount)||amount<=0)throw new Error('Enter a valid odometer, a price/kg greater than zero, and a positive amount.')
    await CalculationsService.recordFuelBaseline({odometer,pricePerKg,amount,isFullTank:!Boolean(values.isPartialTank)})
    notice.value='Fuel entry saved. Rechecking calculations…'
    closeForm()
    await load()
  }catch(e){error.value=e.message||'Unable to save the fuel entry.'}
  finally{saving.value=false}
}
const fuelQuantity=computed(()=>{const p=Number(fuelDraft.value.pricePerKg),a=Number(fuelDraft.value.amount);return p>0&&a>0?(a/p).toFixed(2):'—'})
onMounted(load)
</script>

<template>
<section class="calc-page" aria-label="Calculation inputs">
  <header class="calc-header">
    <div>
      <div class="eyebrow">ADMIN · CALCULATIONS</div>
      <h1>Complete your calculations</h1>
      <p>Enter the missing business information below. KFE will recalculate the PWA automatically after each save.</p>
    </div>
    <button class="refresh" :disabled="loading||saving" @click="load">{{loading?'Checking…':'↻ Check again'}}</button>
  </header>

  <p v-if="error" class="calc-error" role="alert">{{error}}</p>
  <p v-if="notice" class="calc-notice" role="status">{{notice}}</p>

  <section class="progress-card">
    <div>
      <strong>{{totalInputs?totalInputs+' item'+(totalInputs===1?'':'s')+' to complete':'All required inputs are complete'}}</strong>
      <span v-if="totalInputs">These are the inputs KFE still needs to produce the intended calculations.</span>
      <span v-else>Your calculation inputs are complete. Calculated results are available throughout the PWA.</span>
    </div>
    <div class="progress-track" aria-hidden="true"><span :style="{width:(totalInputs?'0':'100')+'%'}"></span></div>
  </section>

  <section v-if="!loading&&inputItems.length" class="input-list">
    <div class="section-title"><strong>What needs your input</strong><span>Incomplete inputs · {{inputItems.length}} remaining</span></div>

    <article v-for="item in inputItems" :key="item.id" class="input-card" :class="{open:openId===item.id}">
      <button class="input-head" type="button" @click="openId===item.id?closeForm():openAdminInput(item.id)">
        <span class="input-number">{{item.priority}}</span>
        <span class="input-copy"><strong>{{item.title}}</strong><small>{{item.description}}</small></span>
        <span class="input-action">{{openId===item.id?'Close':'Enter'}}</span>
      </button>

      <div v-if="openId===item.id" class="input-form">
        <AdminRecordForm
          v-if="item.id!=='fuelBaseline'"
          :fields="activeDefinition?.fields||[]"
          :model-value="draft"
          :busy="saving"
          :submit-label="item.id==='loan'?'Save loan':'Save'"
          @submit="saveAdminInput"
          @cancel="closeForm"
        />

        <template v-else>
          <div class="fuel-quantity-preview"><span>Calculated quantity</span><strong>{{fuelQuantity}} kg</strong><small>Calculated from amount ÷ price per kg. This value is not editable.</small></div>
          <AdminRecordForm
            :fields="fuelFields"
            :model-value="fuelDraft"
            :busy="saving"
            submit-label="Save fuel entry"
            @field-change="onFuelFieldChange"
            @submit="saveFuel"
            @cancel="closeForm"
          />
        </template>

        <div v-if="item.id==='loan'" class="loan-note">
          <strong>Does the vehicle have no loan?</strong>
          <span>Choose this only when there is genuinely no financing to include.</span>
          <button class="secondary" type="button" :disabled="saving" @click="markLoanNotApplicable">No loan</button>
        </div>
      </div>
    </article>
  </section>

  <section v-else-if="!loading" class="complete-card">
    <div class="complete-icon">✓</div>
    <div><strong>Calculations are ready</strong><span>No manual calculation inputs are currently missing.</span></div>
  </section>

  <section class="results-note">
    <strong>You enter facts here. KFE does the calculations.</strong>
    <span>Saving an input updates the canonical record and refreshes the dependent calculations used by Work, Timeline, Performance and Finance. This screen does not ask you to calculate anything yourself.</span>
  </section>
</section>
</template>

