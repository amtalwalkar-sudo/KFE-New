<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { AdminService } from '../../application/admin/adminService.js'

const props=defineProps({definition:{type:Object,required:true},modelValue:{type:Object,default:()=>({})},context:{type:Object,default:()=>({})},submitLabel:{type:String,default:'Save'},busy:{type:Boolean,default:false}})
const emit=defineEmits(['update:modelValue','submit','cancel'])
const values={}
const errors=ref({})
const fieldRefs=ref({})
const editorRef=ref(null)
const editorField=ref(null)
const editorOpen=ref(false)
const fields=computed(()=>props.definition.fields??[])
const optionValue=o=>o&&typeof o==='object'&&'value' in o?o.value:o
const optionLabel=o=>o&&typeof o==='object'&&'label' in o?o.label:o
function syncValues(source={}){for(const key of Object.keys(values))delete values[key];for(const field of fields.value)values[field.key]=source[field.key]!==undefined?source[field.key]:field.defaultValue;errors.value={}}
syncValues(props.modelValue)
function setFieldRef(key,el){if(el)fieldRefs.value[key]=el}
function hydrateDom(){for(const field of fields.value){const el=fieldRefs.value[field.key];if(!el)continue;if(field.type==='checkbox')el.checked=!!values[field.key];else el.value=values[field.key]??''}}
function isEditorField(field){return ['text','number','textarea'].includes(field.type)}
function openEditor(field){if(props.busy||!isEditorField(field))return;editorField.value=field;editorOpen.value=true;nextTick(()=>{const el=editorRef.value;if(!el)return;el.value=values[field.key]??'';el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}})}
function closeEditor(save=true){const field=editorField.value;const el=editorRef.value;if(field&&save&&el)values[field.key]=el.value;editorOpen.value=false;editorField.value=null;nextTick(hydrateDom)}
function editorInput(){/* Native editor DOM is authoritative while typing; no reactive write occurs per keystroke. */}
function readFieldValue(field){const el=fieldRefs.value[field.key];if(!el)return values[field.key];if(field.type==='checkbox')return!!el.checked;if(field.type==='number'){const raw=String(el.value??'').trim();return raw===''?'':Number(raw)}return el.value}
function syncFromDom(){for(const field of fields.value)values[field.key]=readFieldValue(field)}
function setValue(key,value){values[key]=value}
function keyboardFor(field){if(field.type==='number')return field.step&&Number(field.step)%1!==0?'decimal':'numeric';if(field.key.toLowerCase().includes('phone'))return'tel';if(field.key.toLowerCase().includes('email'))return'email';return undefined}
function submit(){if(editorOpen.value)closeEditor(true);syncFromDom();const result=AdminService.validate(props.definition.key,values,props.context);errors.value=result.errors;if(result.valid)emit('submit',result.values)}
onMounted(async()=>{await nextTick();hydrateDom();const first=fields.value.find(field=>field.type!=='checkbox');if(first&&isEditorField(first))openEditor(first)})
watch(()=>props.definition?.key,async()=>{syncValues(props.modelValue);await nextTick();hydrateDom()})
</script>
<template>
<form class="universal-admin-form kfe-contextual-form" data-form-type="admin" novalidate @submit.prevent="submit">
<div class="form-intro"><span>Required fields are marked <strong>*</strong></span><span v-if="Object.keys(errors).length" class="form-summary" role="alert">Please correct the highlighted fields.</span></div>
<div class="form-grid">
<label v-for="field in fields" :key="field.key" class="form-field" :class="{invalid:!!errors[field.key]}">
<span class="field-label">{{field.label}}<strong v-if="field.required" aria-hidden="true"> *</strong></span>
<select v-if="field.type==='select'" :ref="el=>setFieldRef(field.key,el)" :value="values[field.key]??''" @change="setValue(field.key,$event.target.value)" :disabled="busy" :required="field.required"><option value="">Select…</option><option v-for="option in field.options||[]" :key="optionValue(option)" :value="optionValue(option)">{{optionLabel(option)}}</option></select>
<input v-else-if="field.type==='date'||field.type==='datetime-local'" :ref="el=>setFieldRef(field.key,el)" :value="values[field.key]??''" @change="setValue(field.key,$event.target.value)" :type="field.type" :disabled="busy" :required="field.required"/>
<textarea v-else-if="field.type==='textarea'" :value="values[field.key]??''" readonly :disabled="busy" :required="field.required" @click="openEditor(field)"/>
<input v-else :ref="el=>setFieldRef(field.key,el)" :value="values[field.key]??''" readonly :disabled="busy" :type="field.type==='checkbox'?'checkbox':'text'" :min="field.min" :max="field.max" :step="field.step" :required="field.required" @click="field.type==='checkbox'?setValue(field.key,!values[field.key]):openEditor(field)"/>
<small v-if="errors[field.key]" :id="`error-${field.key}`" class="form-error" role="alert">{{errors[field.key]}}</small>
</label>
</div>
<div class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">Cancel</button><button type="submit" class="primary" :disabled="busy">{{busy?'Saving…':submitLabel}}</button></div>
<div v-if="editorOpen&&editorField" class="admin-native-editor-backdrop" @click.self="closeEditor(true)">
<div class="admin-native-editor" role="dialog" :aria-label="`Edit ${editorField.label}`">
<div class="admin-native-editor__head"><strong>{{editorField.label}}</strong><button type="button" @click="closeEditor(false)">Cancel</button></div>
<textarea v-if="editorField.type==='textarea'" ref="editorRef" class="admin-native-editor__input" rows="5" :aria-label="editorField.label" @input="editorInput" @keydown.enter.exact.prevent="closeEditor(true)"></textarea>
<input v-else ref="editorRef" class="admin-native-editor__input" type="text" :inputmode="keyboardFor(editorField)" :aria-label="editorField.label" autocomplete="off" autocapitalize="characters" @input="editorInput" @keydown.enter.prevent="closeEditor(true)"/>
<div class="admin-native-editor__actions"><button type="button" @click="closeEditor(false)">Cancel</button><button type="button" class="primary" @click="closeEditor(true)">Done</button></div>
</div></div>
</form>
</template>
<style scoped>
.universal-admin-form{display:grid;gap:1rem;max-width:760px;margin-inline:auto}.form-intro{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--kfe-text-muted);font-size:.72rem}.form-summary{color:var(--kfe-danger);font-weight:800}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.form-field{display:grid;gap:.4rem;min-width:0}.field-label{font-weight:750;font-size:.8rem}.form-field input,.form-field select,.form-field textarea{min-height:44px;width:100%;box-sizing:border-box;padding:.65rem .7rem;border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm)}.form-field input[readonly],.form-field textarea[readonly]{cursor:text}.form-field textarea{min-height:100px;resize:vertical}.form-field.invalid input,.form-field.invalid select,.form-field.invalid textarea{border-color:var(--kfe-danger)}.form-error{color:var(--kfe-danger);font-size:.72rem}.form-actions{display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;padding-top:.25rem;border-top:1px solid var(--kfe-border)}.form-actions button,.admin-native-editor button{border:1px solid var(--kfe-border-strong);border-radius:var(--kfe-radius-sm);padding:9px 14px;font-weight:800;cursor:pointer}.form-actions .secondary,.admin-native-editor button{background:var(--kfe-surface);color:var(--kfe-text)}.form-actions .primary,.admin-native-editor .primary{background:var(--kfe-text);color:var(--kfe-on-accent);border-color:var(--kfe-text)}.admin-native-editor-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:end center;padding:12px;background:color-mix(in srgb,var(--kfe-text) 35%,transparent)}.admin-native-editor{width:min(760px,100%);display:grid;gap:12px;padding:14px;border:1px solid var(--kfe-border-strong);border-radius:16px;background:var(--kfe-surface);box-shadow:0 -12px 40px color-mix(in srgb,var(--kfe-text) 20%,transparent)}.admin-native-editor__head,.admin-native-editor__actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.admin-native-editor__input{width:100%;box-sizing:border-box;min-height:50px;padding:.75rem;border:2px solid var(--kfe-primary);border-radius:12px;background:var(--kfe-surface);color:var(--kfe-text);font:inherit;font-size:18px}.admin-native-editor__actions{justify-content:flex-end}.admin-native-editor__actions .primary{min-width:96px}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-actions{position:sticky;bottom:0;background:var(--kfe-surface);padding:10px 0 calc(10px + env(safe-area-inset-bottom));z-index:2}.form-actions button{flex:1}.admin-native-editor-backdrop{padding:8px}.admin-native-editor{padding:12px}}
</style>
