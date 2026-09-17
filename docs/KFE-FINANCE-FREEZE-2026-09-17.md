# KFE Finance Freeze — 2026-09-17

Status: FROZEN implementation supplement to the authoritative KFE business and calculation contracts.

## Frozen loan authority

- KFE standard loan interest rate: **10% p.a.**
- Admin enters loan amount, tenure and start date. The ERP calculates EMI and amortization.
- Loan uses reducing-balance amortization with actual-days/365 interest.
- Scheduled EMI is a calculated obligation; it is not an actual cash payment until an actual payment is recorded.

## Frozen overdue rule

For each unpaid scheduled EMI:

`overdue amount = unpaid scheduled principal + unpaid scheduled interest + additional overdue interest`

Additional overdue interest is charged only on unpaid scheduled interest:

`additional overdue interest = unpaid scheduled interest × 10% / 365 × overdue days`

## Frozen actual-payment allocation

1. Oldest unpaid EMI obligation first.
2. Within that obligation, settle additional overdue interest first.
3. Then scheduled interest.
4. Then scheduled principal.
5. Continue chronologically to the next unpaid EMI obligation.
6. EMI payment never automatically becomes a prepayment.
7. A separate prepayment is required for additional principal reduction.

This preserves chronological EMI settlement.

## Frozen prepayment rules

- Prepayment is blocked while any overdue EMI remains.
- Prepayment directly reduces principal.
- EMI remains unchanged; tenure reduces.
- Effective date is the actual prepayment date.
- No prepayment penalty.
- If the applied amount reaches remaining principal, the loan closes.
- Estimate and Record Prepayment remain separate workflows.

## Frozen pre-business EMI economic treatment

If an EMI obligation is due before the KFE business start date:

- The Finance obligation remains real and unchanged.
- Normal overdue and payment-allocation rules continue to apply.
- For Break-even and Driver Target only, the pre-business burden uses the existing **12-month pre-business recovery normalization**.
- The normalization does not modify the loan, schedule, overdue balance, payment records or actual cash flow.
- Actual payments remain actual cash-flow events.

Finance is the authority for the real obligation. Economics is the authority for normalized Break-even/Driver Target treatment.

## Implementation boundary

Scheduled obligations are derived from the canonical loan and actual transaction records. They are not an independently editable source of truth.

Admin forms collect source inputs only. Calculated EMI, allocation, overdue, outstanding principal, tenure reduction and Break-even/Driver Target values are derived by the domain/application calculation path.
