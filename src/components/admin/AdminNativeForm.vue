<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
const props=defineProps({fields:{type:Array,required:true},modelValue:{type:Object,default:()=>({})},busy:{type:Boolean,default:false},submitLabel:{type:String,default:'Save'},showActions:{type:Boolean,default:true},autoOpenFirst:{type:Boolean,default:false},errors:{type:Object,default:()=>({})}})
const emit=defineEmits(['submit','cancel','field-change'])
const values={},fieldRefs=ref({}),editorRef=ref(null),editorField=ref(null),editorOpen=ref(false)
const fields=computed(()=>props.fields??[]),optionValue=o=>o&&typeof o==='object'&&'value' in o?o.value:o,optionLabel=o=>o&&typeof o==='object'&&'label' in o?o.label:o,isEditorField=f=>['text','number','textarea'].includes(f.type)
function hydrate(source=props.modelValue){for(const key of Object.keys(values))delete values[key];for(const field of fields.value)values[field.key]=source[field.key]!==undefined?source[field.key]:field.defaultValue;nextTick(hydrateNative)}
function setFieldRef(key,el){if(el)fieldRefs.value[key]=el}
function hydrateNative(){for(const field of fields.value){const el=fieldRefs.value[field.key];if(!el)continue;if(field.type==='checkbox')el.checked=!!values[field.key];else el.value=values[field.key]??''}}
function readDom(field){const el=fieldRefs.value[field.key];if(!el)return values[field.key];if(field.type==='checkbox')return!!el.checked;if(field.type==='number'){const raw=String(el.value??'').trim();return raw===''?'':Number(raw)}return el.value}
function openEditor(field){if(props.busy||!isEditorField(field))return;editorField.value=field;editorOpen.value=true;nextTick(()=>{const el=editorRef.value;if(!el)return;el.value=values[field.key]??'';el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}})}
function closeEditor(save=true){const field=editorField.value,el=editorRef.value;if(field&&save&&el){values[field.key]=el.value;emit('field-change',{key:field.key,value:field.type==='number'?(String(el.value).trim()===''?'':Number(el.value)):el.value})}editorOpen.value=false;editorField.value=null;nextTick(hydrateNative)}
function editorInput(){}
function fieldChanged(field){const value=readDom(field);values[field.key]=value;emit('field-change',{key:field.key,value})}
function toggle(field){values[field.key]=!values[field.key];const el=fieldRefs.value[field.key];if(el)el.checked=!!values[field.key];emit('field-change',{key:field.key,value:values[field.key]})}
function submit(){if(editorOpen.value)closeEditor(true);for(const field of fields.value)values[field.key]=readDom(field);emit('submit',{...values})}
function keyboardFor(field){if(field.type==='number')return field.step&&Number(field.step)%1!==0?'decimal':'numeric';if(field.key.toLowerCase().includes('phone'))return'tel';if(field.key.toLowerCase().includes('email'))return'email';return undefined}
watch(()=>props.modelValue,source=>hydrate(source),{deep:true});watch(()=>props.fields,()=>hydrate(props.modelValue),{deep:true})
onMounted(async()=>{await nextTick();hydrate(props.modelValue);if(props.autoOpenFirst){const first=fields.value.find(f=>f.type!=='checkbox');if(first&&isEditorField(first))openEditor(first)}})
</script>
<template>
<form class="admin-native-form kfe-contextual-form" novalidate @submit.prevent="submit">
<div class="form-grid">
<label v-for="field in fields" :key="field.key" class="form-field" :class="{invalid:!!errors[field.key]}">
<span class="field-label">{{field.label}}<strong v-if="field.required" aria-hidden="true"> *</strong></span>
<select v-if="field.type==='select'" :ref="el=>setFieldRef(field.key,el)" :disabled="busy" :required="field.required" @change="fieldChanged(field)"><option value="">Select…</option><option v-for="option in field.options||[]" :key="optionValue(option)" :value="optionValue(option)">{{optionLabel(option)}}</option></select>
<input v-else-if="field.type==='date'||field.type==='datetime-local'||field.type==='month'" :ref="el=>setFieldRef(field.key,el)" :type="field.type" :disabled="busy" :required="field.required" @change="fieldChanged(field)">
<textarea v-else-if="field.type==='textarea'" :ref="el=>setFieldRef(field.key,el)" readonly :disabled="busy" :required="field.required" :placeholder="field.placeholder" @click="openEditor(field)"></textarea>
<input v-else-if="field.type==='checkbox'" :ref="el=>setFieldRef(field.key,el)" type="checkbox" :disabled="busy" :required="field.required" @change="toggle(field)">
<input v-else :ref="el=>setFieldRef(field.key,el)" readonly :disabled="busy" type="text" :inputmode="keyboardFor(field)" :min="field.min" :max="field.max" :step="field.step" :required="field.required" @click="openEditor(field)">
<small v-if="errors[field.key]" class="form-error" role="alert">{{errors[field.key]}}</small>
</label>
</div>
<div v-if="showActions" class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">Cancel</button><button type="submit" class="primary" :disabled="busy">{{busy?'Saving…':submitLabel}}</button></div>
<div v-if="editorOpen&&editorField" class="admin-native-editor-backdrop" @click.self="closeEditor(true)">
<div class="admin-native-editor" role="dialog" :aria-label="`Edit ${editorField.label}`">
<div class="admin-native-editor__head"><strong>{{editorField.label}}</strong><button type="button" :disabled="busy" @click="closeEditor(false)">Cancel</button></div>
<textarea v-if="editorField.type==='textarea'" ref="editorRef" class="admin-native-editor__input" rows="5" :aria-label="editorField.label" :placeholder="editorField.placeholder" @input="editorInput" @keydown.enter.exact.prevent="closeEditor(true)"></textarea>
<input v-else ref="editorRef" class="admin-native-editor__input" type="text" :inputmode="keyboardFor(editorField)" :aria-label="editorField.label" autocomplete="off" autocapitalize="characters" @input="editorInput" @keydown.enter.prevent="closeEditor(true)">
<div class="admin-native-editor__actions"><button type="button" @click="closeEditor(false)">Cancel</button><button type="button" class="primary" @click="closeEditor(true)">Done</button></div>
</div></div>
</form>
</template>
<style scoped>
.admin-native-form{display:grid;gap:1rem;max-width:760px;margin-inline:auto}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.form-field{display:grid;gap:.4rem;min-width:0}.field-label{font-weight:750;font-size:.8rem}.form-field input,.form-field select,.form-field textarea{min-height:44px;width:100%;box-sizing:border-box;padding:.65rem .7rem;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm)}.form-field input[readonly],.form-field textarea[readonly]{cursor:text}.form-field textarea{min-height:100px;resize:vertical}.form-field.invalid input,.form-field.invalid select,.form-field.invalid textarea{border-color:var(--kfe-danger)}.form-error{color:var(--kfe-danger);font-size:.72rem}.form-actions{display:flex;justify-content:flex-end;gap:.75rem;padding-top:.25rem;border-top:1px solid var(--kfe-border)}.form-actions button,.admin-native-editor button{border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);padding:9px 14px;font-weight:800;cursor:pointer}.form-actions .secondary,.admin-native-editor button{background:var(--kfe-surface);color:var(--kfe-text)}.form-actions .primary,.admin-native-editor .primary{background:var(--kfe-text);color:var(--kfe-on-accent);border-color:var(--kfe-text)}.admin-native-editor-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:end center;padding:12px;background:color-mix(in srgb,var(--kfe-text) 35%,transparent)}.admin-native-editor{width:min(760px,100%);display:grid;gap:12px;padding:14px;border:1px solid var(--kfe-border-strong);border-radius:16px;background:var(--kfe-surface);box-shadow:0 -12px 40px color-mix(in srgb,var(--kfe-text) 20%,transparent)}.admin-native-editor__head,.admin-native-editor__actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.admin-native-editor__input{width:100%;box-sizing:border-box;min-height:50px;padding:.75rem;border:2px solid var(--kfe-primary);border-radius:12px;background:var(--kfe-surface);color:var(--kfe-text);font:inherit;font-size:18px}.admin-native-editor__actions{justify-content:flex-end}.admin-native-editor__actions .primary{min-width:96px}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-actions button{flex:1}.admin-native-editor-backdrop{padding:8px}.admin-native-editor{padding:12px}}
</style>