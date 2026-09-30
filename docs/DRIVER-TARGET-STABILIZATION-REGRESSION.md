# Driver Target Stabilization Regression Contract

**Status:** AUTHORITATIVE IMPLEMENTATION CONTRACT

This contract protects the frozen driver-target interpretation without introducing a new smoothing formula.

## Invariants

1. `baseTarget = applicableBreakEvenCost + desiredDriverProfit`.
2. `Driver Target = current required target after applying the existing lifetime/rolling recovery balance`.
3. Active working days participate in the rolling balance.
4. Inactive/off days do not create a driver target.
5. Inactive/off days do not increase recovery requirements.
6. A below-target active day creates/reinforces recovery.
7. An above-target active day reduces outstanding recovery or creates surplus.
8. A subsequent active-day target is derived from the carried balance; it does not reset independently.
9. No N-day average, arbitrary smoothing window, or second recovery ledger may be introduced.
10. Admin-entered desired driver take-home/profit is an input, not the complete active-day target when a carried recovery/surplus balance applies.

## Required deterministic vectors

The implementation test suite must cover at minimum:

- one active day exactly at target → no new recovery from that day's variance;
- one active day below target → recovery increases;
- one active day above target → recovery decreases or surplus is carried;
- an off day between two active days → no target is generated and no recovery increase occurs merely because the day is inactive;
- the next active day → target reflects the carried balance;
- multiple consecutive active days → balance carries forward without reset;
- zero active days in a period → no driver target is generated for the period;
- changing the Admin desired take-home/profit input → changes the base requirement, without changing the smoothing mechanism;
- missing authoritative recovery-balance input → calculation is explicitly incomplete/unavailable rather than replaced with an invented smoothing calculation.

These tests protect the frozen semantics; they do not authorize a new recovery formula.
