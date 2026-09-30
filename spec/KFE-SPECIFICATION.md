# KFE 2.0 Master Specification

This document is the human-readable index for the authoritative machine-readable governance contract.

## Current product boundary
KFE 2.0 is a simple single-vehicle ERP today. Future fleet/integration capabilities are extension points only and are not current functionality.

## Architecture
`Presentation → Application → Domain → Repository Contracts → Infrastructure → Local Database → Future Integrations`

## Frozen business rules
1. Vehicle lifecycle history is preserved, including activation, sale, retirement, acquisition/sale data, status and odometer endpoints.
2. Work sessions support business and personal scope and break handling.
3. Every Work lifecycle transition is recorded as an authoritative operational event with its own timestamp. The event must carry GPS evidence when available, with human-readable place resolution preferred; coordinates are the fallback evidence. GPS capture and place resolution are supplementary and must never block the authoritative Work save. If unavailable, the event explicitly records unavailable/pending status and never invents a location.
4. Personal vehicle use is excluded from business dashboard calculations for fuel, maintenance, revenue and profit.
5. Fixed expenses are business-level obligations and continue across active calendar days, including personal-only and non-working days.
6. Loan EMI is a continuing business obligation and is not reduced by personal-use days.
7. Maintenance is a business expense and must support usage-based allocation/provisioning for meaningful cost/km and break-even calculations.
8. Maintenance records retain their identity and historical state and support optional receipt/reference and work-session linkage.
9. Loan amortization separates principal and interest and supports prepayment with zero prepayment charges.
10. Soft deletion preserves historical records.
11. Tax Reserve is permanently excluded unless explicitly restored by a future specification change.
12. Monetary boundaries use safe integer paise.
13. Future capabilities must not be implemented without an explicit specification change.

## Change control
A business-rule change requires, in one traceable change set:

`specification → contract → test/golden vector → implementation`

No implementation may silently change the meaning of a frozen rule.

## Deployment control
The canonical CI pipeline is the deployment gate. Any mandatory governance or existing validation failure blocks deployment.
