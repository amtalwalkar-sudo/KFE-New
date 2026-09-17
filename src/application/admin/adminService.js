import { getAdminFormDefinition } from './adminFormDefinitions.js'
import { validateAdminForm } from './universalFormRules.js'
import { AdminRepository } from '../../repositories/adminRepository.js'
import { BackupService } from '../backup/backupService.js'

function definitionFor(formKey){const definition=getAdminFormDefinition(formKey);if(!definition)throw new Error(`Unknown Admin form: ${formKey}`);return definition}
const refs={vehicle:[['compliance','vehicleId'],['maintenance','vehicleId'],['driver','vehicleId'],['driverCollectedData','vehicleId']],driver:[['driverTarget','driverId'],['driverCollectedData','driverId']],loan:[['loanPayment','loanId'],['prepayment','loanId']]}
const checkpoint=()=>BackupService.requestLocalBackupCheckpoint()
export const AdminService={
 getDefinition(formKey){return definitionFor(formKey)},
 validate(formKey,values,context={}){return validateAdminForm(definitionFor(formKey),values,context)},
 async list(formKey){definitionFor(formKey);return AdminRepository.list(formKey)},
 async save(formKey,values,existingId=null,context={}){const result=validateAdminForm(definitionFor(formKey),values,context);if(!result.valid){const error=new Error('Admin validation failed.');error.validation=result.errors;throw error}if(formKey==='shift'&&!existingId)throw new Error('Shift corrections require an existing Work-created shift.');const saved=await AdminRepository.save(formKey,result.values,existingId);checkpoint();return saved},
 async remove(formKey,id){const definition=definitionFor(formKey);if(formKey==='shift')throw new Error('Shift records are not deletable.');if(!id)throw new Error('Admin record id is required.');for(const [form,field] of refs[formKey]??[]){const linked=await AdminRepository.list(form);if(linked.some(r=>r.values?.[field]===id))throw new Error(`Cannot delete this ${definition.title}: related ${definitionFor(form).title} records still reference it.`)}const removed=await AdminRepository.remove(formKey,id);checkpoint();return removed},
}
