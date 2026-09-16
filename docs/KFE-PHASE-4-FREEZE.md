# KFE Phase 4 Freeze

**Phase:** 4 — Operational Records  
**Status:** FROZEN  
**Freeze basis:** CI #332 green on the Phase 3 → Phase 4 verification run.  
**Calendar timezone:** `Asia/Kolkata`

## Frozen boundary

Phase 4 establishes the canonical operational-record layer used by later calculations:

- Shift start/end and odometer boundaries remain canonical operational inputs.
- Completed validated Trips remain authoritative for revenue and business KM.
- Fuel logs remain authoritative for fuel quantity and fuel cost.
- Shift toll and parking remain canonical operational cost inputs.
- Dead KM is derived only as vehicle KM minus business KM.
- Maintenance, compliance/renewal, financing, and other cost records remain typed canonical inputs; no generic Expense authority is introduced.
- Operational reconstruction is a service representation and does not become a persisted competing aggregate authority.
- Cancellation/status remains lifecycle state, not deletion.
- Canonical UUID, mutation/audit lineage, and `canonical-data-changed` propagation remain mandatory.

## Explicit non-goals

Phase 4 does not select or couple to an OCR provider, cloud provider, backup provider, or sync provider. It also does not create a second revenue, vehicle-KM, business-KM, dead-KM, fuel, break-even, or Driver Target authority.

## Drift protection

Any change to these boundaries requires an explicit design-drift review before implementation. Phase 5 may consume these records and existing calculation authorities, but must not redefine their ownership.

## Exit state

Phase 4 is complete and freeze-ready. Phase 5 — Calculation & Performance Integration may proceed chronologically.
