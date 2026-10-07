<script setup>
import { computed, onMounted, ref, toRaw } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { FirstRunSetupService } from '../application/setup/firstRunSetupService.js'
import { AdminService } from '../application/admin/adminService.js'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import UniversalAdminForm from '../components/admin/UniversalAdminForm.vue'
import { FuelRepository } from '../repositories/fuelRepository.js'
import { getKfeReferenceNow, istDateKey, reportingRangeFor } from '../domain/time/ist.js'

const loading=ref(false), saving=ref(false), error=ref(''), notice=ref('')
const snapshot=ref(null), metrics=ref(null), setupStatus=ref(null)
const openId=ref(null), draft=ref({}), activeDefinition=ref(null)
const fuelDraft=ref({odometer:'',pricePerKg:'',amount:'',isFullTank:true})

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
    fuelDraft.value={odometer:latest?.odometer??'',pricePerKg:latest?.pricePerKg??'',amount:'',isFullTank:true}
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
async function saveFuel(){
  saving.value=true;error.value='';notice.value=''
  try{
    const odometer=Number(fuelDraft.value.odometer), pricePerKg=Number(fuelDraft.value.pricePerKg), amount=Number(fuelDraft.value.amount)
    if(!Number.isFinite(odometer)||!Number.isFinite(pricePerKg)||!Number.isFinite(amount)||amount<=0)throw new Error('Odometer, price/kg and amount are required.')
    const quantityKg=amount/pricePerKg
    await FuelRepository.create({odometer,pricePerKg,amount,quantityKg,isFullTank:Boolean(fuelDraft.value.isFullTank),capturedAt:getKfeReferenceNow().toISOString(),provenance:'MANUAL_CALCULATION_INPUT'})
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
    <div class="section-title"><strong>What needs your input</strong><span>{{inputItems.length}} remaining</span></div>

    <article v-for="item in inputItems" :key="item.id" class="input-card" :class="{open:openId===item.id}">
      <button class="input-head" type="button" @click="openId===item.id?closeForm():openAdminInput(item.id)">
        <span class="input-number">{{item.priority}}</span>
        <span class="input-copy"><strong>{{item.title}}</strong><small>{{item.description}}</small></span>
        <span class="input-action">{{openId===item.id?'Close':'Enter'}}</span>
      </button>

      <div v-if="openId===item.id" class="input-form">
        <UniversalAdminForm
          v-if="item.id!=='fuelBaseline'"
          :definition="activeDefinition"
          :model-value="draft"
          :busy="saving"
          :submit-label="item.id==='loan'?'Save loan':'Save'"
          @update:model-value="draft=$event"
          @submit="saveAdminInput"
          @cancel="closeForm"
        />

        <form v-else class="fuel-form" @submit.prevent="saveFuel">
          <div class="form-grid">
            <label><span>Odometer (km)</span><input v-model="fuelDraft.odometer" type="number" inputmode="numeric" min="0" required></label>
            <label><span>Price / kg</span><input v-model="fuelDraft.pricePerKg" type="number" inputmode="decimal" min="0" step="0.01" required></label>
            <label><span>Amount</span><input v-model="fuelDraft.amount" type="number" inputmode="decimal" min="0.01" step="0.01" required></label>
            <label class="quantity"><span>Quantity (auto)</span><strong>{{fuelQuantity}} kg</strong></label>
          </div>
          <label class="check-line"><input v-model="fuelDraft.isFullTank" type="checkbox"> Full tank</label>
          <div class="form-actions"><button type="button" class="secondary" @click="closeForm">Cancel</button><button class="primary" type="submit" :disabled="saving">Save fuel entry</button></div>
        </form>

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

<style scoped>
.calc-page{max-width:820px;margin:0 auto;padding:1rem 1rem 5rem;display:grid;gap:1rem}
.calc-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}
.eyebrow{font-size:.68rem;font-weight:800;letter-spacing:.08em;color:var(--kfe-text-muted)}
h1{margin:.25rem 0;font-size:1.55rem}
.calc-header p{margin:.25rem 0;color:var(--kfe-text-muted);font-size:.85rem;max-width:620px}
.refresh,.input-action,.primary,.secondary{min-height:44px;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);padding:.55rem .8rem;font-weight:800;cursor:pointer}
.refresh{background:var(--kfe-surface);color:var(--kfe-text)}
.primary{background:var(--kfe-text);color:var(--kfe-on-accent);border-color:var(--kfe-text)}
.secondary{background:var(--kfe-surface);color:var(--kfe-text)}
.calc-error,.calc-notice{margin:0;padding:.75rem;border-radius:var(--kfe-radius-sm);font-size:.8rem}
.calc-error{color:var(--kfe-danger);background:color-mix(in srgb,var(--kfe-danger) 8%,transparent)}
.calc-notice{color:var(--kfe-text);background:color-mix(in srgb,var(--kfe-ui-accent) 10%,transparent)}
.progress-card,.results-note,.complete-card,.input-card{border:1px solid var(--kfe-border);border-radius:var(--kfe-radius-sm);background:var(--kfe-surface)}
.progress-card{padding:1rem;display:grid;gap:.7rem}
.progress-card strong,.progress-card span{display:block}
.progress-card span,.results-note span,.complete-card span{font-size:.76rem;color:var(--kfe-text-muted)}
.progress-track{height:7px;border-radius:99px;background:var(--kfe-border);overflow:hidden}
.progress-track span{height:100%;display:block;background:var(--kfe-primary);transition:width .2s ease}
.section-title{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.55rem}
.section-title span{font-size:.72rem;color:var(--kfe-text-muted)}
.input-list{display:grid;gap:.55rem}
.input-card{overflow:hidden}
.input-card.open{border-color:var(--kfe-border-strong)}
.input-head{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.75rem;padding:.85rem;background:transparent;border:0;text-align:left;color:var(--kfe-text);cursor:pointer}
.input-number{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:var(--kfe-border);font-weight:900;font-size:.75rem}
.input-copy{display:grid;gap:.2rem}
.input-copy strong{font-size:.9rem}
.input-copy small{font-size:.73rem;color:var(--kfe-text-muted);line-height:1.35}
.input-action{min-height:36px;padding:.45rem .65rem;background:var(--kfe-text);color:var(--kfe-on-accent);display:grid;place-items:center}
.input-form{padding:.2rem .85rem .9rem;border-top:1px solid var(--kfe-border)}
.loan-note{margin-top:.7rem;padding:.75rem;border-top:1px solid var(--kfe-border);display:grid;gap:.3rem}
.loan-note span{font-size:.72rem;color:var(--kfe-text-muted)}
.loan-note button{justify-self:start;margin-top:.3rem}
.fuel-form{display:grid;gap:.8rem;padding-top:.65rem}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
.form-grid label{display:grid;gap:.3rem}
.form-grid label span,.check-line{font-size:.72rem;font-weight:750}
.form-grid input{min-height:44px;width:100%;box-sizing:border-box;padding:.6rem;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);background:var(--kfe-surface);color:var(--kfe-text)}
.quantity strong{min-height:44px;display:flex;align-items:center}
.check-line{display:flex;align-items:center;gap:.5rem}
.check-line input{width:22px;height:22px}
.form-actions{display:flex;justify-content:flex-end;gap:.5rem;padding-top:.5rem;border-top:1px solid var(--kfe-border)}
.complete-card{padding:1rem;display:flex;align-items:center;gap:.8rem}
.complete-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--kfe-border);font-weight:900}
.results-note{padding:1rem;display:grid;gap:.25rem}
.results-note strong{font-size:.85rem}
@media(max-width:600px){.calc-page{padding:.8rem .75rem 5rem}.calc-header{display:grid}.refresh{width:100%}.form-grid{grid-template-columns:1fr}.input-head{grid-template-columns:auto 1fr}.input-action{grid-column:2;justify-self:start}.input-copy small{padding-right:.2rem}.form-actions{position:static}.input-form{padding-inline:.65rem}}
</style>
