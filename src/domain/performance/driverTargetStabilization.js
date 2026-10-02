import { istDateKey, istMonthKey } from '../time/ist.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'

const finite=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v)
const dateOf=v=>{const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d:null}
const keyOf=v=>istDateKey(v), monthKeyOf=v=>istMonthKey(v)
const live=xs=>(xs||[]).filter(x=>!x?.deletedAt&&x?.deleted!==true)
const effectiveDateKey=x=>keyOf(x?.effectiveFrom||x?.validFrom||x?.startDate)
const effectiveUntilKey=x=>keyOf(x?.effectiveUntil||x?.validUntil||x?.endDate)
const applies=(x,day)=>!!keyOf(day)&&x?.active!==false&&x?.status!=='INACTIVE'&&(effectiveDateKey(x)||'1970-01-01')<=keyOf(day)&&keyOf(day)<=(effectiveUntilKey(x)||'9999-12-31')
const latestForDay=(xs,day)=>live(xs).filter(x=>applies(x,day)).sort((a,b)=>String(effectiveDateKey(b)||'').localeCompare(String(effectiveDateKey(a)||''))||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null
const daysInMonth=month=>{if(!month)return 0;const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
const monthStartDate=month=>{const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1,1,12))}
const nextMonth=month=>{const d=monthStartDate(month);d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,7)}
const prevMonth=month=>{const d=monthStartDate(month);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
const dateKeysForMonth=month=>{const[y,m]=month.split('-').map(Number),n=daysInMonth(month),out=[];for(let i=1;i<=n;i++)out.push(`${month}-${String(i).padStart(2,'0')}`);return out}
const normalizeNonWorkingDates=value=>new Set((Array.isArray(value)?value:String(value||'').split(/[,\n\s]+/)).map(v=>String(v).trim()).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)))
const eligibleKeys=(month,nonWorking)=>dateKeysForMonth(month).filter(k=>!nonWorking.has(k))
const failure=(reason,month=null)=>({available:false,reason,balanceBefore:0,balance:0,openingBalance:0,openingRecovery:0,newRecovery:0,recoveryAllocated:0,recoveryAchieved:0,closingRecovery:0,indicativeProfit:null,indicativeLoss:0,monthlyBreakEvenRevenue:null,monthlyVariance:null,closingBalance:0,desiredDriverProfitMonthly:null,effectiveMonthlyTarget:null,currentDailyTarget:null,currentBaseDaily:null,currentPeriodBaseTarget:null,recoveryAdjustment:0,dailyRecovery:0,activeDays:0,financialDays:0,remainingEligibleDays:month?daysInMonth(month):null,targetAllocatedBeforeCurrentDay:0,remainingObligation:null,recoveryAllocatedBeforeCurrentDay:0,recoveryRemaining:0,currentTargetMonth:month,authority:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT_PLUS_PERFORMANCE_RECOVERY',nonWorkingDates:[],eligibleDaysInMonth:month?daysInMonth(month):0,openingCarryBalance:0,projectedClosingBalance:null,evidence:calculationEvidence({status:CALCULATION_STATUS.UNAVAILABLE,reason})})

const revenueByDay=shifts=>{const map=new Map();for(const s of live(shifts)){const d=dateOf(s.shiftEndAt||s.shiftStartAt),k=d&&keyOf(d);if(!k)continue;const value=finite(s.revenue);if(value!=null)map.set(k,(map.get(k)||0)+value)}return map}
const monthRevenue=(map,month)=>dateKeysForMonth(month).reduce((s,k)=>s+(map.get(k)||0),0)
const dateRevenueBefore=(map,dateKey)=>{let s=0;for(const[k,v]of map){if(k<dateKey)s+=v}return s}
const dateRevenueThrough=(map,dateKey)=>{let s=0;for(const[k,v]of map){if(k<=dateKey)s+=v}return s}

function targetRecordForMonth(driverTargets,month){
  return latestForDay(driverTargets,monthStartDate(month))
}

function buildMonthObligation({month,driverTargets,authoritativeBreakEvenForMonth}){
  const record=targetRecordForMonth(driverTargets,month)
  if(!record)return null
  const be=finite(authoritativeBreakEvenForMonth?.({month,day:monthStartDate(month)}))
  const profit=finite(record.desiredDriverProfit)
  if(be==null||profit==null||profit<0)return null
  const nonWorkingDates=normalizeNonWorkingDates(record.nonWorkingDates||record.unavailableDates)
  const eligible=eligibleKeys(month,nonWorkingDates)
  const monthly=be+profit
  return {record,be,profit,monthly,nonWorkingDates,eligible,daily:eligible.length?monthly/eligible.length:null}
}

/**
 * Financial truth remains the authoritative monthly break-even.
 * This layer adds only operational allocation and signed performance carry:
 * prior shortfall increases future guidance; prior surplus reduces it.
 * Planned non-working dates receive zero target and their share is redistributed
 * across the remaining eligible days. No historical balance changes actual P/L.
 */
export function deriveRollingDriverTarget({
  driverTargets=[],trips=[],from,to,applicableBreakEven=null,
  historicalBreakEvenForDay=null,authoritativeBreakEvenForMonth=null
}={}){
  const start=dateOf(from),end=dateOf(to);if(!start||!end||end<start)return failure('INVALID_PERIOD')
  const month=monthKeyOf(end),record=latestForDay(driverTargets,end);if(!record)return failure('MISSING_AUTHORITATIVE_TARGET_INPUT',month)
  const be=finite(applicableBreakEven),profit=finite(record.desiredDriverProfit);if(be==null||profit==null||profit<0)return failure('MISSING_AUTHORITATIVE_TARGET_INPUT',month)
  const monthObligation=buildMonthObligation({month,driverTargets,authoritativeBreakEvenForMonth:authoritativeBreakEvenForMonth||historicalBreakEvenForDay||(()=>be)})
  if(!monthObligation)return failure('MISSING_AUTHORITATIVE_TARGET_INPUT',month)
  const days=daysInMonth(month);if(!days)return failure('INVALID_TARGET_MONTH',month)
  const revenueMap=revenueByDay(arguments[0]?.shifts||[])
  const targetDayKey=keyOf(end)
  const nonWorking=monthObligation.nonWorkingDates
  const eligible=monthObligation.eligible
  const isWorkingDay=eligible.includes(targetDayKey)

  // Carry starts from the first authoritative target month and rolls month by month.
  // A negative balance is a surplus that offsets future obligations; it is never
  // allowed to make the driver's target negative.
  const records=live(driverTargets).map(r=>effectiveDateKey(r)).filter(Boolean).sort()
  const firstMonth=records[0]?records[0].slice(0,7):month
  let cursor=firstMonth
  let openingCarry=0
  let previousMonth=null
  while(cursor<month){
    const obligation=buildMonthObligation({month:cursor,driverTargets,authoritativeBreakEvenForMonth:authoritativeBreakEvenForMonth||historicalBreakEvenForDay})
    if(!obligation) return failure('MISSING_HISTORICAL_TARGET_INPUT',month)
    openingCarry=openingCarry+obligation.monthly-monthRevenue(revenueMap,cursor)
    previousMonth=cursor
    cursor=nextMonth(cursor)
  }

  const baseDaily=monthObligation.daily
  if(!Number.isFinite(baseDaily))return failure('NO_ELIGIBLE_OPERATING_DAYS',month)
  const beforeEligible=eligible.filter(k=>k<targetDayKey)
  const allocatedBefore=beforeEligible.length*baseDaily
  const revenueBefore=dateRevenueBefore(revenueMap,targetDayKey)
  const balanceBefore=openingCarry+allocatedBefore-revenueBefore
  const remainingEligibleDays=isWorkingDay?eligible.filter(k=>k>=targetDayKey).length:eligible.filter(k=>k>targetDayKey).length
  const recoveryAdjustment=isWorkingDay&&remainingEligibleDays>0?balanceBefore/remainingEligibleDays:0
  const currentDailyTarget=isWorkingDay?Math.max(0,baseDaily+recoveryAdjustment):0
  const revenueThrough=dateRevenueThrough(revenueMap,targetDayKey)
  const allocatedThrough=eligible.filter(k=>k<=targetDayKey).length*baseDaily
  const closingBalance=openingCarry+allocatedThrough-revenueThrough
  const projectedClosingBalance=openingCarry+monthObligation.monthly-monthRevenue(revenueMap,month)
  const remainingObligation=Math.max(0,monthObligation.monthly+openingCarry-revenueThrough)
  const financialDayKeys=new Set(live(trips).filter(t=>t?.status==='COMPLETED').map(t=>{const d=dateOf(t.tripEndAt||t.tripStartAt);return d&&monthKeyOf(d)===month?keyOf(d):null}).filter(Boolean))
  const signedAdjustment=Math.abs(recoveryAdjustment)<1e-10?0:recoveryAdjustment
  return {
    available:true,reason:null,balanceBefore, balance:closingBalance,
    openingBalance:openingCarry,openingRecovery:Math.max(0,openingCarry),newRecovery:Math.max(0,monthObligation.monthly-monthRevenue(revenueMap,month)),
    recoveryAllocated:Math.max(0,allocatedBefore),recoveryAchieved:revenueBefore,
    closingRecovery:Math.max(0,closingBalance),indicativeProfit:null,indicativeLoss:Math.max(0,closingBalance),
    monthlyBreakEvenRevenue:monthObligation.be,monthlyVariance:null,closingBalance,
    desiredDriverProfitMonthly:monthObligation.profit,effectiveMonthlyTarget:monthObligation.monthly,
    currentDailyTarget, currentBaseDaily:baseDaily,currentPeriodBaseTarget:monthObligation.monthly,
    recoveryAdjustment:signedAdjustment,dailyRecovery:signedAdjustment,
    activeDays:financialDayKeys.size,financialDays:financialDayKeys.size,
    remainingEligibleDays, targetAllocatedBeforeCurrentDay:allocatedBefore,
    remainingObligation,recoveryAllocatedBeforeCurrentDay:Math.max(0,allocatedBefore),
    recoveryRemaining:Math.max(0,closingBalance),currentTargetMonth:month,
    authority:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT_PLUS_PERFORMANCE_RECOVERY',
    nonWorkingDates:[...nonWorking].filter(k=>k.startsWith(month)).sort(),
    eligibleDaysInMonth:eligible.length,openingCarryBalance:openingCarry,
    projectedClosingBalance,
    targetDayIsNonWorking:!isWorkingDay,
    priorMonth:previousMonth,
    evidence:calculationEvidence({status:CALCULATION_STATUS.AUTHORITATIVE,source:'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT_PLUS_PERFORMANCE_RECOVERY',dependencies:{monthlyBreakEven:'AUTHORITATIVE',driverProfit:'ADMIN',performanceCarry:'OPERATIONAL',nonWorkingDates:'ADMIN'}})
  }
}
