# KFE Phase 5 — Full Calculation Traceability

## Purpose
Freeze calculation ownership and traceability without changing business formulas.

Required chain: authoritative input → normalized snapshot → single calculation owner → authoritative/indicative result → dependent calculation → UI metric.

Reverse chain: UI metric → service field → calculation owner → authoritative input.

## 5A — Authority map

| Concept | Source of truth | Owner | Canonical result |
|---|---|---|---|
| Shift revenue | completed shift end revenue | authoritative revenue helper / performance engine | `revenue` |
| Vehicle KM | shift closing − opening odometer | performance engine | `vehicleKm` |
| Business KM | completed trip KM | performance engine | `businessKm` |
| Dead KM | vehicle KM − business KM | performance engine | `deadKm` |
| Fuel rate | qualified full-tank interval history | fuel calculation | `fuelCostPerKm` + evidence |
| Operating KM forecast | qualifying completed shifts, as-of bounded | operating-KM forecast domain | `operatingKmForecast.calculatedForecast` |
| Monthly break-even | break-even inputs + canonical finance/loan + qualified fuel evidence | `deriveAuthoritativeBreakEven` via finance adapter | `monthlyBreakEvenRevenue` |
| Driver Target | monthly BE + desired driver profit + finalized prior recovery + KM multiplier | driver-target domain | `driverTarget` |
| Loan position | loan schedule + payments + prepayments | canonical loan engine | `finance` |
| Maintenance provision | vehicle KM × effective maintenance rate | performance engine | `maintenanceProvision` |
| Compliance provision | validity-day allocation of compliance cost | performance engine | `renewalProvision` |
| Indicative Profit | authoritative revenue − period provisions | finance adapter | `indicativeProfit` |
| Operating Profit | financial revenue − actual operating expenses (after BR-11 toll/parking treatment) | performance engine | `operatingProfit` / `actualProfit` |
| Performance Actual P/L | Operating Profit − full scheduled EMI for selected period | finance adapter | `performanceHeadlineActualProfit` |
| Performance Provisional P/L | Performance Actual P/L − maintenance provision − compliance provision − pre-business loan recovery − historical maintenance recovery | finance adapter | `performanceHeadlineProvisionalProfit` |
| Recovery | prior finalized recovery + current indicative result | driver-target domain | recovery fields |
| Financial facts | authoritative metrics mapped to explicit facts | financial fact model | `financialFacts` |

## 5B — Dependency rules
1. A calculation must not silently rebuild another calculation owned elsewhere.
2. Authoritative results consume only qualified/authoritative dependencies.
3. Indicative results cannot silently become authoritative inputs.
4. Daily break-even allocates authoritative monthly break-even; it is not a second cost-build formula.
5. Driver Target remains separate from actual revenue and actual profit.
6. Trip fare is supporting detail; completed shift end revenue is the ERP revenue authority.
7. Operating Profit uses financial revenue and actual operating expenses; the separate Performance Actual P/L includes the full scheduled EMI, and Provisional P/L additionally subtracts the applicable provisions/recovery.
8. Provision balances and settlements remain distinct.
9. Forecast exposes calculated and effective values separately for future override readiness.
10. Open-period calculations respect the selected as-of boundary.

## 5C — Reconciliation checks
The contract verifies the real 5-year synthetic path, frozen forecast/multiplier, profit identities, provision identity, authority declarations, financial-fact sources, future-data isolation, and Driver Target dependency on authoritative break-even.

## 5D — UI traceability boundary
Performance UI consumes `PerformanceService.getMetrics`. Work consumes the authoritative Performance result. Vue screens do not reconstruct material finance or target formulas.

## 5E — CI gate
`phase5CalculationTraceability.contract.js` is registered in `src/tests/runAllContracts.js`, placing the traceability gate inside the consolidated CI contract suite.

## 5F — Exit criteria
- One documented owner per material calculation.
- No targeted duplicate authority.
- Evidence state is explicit where qualification can fail.
- 5-year synthetic numerical boundary remains frozen.
- As-of boundary prevents future-data leakage.
- CI executes the new traceability contract.

No business formula is changed by Phase 5.
