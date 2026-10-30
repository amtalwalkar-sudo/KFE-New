/** Admin forms capture and persist the current in-scope source facts. */
const text=(key,label,options={})=>({key,label,type:'text',...options});
const number=(key,label,options={})=>({key,label,type:'number',...options});
const date=(key,label,options={})=>({key,label,type:'date',...options});
const select=(key,label,options=[],extra={})=>({key,label,type:'select',options,...extra});
const checkbox=(key,label,options={})=>({key,label,type:'checkbox',...options});
const textarea=(key,label,options={})=>({key,label,type:'textarea',...options});

export const ADMIN_FORM_DEFINITIONS={
  businessSetup:{
    key:'businessSetup',title:'Business Setup',createLabel:'Business Setup',category:'businessSetup',calculationRole:'authoritative',
    fields:[
      date('businessStartDate','Business Start Date',{section:'Business boundary',required:true,help:'All business reporting periods begin on this IST calendar date.'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  vehicle:{
    key:'vehicle',title:'Vehicle',createLabel:'Vehicle',category:'businessSetup',
    fields:[
      text('registrationNumber','Registration number',{section:'Vehicle identity',required:true}),
      text('make','Make',{section:'Vehicle identity',required:true}),
      text('model','Model',{section:'Vehicle identity',required:true}),
      text('variant','Variant',{section:'Vehicle identity'}),
      date('acquiredOn','Acquisition date',{section:'Acquisition & opening position',required:true}),
      number('acquisitionValue','Acquisition cost/value',{section:'Acquisition & opening position',min:0,step:0.01}),
      number('openingOdometerKm','Opening odometer (km)',{section:'Acquisition & opening position',required:true,min:0,step:1,help:'Opening reference only. Work shift odometers own later vehicle movement.'}),
      select('fuelType','Fuel type',['CNG','Petrol','Diesel','Electric','Hybrid'],{section:'Powertrain',required:true}),
      number('tankCapacity','Tank / battery capacity',{section:'Powertrain',min:0,step:0.01}),
      select('status','Vehicle status',['Active','Inactive','Sold'],{section:'Lifecycle',required:true,defaultValue:'Active'}),
      date('expiryDate','Expiry date',{section:'Lifecycle',hidden:true,help:'Legacy compatibility only; renewal validity is entered under Compliance.'}),
      date('statusDate','Status date',{section:'Lifecycle'}),
      checkbox('active','Active',{section:'Lifecycle',defaultValue:true,toggleLabel:'Include vehicle as active'}),
      number('sellPrice','Sell price',{section:'Sale details',min:0,step:0.01,help:'Enter only if the vehicle was sold.'}),
      date('saleDate','Sale date',{section:'Sale details'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  driver:{
    key:'driver',title:'Driver',createLabel:'Driver',category:'businessSetup',
    fields:[
      text('name','Full name',{section:'Driver identity',required:true}),
      text('phone','Phone number',{section:'Driver identity',inputMode:'tel'}),
      text('licenseNumber','Driving licence number',{section:'Licence & availability'}),
      date('licenseExpiry','Licence expiry',{section:'Licence & availability'}),
      date('joinedOn','Joined on',{section:'Licence & availability'}),
      select('status','Status',['Active','Inactive','Suspended'],{section:'Licence & availability',required:true,defaultValue:'Active'}),
      select('vehicleId','Assigned vehicle',[],{section:'Vehicle assignment'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  compliance:{
    key:'compliance',title:'Compliance',createLabel:'Compliance Record',category:'vehicleRecords',
    fields:[
      select('vehicleId','Vehicle',[],{section:'Compliance record',required:true}),
      text('complianceType','Compliance name',{section:'Compliance record',required:true}),
      date('validFrom','Validity · From',{section:'Validity & cost',required:true}),
      date('validUntil','Validity · Upto',{section:'Validity & cost',required:true}),
      number('cost','Compliance cost',{section:'Validity & cost',required:true,min:0,exclusiveMin:true,step:0.01})
    ]
  },
  maintenance:{
    key:'maintenance',title:'Maintenance',createLabel:'Maintenance Record',category:'vehicleRecords',calculationRole:'authoritative-actual-maintenance',
    fields:[
      date('performedOn','Date',{section:'Maintenance record',required:true}),
      number('odometerKm','Odometer (km)',{section:'Maintenance record',required:true,min:0,step:1}),
      text('maintenanceType','Maintenance',{section:'Maintenance record',required:true,wide:true}),
      number('cost','Amount',{section:'Maintenance record',required:true,min:0,exclusiveMin:true,step:0.01}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  loan:{
    key:'loan',title:'Loan',collectionTitle:'Loans',createLabel:'Loan',category:'finance',calculationRole:'authoritative',
    fields:[
      text('lender','Lender',{section:'Lender & agreement',required:true}),
      text('accountReference','Account reference',{section:'Lender & agreement'}),
      number('principal','Loan amount',{section:'Contractual terms',required:true,min:0,exclusiveMin:true,step:0.01}),
      number('tenureMonths','Tenure (months)',{section:'Contractual terms',required:true,min:1,step:1}),
      date('startDate','Loan start date',{section:'Contractual terms',required:true}),
      number('annualInterestRatePercent','Annual interest rate (%)',{section:'Contractual terms',required:true,min:0,step:0.01,help:'Explicit for this loan; KFE does not assume a global interest rate.'}),
      select('status','Loan status',['Active','Closed','Settled'],{section:'Lifecycle',required:true,defaultValue:'Active'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
};
export const ADMIN_FORM_KEYS=Object.keys(ADMIN_FORM_DEFINITIONS);
export function getAdminFormDefinition(formKey){return ADMIN_FORM_DEFINITIONS[formKey]??null;}
