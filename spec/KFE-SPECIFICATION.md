# KFE 2.0 Master Specification

This document is the human-readable index for the authoritative machine-readable governance contract.

## Current product boundary
KFE 2.0 is a simple single-vehicle ERP today. Future fleet/integration capabilities are extension points only and are not current functionality.

## Architecture
`Presentation → Application → Domain → Repository Contracts → Infrastructure → Local Database → Future Integrations`

## Canonical authority boundary

The product specification is an index and change-control pointer. It does not duplicate the current business rules, data model, formulas, operational lifecycle, or UI rules.

Current authoritative documents are:

1. Business meaning/rules — KFE_BUSINESS_RULES_REGISTER.md
2. Arithmetic/calculations — docs/KFE-CALCULATION-SPECIFICATION.md
3. Architecture/ownership — docs/KFE-ARCHITECTURE-CONTRACT.md
4. Canonical data model — docs/KFE-CANONICAL-DATA-CONTRACT.md
5. Operational lifecycle — docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md
6. UI/shell — docs/UI-UX-SHELL-CONTRACT.md
7. Launch sequencing — KFE_LAUNCH_MASTER_PLAN.md

The complete authority relationship is maintained in KFE-AUTHORITY-MAP.md.

## Change control
A business-rule change requires, in one traceable change set:

`specification → contract → test/golden vector → implementation`

No implementation may silently change the meaning of a frozen rule.

## Deployment control
The canonical CI pipeline is the deployment gate. Any mandatory governance or existing validation failure blocks deployment.
