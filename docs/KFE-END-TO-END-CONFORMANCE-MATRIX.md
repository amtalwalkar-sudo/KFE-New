# KFE End-to-End Conformance Matrix

**Status:** Supporting conformance/evidence contract.  
**Authority:** `KFE-AUTHORITY-MAP.md`; this matrix does not redefine business or architecture rules.

## Enforcement principle

A requirement is conformant only when it has a canonical owner, an implementation path, executable regression evidence, cross-runtime evidence where applicable, recovery/idempotency evidence where needed, and the correct release proof level.

## 11-step method

| Step | Conformance requirement | Required evidence | Gate |
|---|---|---|---|
| 1 | Frozen requirements become executable contracts | End-to-end conformance and layer-specific contracts | CI |
| 2 | One canonical record model and lifecycle invariants | PWA WorkService/ShiftTripRepository and native command/persistence contracts | CI |
| 3 | PWA ↔ Android parity | Shared lifecycle rules, native adapter invariants, event synchronization and overlay reconstruction | CI + emulator |
| 4 | Complete Work state machine | Deterministic Golden Ride across PWA and native adapter paths | CI |
| 5 | Interruption/recovery | Durable native action journal, atomic native canonical commits, PWA synchronization/acknowledgement and reload recovery | CI + emulator |
| 6 | Identity invariants | Stable Shift/Trip/snapshot IDs, idempotency keys, stale-command rejection and fare/cancellation association | CI + emulator |
| 7 | Calculation convergence | Domain calculation contracts plus browser/native persistence-projection parity | CI |
| 8 | Requirement → implementation → test → evidence coverage | This matrix and executable coverage assertions | CI |
| 9 | Proof levels are separated | Repository, emulator and physical-device evidence explicitly tracked | CI/release + device gate |
| 10 | Golden Ride | Shift start, multiple completed/cancelled rides, fare/skip, fuel entry and PWA shift end | CI + emulator |
| 11 | Release enforcement | Conformance suite is part of the consolidated test/build gate | CI |

## Canonical cross-runtime model

```
Business / lifecycle / data authority
                 ↓
          Shared domain rules
                 ↓
   ┌─────────────┴──────────────┐
   ↓                            ↓
PWA Work command adapter    Android overlay command adapter
   ↓                            ↓
IndexedDB repository        Native SQLite transaction
   ↓                            ↓
   └────── canonical record model ──────┘
                 ↓
     Native event synchronization
                 ↓
 PWA read projection / Timeline / Performance
```

The two physical stores are platform-specific persistence adapters. They do not create two business histories or competing business rules. Shift start/end remain PWA-owned. Android overlay ride commands must be durable and executable while the WebView is unavailable; PWA replay synchronizes and acknowledges native events, it is not a prerequisite for the native commit.

## Golden Ride scenario

```
PWA START SHIFT (opening odometer)
→ SHIFT ACTIVE
→ GO TO PICKUP (PWA or native overlay)
→ START RIDE
→ END RIDE
→ FARE SAVE OR EXPLICIT SKIP
→ NEXT RIDE OR CANCELLATION
→ CANCEL FEE SAVE (if applicable)
→ PWA END SHIFT (closing odometer)
→ REOPEN / RECONSTRUCT FROM CANONICAL RECORDS
```

The scenario verifies:
- one stable Trip ID from pickup through terminal state and fare/cancellation entry;
- cancellation is terminal and cannot become completion;
- native overlay commits durably before acknowledging the visible action;
- PWA replay is idempotent synchronization, not a second business commit;
- fare and cancellation fee remain distinct source facts;
- Shift revenue follows the single domain rule, with a transactionally mirrored native projection;
- GPS is optional event evidence and never blocks a ride transition or changes its business timestamp;
- only the four event snapshots exist; no continuous tracking, route trace or ride-distance calculation;
- no personal/dead-kilometre classification, gap allocation, reconciliation or shift-review workflow exists in the current product;
- reload/restart reconstructs state from canonical persistence rather than a rendered screen.

## Proof levels

### Level A — Repository / CI

- domain transition and calculation rules;
- PWA application/repository path;
- native command and atomic persistence path;
- plugin registration and event synchronization;
- recovery/idempotency contracts;
- production PWA build, Capacitor sync and Android APK build.

### Level B — Android emulator

- exact APK installation;
- native plugin registration;
- overlay lifecycle and durable native commits;
- notification/foreground-service behavior;
- event replay, process interruption and PWA reconstruction where emulator-supported.

### Level C — Physical Android device

- real four-event GPS capture with screen/background conditions;
- offline operation and permission denial;
- real overlay swipe/touch behavior;
- OEM background restrictions and restart recovery;
- locality correctness using trusted location references;
- exact release APK on the target phone.

A passing repository or emulator gate does not substitute for Level C evidence.

## Failure rule

Any uncovered requirement, competing business authority, stale identity path, missing recovery evidence or missing required proof level keeps conformance open. A skipped gate is not a pass.

## Evidence record

Retain commit SHA, CI run/jobs, exact APK SHA-256, emulator output, runtime smoke output and physical-device acceptance record.
