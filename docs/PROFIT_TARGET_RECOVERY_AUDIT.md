# Profit / Break-even / Driver Target Recovery Audit

Status: AUDIT COMPLETE — no production calculation behavior changed.

## Scope
Trace the current relationship between provisions/payments, authoritative break-even, driver target stabilization, and period history before implementing the frozen Indicative Profit / Actual Profit / loss-recovery model.

## Findings

### 1. Provision and payment paths already exist separately
- `performanceEngineV2.js` derives period maintenance and compliance provisions.
- Maintenance provision is KM-based and every applicable vehicle KM is allocated at the effective maintenance rate.
- Compliance provision accrues by calendar-day validity.
- `loanEngine.js` derives loan provision accumulated and rolling provision balance.
- Loan provision balance is provision accumulated minus actual loan payments.
- Maintenance/compliance settlement records are also read separately from provision calculations.

**Conclusion:** provision settlement/balance is already conceptually separate from period operating economics. Do not reuse provision balance as break-even input.

### 2. Break-even is already a separate authority
`authoritativeBreakEven.js` derives monthly break-even from applicable break-even inputs, scheduled loan obligation, compliance provision, fuel cost/km evidence, maintenance provision/km, and vehicle KM.
`financePerformanceAdapter.js` supplies the monthly break-even inputs and exposes the result as `monthlyBreakEvenRevenue` / `breakEvenRevenue`.

**Conclusion:** retain this authority and add recovery above it rather than creating a second break-even cost engine.

### 3. Current driver target already has a rolling mechanism, but it is NOT the frozen loss-recovery model
`driverTargetStabilization.js` currently builds a monthly base target as monthly break-even + desired driver profit; calculates historical monthly variance as `baseMonthly - actualRevenue`; carries that variance into `balance`; adds the balance to the next month's target; and allocates the current target over remaining eligible financial days with holiday smoothing.

**Critical mismatch with frozen rules:**
- Frozen recovery is derived specifically from closed-month Indicative Profit, not generic target-vs-revenue variance.
- Frozen recovery carries losses only; positive Indicative Profit does not automatically create a future target credit.
- Frozen recovery is distributed across all calendar days of the next month, not only remaining eligible financial days.
- Frozen recovery is cumulative: opening recovery + new loss - recovery achieved = closing recovery.

**Conclusion:** this is a localized replacement/refactor of the existing rolling-target balance semantics, not a need for a parallel target engine.

### 4. Current performance model does not yet expose the frozen profit concepts
`performanceEngineV2.js` currently exposes `operatingProfit` and `provisionAdjustedProfit`. The latter is effectively the current period operating result after maintenance/compliance provision and is not yet the explicitly named frozen `Indicative Profit` contract.

There is no separate authoritative `Actual Profit` result in the traced performance output that cleanly implements the frozen definition.

**Conclusion:** explicitly expose Indicative Profit and Actual Profit from their respective sources, without deriving Actual Profit from Indicative Profit.

### 5. Current period handling needs care at month close
The service can derive a full IST month range and calculate historical monthly break-even for driver-target stabilization. The frozen model requires a calendar-month close at the final calendar day, followed by creation of next-month loss recovery.

**Conclusion:** month-close/recovery state should be derived deterministically from closed calendar months. The current open month must not create a finalized recovery record prematurely.

## Simulation requirements before implementation
1. profitable month → zero new recovery;
2. loss month → recovery equal to absolute Indicative Loss;
3. recovery distributed equally over every calendar day of the next month;
4. partial recovery → remaining recovery carries forward;
5. consecutive losses → cumulative recovery;
6. full recovery → no duplicate carry-forward;
7. prior profit does not create a target credit;
8. provision payment reduces provision balance but does not change base break-even merely because payment timing changed;
9. period profit and closing rolling balances remain distinct;
10. synthetic and canonical snapshots use the same calculation rules.

## Implementation risk assessment
**Overall:** moderate, localized calculation refactor; not a greenfield accounting system.

The main risk is accidentally retaining the existing generic target variance balance alongside the new loss-recovery balance. That would double-count historical shortfall. The implementation should have exactly one recovery source for driver-target adjustment.

## Planned sequence
`AUDIT → SIMULATE → RECONCILE → IMPLEMENT → CONTRACT TESTS → CI → visible UI/runtime verification`

This commit changes documentation only; production calculations and UI are intentionally unchanged.