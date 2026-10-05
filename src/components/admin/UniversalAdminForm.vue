<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { AdminService } from '../../application/admin/adminService.js'

const props = defineProps({ definition:{type:Object,required:true}, modelValue:{type:Object,default:()=>({})}, context:{type:Object,default:()=>({})}, submitLabel:{type:String,default:'Save'}, busy:{type:Boolean,default:false} })
const emit=defineEmits(['update:modelValue','submit','cancel'])
const values=reactive({})
const errors=ref({})
const fieldRefs=ref({})
const fields=computed(()=>props.definition.fields??[])
const optionValue=option=>option&&typeof option==='object'&&'value' in option?option.value:option
const optionLabel=option=>option&&typeof option==='object'&&'label' in option?option.label:option
function syncValues(source={}){for(const key of Object.keys(values))delete values[key];for(const field of fields.value)values[field.key]=source[field.key]!==undefined?source[field.key]:field.defaultValue;errors.value={}}
syncValues(props.modelValue)
watch(()=>[props.definition,props.modelValue],()=>syncValues(props.modelValue),{deep:true})
function setValue(key,value){values[key]=value;emit('update:modelValue',{...values});if(errors.value[key]){const next={...errors.value};delete next[key];errors.value=next}}
function keyboardFor(field){if(field.type==='number')return field.step&&Number(field.step)%1!==0?'decimal':'numeric';if(field.key.toLowerCase().includes('phone'))return'tel';if(field.key.toLowerCase().includes('email'))return'email';return undefined}
function setFieldRef(key,el){if(el)fieldRefs.value[key]=el}
function submit(){const result=AdminService.validate(props.definition.key,values,props.context);errors.value=result.errors;if(result.valid)emit('submit',result.values)}
</script>
<template>
  <form class="universal-admin-form kfe-contextual-form" data-form-type="admin" novalidate @submit.prevent="submit">
    <div class="form-intro"><span>Required fields are marked <strong>*</strong></span><span v-if="Object.keys(errors).length" class="form-summary" role="alert">Please correct the highlighted fields.</span></div>
    <div class="form-grid">
      <label v-for="field in fields" :key="field.key" class="form-field" :class="{ invalid: !!errors[field.key] }">
        <span class="field-label">{{field.label}}<strong v-if="field.required" aria-hidden="true"> *</strong></span>
        <select v-if="field.type==='select'" :ref="el=>setFieldRef(field.key,el)" :id="`field-${field.key}`" :value="values[field.key]??''" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key]?`error-${field.key}`:undefined" :disabled="busy" @change="setValue(field.key,$event.target.value)">
          <option value="">Select…</option><option v-for="option in field.options||[]" :key="optionValue(option)" :value="optionValue(option)">{{optionLabel(option)}}</option>
        </select>
        <textarea v-else-if="field.type==='textarea'" :id="`field-${field.key}`" :value="values[field.key]??''" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key]?`error-${field.key}`:undefined" :disabled="busy" @input="setValue(field.key,$event.target.value)"/>
        <input v-else :ref="el=>setFieldRef(field.key,el)" :id="`field-${field.key}`" :type="field.type==='checkbox'?'checkbox':field.type" :inputmode="field.type==='checkbox'?undefined:keyboardFor(field)" :enterkeyhint="field.type==='checkbox'?undefined:(fields[fields.length-1]?.key===field.key?'done':'next')" :min="field.min" :max="field.max" :step="field.step" :checked="field.type==='checkbox'?Boolean(values[field.key]):undefined" :value="field.type==='checkbox'?undefined:values[field.key]??''" :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key]?`error-${field.key}`:undefined" :disabled="busy" @change="field.type==='checkbox'?setValue(field.key,$event.target.checked):setValue(field.key,$event.target.value)" @input="field.type==='checkbox'?undefined:setValue(field.key,$event.target.value)"/>
        <small v-if="errors[field.key]" :id="`error-${field.key}`" class="form-error" role="alert">{{errors[field.key]}}</small>
      </label>
    </div>
    <div class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">Cancel</button><button type="submit" class="primary" :disabled="busy">{{busy?'Saving…':submitLabel}}</button></div>
  </form>
</template>
<style scoped>
/* Contextual admin form: compact task surface, not a full-page data-entry panel. */
.universal-admin-form{max-width:760px;margin-inline:auto;gap:.75rem}
.form-intro{font-size:.68rem;align-items:center}
.form-grid{gap:.65rem}
.form-field{gap:.3rem}
.field-label{font-size:.72rem}
.form-field input,.form-field select,.form-field textarea{min-height:44px;padding:.55rem .65rem}
.form-field textarea{min-height:72px}
.form-actions{gap:.5rem;padding-top:.5rem}
.form-actions button{min-height:44px;padding:8px 13px}
@media(max-width:600px){
  .universal-admin-form{width:100%;max-width:100%}
  .form-grid{gap:.55rem}
  .form-actions{position:static;padding:0;margin-top:.2rem}
}
</style>
<style scoped>
.universal-admin-form{display:grid;gap:1rem}.form-intro{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--kfe-text-muted);font-size:.72rem}.form-summary{color:var(--kfe-danger);font-weight:800}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.form-field{display:grid;gap:.4rem;min-width:0}.field-label{font-weight:750;font-size:.8rem} .form-field input,.form-field select,.form-field textarea{min-height:44px;width:100%;box-sizing:border-box;padding:.65rem .7rem;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);transition:border-color .12s ease,box-shadow .12s ease}.form-field input:hover,.form-field select:hover,.form-field textarea:hover{border-color:var(--kfe-muted-text)}.form-field input:focus,.form-field select:focus,.form-field textarea:focus{border-color:var(--kfe-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--kfe-ui-accent) 10%,transparent)} .form-field input[type=checkbox]{width:44px;min-height:44px;justify-self:start}.form-field textarea{min-height:100px;resize:vertical}.form-field.invalid input,.form-field.invalid select,.form-field.invalid textarea{border-color:var(--kfe-danger)}.form-error{color:var(--kfe-danger);font-size:.72rem}.form-actions{display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;padding-top:.25rem;border-top:1px solid var(--kfe-border)}.form-actions button{border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);padding:9px 14px;font-weight:800;cursor:pointer}.form-actions .secondary{background:var(--kfe-surface);color:var(--kfe-text)}.form-actions .primary{background:var(--kfe-text);color:var(--kfe-on-accent);border-color:var(--kfe-text)}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-actions{position:sticky;bottom:0;background:var(--kfe-surface);padding:10px 0 calc(10px + env(safe-area-inset-bottom));z-index:2}.form-actions button{flex:1}}
</style>
