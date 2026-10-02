import { istDateKey, istMonthKey } from '../time/ist.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'
const finite=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v)
const dateOf=v=>{const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d:null}
const keyOf=v=>istDateKey(v), monthKeyOf=v=>istMonthKey(v)
const live=xs=>(xs||[]).filter(x=>!x?.deletedAt&&x?.deleted!==true)
const effectiveDateKey=x=>keyOf(x?.effectiveFrom||x?.validFrom||x?.startDate), effectiveUntilKey=x=>keyOf(x?.effectiveUntil||x?.validUntil||x?.endDate)
const applies=(x,day)=>!!keyOf(day)&&x?.active!==false&&x?.status!=='INACTIVE'&&(effectiveDateKey(x)||'1970-01-01')<=keyOf(day)&&keyOf(day)<=(effectiveUntilKey(x)||'9999-12-31')
const latestForDay=(xs,day)=>live(xs).filter(x=>applies(x,day)).sort((a,b)=>String(effectiveDateKey(b)||'').localeCompare(String(effectiveDateKey(a)||''))||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null
const daysInMonth=month=>{if(!month)return 0;const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
const failure=(reason,month=null)=>({available:false,reason,balanceBefore:0,balance:0,openingBalance:0,openingRecovery:0,newRecovery:0,recoveryAllocated:0,recoveryAchieved:0,closingRecovery:0,indicativeProfit:null,indicativeLoss:0,monthlyBreakEvenRevenue:null,monthlyVariance:null,closingBalance:0,desiredDriverProfitMonthly:null,effectiveMonthlyTarget:null,currentDailyTarget:null,currentBaseDaily:null,currentPeriodBaseTarget:null,recoveryAdjustment:0,dailyRecovery:0,activeDays:0,financialDays:0,remainingEligibleDays:month?daysInMonth(month):null,targetAllocatedBeforeCurrentDay:0,remainingObligation:null,recoveryAllocatedBeforeCurrentDay:0,recoveryRemaining:0,authority:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT',evidence:calculationEvidence({status:CALCULATION_STATUS.UNAVAILABLE,reason})})
/** Monthly target = authoritative break-even + Admin-set monthly desired profit. Daily guidance divides evenly across calendar days; historical recovery never adds a second adjustment. */
export function deriveRollingDriverTarget({driverTargets=[],from,to,applicableBreakEven=null}={}){
 const start=dateOf(from),end=dateOf(to);if(!start||!end||end<start)return failure('INVALID_PERIOD')
 const month=monthKeyOf(end),record=latestForDay(driverTargets,end);if(!record)return failure('MISSING_AUTHORITATIVE_TARGET_INPUT',month)
 const be=finite(applicableBreakEven),profit=finite(record.desiredDriverProfit);if(be==null||profit==null||profit<0)return failure('MISSING_AUTHORITATIVE_TARGET_INPUT',month)
 const days=daysInMonth(month);if(!days)return failure('INVALID_TARGET_MONTH',month)
 const monthly=be+profit,daily=monthly/days
 return {available:Number.isFinite(daily),reason:Number.isFinite(daily)?null:'INVALID_AUTHORITATIVE_TARGET',balanceBefore:0,balance:0,openingBalance:0,openingRecovery:0,newRecovery:0,recoveryAllocated:0,recoveryAchieved:0,closingRecovery:0,indicativeProfit:null,indicativeLoss:0,monthlyBreakEvenRevenue:be,monthlyVariance:null,closingBalance:0,desiredDriverProfitMonthly:profit,effectiveMonthlyTarget:monthly,currentDailyTarget:daily,currentBaseDaily:daily,currentPeriodBaseTarget:monthly,recoveryAdjustment:0,dailyRecovery:0,activeDays:days,financialDays:days,remainingEligibleDays:days,targetAllocatedBeforeCurrentDay:0,remainingObligation:monthly,recoveryAllocatedBeforeCurrentDay:0,recoveryRemaining:0,currentTargetMonth:month,authority:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT',evidence:calculationEvidence({status:CALCULATION_STATUS.AUTHORITATIVE,source:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT'})}
}
