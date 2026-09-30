# KFE Phase 11 — Controlled Real-World Pilot Gate

**Status:** ACTIVE — REAL-WORLD EVIDENCE PENDING  
**Phase:** 11 — Controlled Real-World Pilot

## Exit requirement

Phase 11 closes only after controlled real business activity has actually been performed against the frozen release candidate and the resulting evidence has been reconciled.

CI, browser automation, synthetic data, emulator evidence, documentation, or a contract test alone cannot satisfy this exit.

## Required evidence

The pilot record must identify:

- release-candidate source SHA;
- date/time window of controlled activity;
- actual trips/shift activity performed;
- actual fares/revenue recorded;
- cancellations, if any;
- opening/closing odometer;
- GPS/location evidence;
- fuel/refuelling, if any;
- expenses/toll/parking, if any;
- target/shift/daily totals;
- Timeline and Performance reconciliation;
- overlay/notification observations where applicable;
- discrepancies found and their disposition.

## Device sequencing

Physical Android/phone validation remains deferred until after Phase 13. Phase 11 therefore cannot claim device-only PASS.

## Current decision

**DO NOT CLOSE PHASE 11 WITHOUT REAL PILOT EVIDENCE.**

This gate exists to prevent CI or synthetic fixtures from being incorrectly promoted to real-world pilot evidence.
