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

## Remaining calculation-audit gaps

- **Historical rolling target reconstruction across months — fixed in PR #230:** the target stabilizer now accepts month-specific break-even values. PerformanceService reconstructs each prior active month’s own break-even estimate and passes it to the rolling target calculation; a regression vector verifies January shortfall is carried into June using different month costs. If an active historical day lacks the break-even needed to reconstruct its balance, the target is now marked unavailable rather than silently falling back to a base target.
- **Displayed-value verification:** the three-year contract independently asserts canonical numeric outputs, but some evidence rows construct their displayed string by formatting the canonical output itself. That proves formatting, not that the browser rendered the same value. Existing rendered UI smoke checks currently verify the presence of calculation labels, not the numeric values against seeded synthetic data.
- **Loan principal reconciliation:** the three-year fixture's 36 × ₹11,324 cash total remains a separate output-only oracle because it omits loan inputs. PR #230 now adds an independent fully specified 60-month synthetic loan with 36 scheduled payments, checking paid and remaining installments and reconciling opening principal minus allocated principal to outstanding principal.
- **₹815 / ₹4,672 component-level trace:** these accepted reference outputs are not being challenged. Their component/source provenance is simply not present in this fixture, so this audit does not claim independent component-level recomputation from the three-year fixture.

## Evidence boundary

A green contract suite is source/canonical evidence, not proof that a live deployed PWA renders every monetary value correctly. PR #230 must pass the full CI workflow; it has not been merged or deployed by this audit. Do not promote this document to “all audit gaps closed” until the remaining items above have their own fixtures, expected values, canonical outputs, and (for display checks) DOM-level numeric assertions.