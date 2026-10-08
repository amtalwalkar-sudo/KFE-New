/** Admin forms capture canonical source facts only; calculations remain owned by domain services. */
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
      date('statusDate','Status date',{section:'Lifecycle'}),
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
      number('cost','Amount paid',{section:'Validity & cost',required:true,min:0,exclusiveMin:true,step:0.01})
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
  loanPayment:{
    key:'loanPayment',title:'Loan Payments',createLabel:'Loan Payment',category:'finance',calculationRole:'authoritative-payment-record',
    fields:[
      select('loanId','Loan',[],{section:'Actual payment',required:true}),
      date('paidOn','Actual payment date',{section:'Actual payment',required:true}),
      number('amount','Actual amount paid',{section:'Actual payment',required:true,min:0,exclusiveMin:true,step:0.01}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  prepayment:{
    key:'prepayment',title:'Prepayments',createLabel:'Prepayment',category:'finance',calculationRole:'authoritative-prepayment-record',
    fields:[
      select('loanId','Loan',[],{section:'Prepayment',required:true}),
      date('paidOn','Prepayment date',{section:'Prepayment',required:true}),
      number('amount','Actual prepayment amount',{section:'Prepayment',required:true,min:0,exclusiveMin:true,step:0.01}),
      textarea('reason','Reason',{section:'Prepayment'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  settlement:{
    key:'settlement',title:'Payments',createLabel:'Payment',category:'finance',calculationRole:'authoritative-settlement-record',
    fields:[
      select('settlementType','Settlement type',['Payment'],{section:'Payment details',required:true,defaultValue:'Payment'}),
      select('sourceType','Paying for',['Maintenance','Compliance'],{section:'Payment details',required:true}),
      select('sourceId','Source record',[],{section:'Payment details',required:true}),
      date('settledOn','Payment date',{section:'Payment details',required:true}),
      number('amount','Amount paid',{section:'Payment details',required:true,min:0,exclusiveMin:true,step:0.01}),
      select('paymentMethod','Payment method',['Cash','Bank transfer','UPI','Card','Cheque','Other'],{section:'Payment reference',defaultValue:'Cash'}),
      text('referenceNumber','Payment reference',{section:'Payment reference'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  driverTarget:{
    key:'driverTarget',title:'Driver Monthly Target',createLabel:'Driver Monthly Target',category:'planningControls',calculationRole:'authoritative',
    fields:[
      select('driverId','Driver',[],{section:'Target period',required:true}),
      date('effectiveFrom','Month',{section:'Target period',required:true,help:'Effective date is normalized to the first day of the selected month.'}),
      number('desiredDriverProfit','Monthly target',{section:'Target amount',required:true,min:0,step:0.01,help:'Desired driver profit / take-home. Break-even and maintenance provisions are derived separately.'}),
      textarea('nonWorkingDates','Planned non-working dates',{section:'Availability',placeholder:'YYYY-MM-DD, one per line or comma separated'}),
      checkbox('active','Active',{section:'Availability',defaultValue:true,toggleLabel:'Target active'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  },
  breakEvenInputs:{
    key:'breakEvenInputs',title:'Break-even Planning Inputs',createLabel:'Break-even Planning Input',category:'planningControls',calculationRole:'authoritative-inputs',
    fields:[
      date('effectiveFrom','Change date',{section:'Effective-dated planning input',required:true}),
      number('maintenanceProvisionPerKm','Maintenance provision per vehicle km',{section:'Effective-dated planning input',required:true,min:0,step:0.01,defaultValue:1.6,help:'Indicative planning rate only; actual profit uses recorded maintenance expenses.'}),
      textarea('notes','Notes',{section:'Additional context'})
    ]
  }
};
export const ADMIN_FORM_KEYS=Object.keys(ADMIN_FORM_DEFINITIONS);
export function getAdminFormDefinition(formKey){return ADMIN_FORM_DEFINITIONS[formKey]??null;}
