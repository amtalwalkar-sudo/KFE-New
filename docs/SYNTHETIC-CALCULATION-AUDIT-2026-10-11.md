# Synthetic Calculation Audit — 2026-10-11

**Scope:** Three-year synthetic fixture (2023–2025), canonical calculation contracts, calculation authority rules, and focused adversarial inputs. Synthetic values are not production records.

## Confirmed canonical reconciliations

| Calculation | Synthetic oracle | Verification in repository | Result |
|---|---:|---|---|
| Calendar span | 1,096 days / 36 months | Fixture generator + canonical evidence contract | PASS |
| Vehicle distance | 219,200 km | Canonical Performance engine over generated shift odometers | PASS |
| Fuel spend | ₹701,440 | Canonical Performance engine over generated fuel records | PASS |
| Ongoing maintenance provision | ₹350,720 at ₹1.60/km | Canonical engine + daily/monthly rollup reconciliation | PASS |
| Compliance provision | ₹90,000 across 2023–2025 | Canonical engine, 365/366-day years, monthly and annual reconciliation | PASS |
| Historical maintenance burden | ₹24,000 = 60,000 km × ₹0.40/km | Historical-recovery calculation and first-12-month range | PASS |
| EMI cash fixture | 36 payments / ₹407,664 | Synthetic rollup and loan finance contracts | PASS for cash total; principal schedule is a separate input-dependent reconciliation |
| Maintenance overpayment | ₹49,280 above accrued provision; bucket balance floored at ₹0 | Canonical Performance output | PASS |
| Compliance overpayment | ₹5,000 above accrued provision; bucket balance floored at ₹0 | Canonical Performance output | PASS |
| Leap-year compliance | ₹30,000 / 366 per covered day; annual total ₹30,000 | Canonical daily accrual and monthly paise reconciliation | PASS |
| Invalid loan payment dates | 3 records / ₹3,000 excluded; valid ₹500 payment counted | Canonical loan position | PASS |
| Fuel quantity | ₹500 / ₹82 = 6.0975609756… kg; 6.1 is display rounding | Domain function | PASS |
| Target surplus boundary | Required ₹1,000, eligible earnings ₹1,350 → target ₹0, separate ₹350 credit | Rolling target contract | PASS |
| Actual vs provisional P/L | Actual operating result −₹701,440; provisional result subtracts a further ₹440,720 of maintenance + compliance accruals | Finance-aware canonical output | PASS for this synthetic no-loan/no-actual-maintenance scenario |
| Provisional deduction reference | ₹815 for the agreed June 2024 scenario | Accepted business oracle; this fixture has no component inputs | Accepted output; not recomputed by this fixture |
| Break-even reference | ₹4,672 for the agreed reference scenario | Accepted business oracle; this fixture has no component inputs | Accepted output; not recomputed by this fixture |

## Defects confirmed and fixes in PR #230

1. **Fuel intervals could qualify without a vehicle identity.** The authority matrix requires a stable vehicleId at both ends, but the domain function treated two missing IDs as the same vehicle. It now rejects null/blank IDs. Tests cover both rejected unassociated fills and a valid same-vehicle interval.
2. **The fuel unit test contradicted the authority contract.** Its supposed full-tank baseline/interval rows omitted isFullTank=true and vehicleId, yet expected an authoritative ₹/km value. The test now supplies those required fields, and the Performance contract now expects unassociated logs to remain unavailable.
3. **Negative cost inputs could reduce break-even.** A negative maintenance-provision rate (or negative fixed-cost input) was treated as a present component and could lower the computed total. The break-even domain now treats negative cost/rate values as missing/invalid, keeps the result indicative, and excludes the negative amount. The synthetic contract includes a regression vector for a negative maintenance rate.
4. **Rolling target balance could reset across months.** Historical desiredDriverProfit-only target records did not have their own historical break-even supplied to the rolling calculation, so they could be skipped. PerformanceService now builds a month-specific break-even map for historical active months and the stabilizer uses that month’s value. A January-to-June shortfall carryover regression is included.
5. **Loan principal/installment reconciliation lacked a fully specified independent fixture.** PR #230 adds a 60-month synthetic loan with 36 scheduled payments, checking paid and remaining installments and reconciling opening principal minus allocated principal to outstanding principal.

## Verification status

- **Canonical synthetic and regression contracts:** PASS in the repository's contract suite.
- **UI Isolation Gate:** PASS on PR head `48cb0931801a9bb77adfbabac3bb79dfbf69eb36`.
- **Phase 0 Governance Gate:** PASS on the same PR head.
- **KFE 2.0 single CI:** PASS on run [38093151698](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/38093151698), head `48cb0931801a9bb77adfbabac3bb79dfbf69eb36`. Jobs: `build-and-test` PASS, `android-release-gate` PASS, `deploy` skipped because this is a pull request.
- **Merge/deploy/live runtime:** not performed by this PR; do not infer production verification from green CI.

## Remaining verification boundary

- **Rendered numeric-value parity remains unverified.** `tools/calculation-matrix-ui-smoke.mjs` currently checks that 30 calculation labels appear in the browser DOM; it does not seed the three-year fixture into the running PWA and compare every rendered number against that fixture's expected value. Canonical arithmetic is covered, but this is not yet a DOM-level numeric parity test.
- **₹815 / ₹4,672 component-level trace:** these accepted reference outputs are not being challenged. Their component/source provenance is not present in this three-year fixture, so this audit does not claim independent component-level recomputation for those two scenarios.

**Conclusion:** The source-level synthetic calculation audit and regression fixes are complete for the confirmed defects listed above, and full PR CI is green. The audit is not a claim that every rendered browser number or the live deployed PWA has been verified; numeric DOM parity and post-merge deployed-runtime verification remain explicit gates.
