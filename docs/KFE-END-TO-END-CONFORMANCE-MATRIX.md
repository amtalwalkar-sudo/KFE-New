# KFE End-to-End Conformance Matrix

**Status:** SUPPORTING CONFORMANCE / EVIDENCE CONTRACT  
**Purpose:** Prove that the frozen KFE business, lifecycle, data, Work, form/recovery, PWA shell, Android native, and release rules are connected to implementation and executable evidence.

This document does not redefine any frozen rule. The canonical authorities remain the documents listed by `KFE-AUTHORITY-MAP.md`.

## Enforcement principle

A frozen requirement is **not implemented merely because source code exists**. It is considered conformant only when the requirement has:

1. a canonical owner;
2. an implementation path;
3. an executable contract at the appropriate layer;
4. cross-surface evidence where PWA and Android both participate;
5. recovery/duplicate evidence where the rule is interruption-sensitive;
6. release evidence at the highest applicable proof level.

## 11-step method

| Step | Conformance requirement | Required evidence | Gate |
|---|---|---|---|
| 1 | Convert frozen rules into executable contracts | `endToEndConformance.contract.js` + existing domain/native/UI contracts | CI |
| 2 | One canonical state/command path | Lifecycle contract + WorkService/ShiftTripRepository convergence checks | CI |
| 3 | PWA ↔ Android parity | shared cockpit derivation, native event bridge, overlay/notification command checks | CI + emulator |
| 4 | Complete Work state machine | deterministic Golden Ride transition sequence | CI |
| 5 | Interruption/recovery at dangerous boundaries | durable native event replay, persisted canonical state, reload/restart checks | CI + emulator |
| 6 | Identity invariants | trip/shift/pending-fare/native-event identity checks; stale-command rejection paths | CI + emulator |
| 7 | Calculation convergence | canonical calculation/data contracts; no native competing business calculation | CI |
| 8 | Requirement → implementation → test → evidence coverage | this matrix + executable coverage assertions | CI |
| 9 | Proof levels are separated | repository, emulator, and physical-device evidence explicitly tracked | CI/release + device gate |
| 10 | Golden Ride | one deterministic end-to-end scenario from install/state seed through shift closure and restart reconstruction | CI + emulator |
| 11 | Release enforcement | conformance suite is part of `npm test` and consolidated CI before build/deploy/release evidence | CI |

## Canonical cross-surface path

```
Frozen authority
      ↓
canonical domain/data/lifecycle rules
      ↓
canonical application command
      ↓
canonical repository mutation
      ↓
canonical persisted state + mutation/audit evidence
      ↓
canonical state reconstruction
      ↓
PWA Work / Android overlay / notification
```

Android GPS is telemetry/evidence, not a second operational lifecycle. Native actions must converge back into the same PWA/application command path.

## Golden Ride scenario

The deterministic conformance scenario is:

```
OFFLINE
→ START SHIFT
→ ODOMETER / GAP GATE
→ ONLINE / READY
→ GO TO PICKUP
→ READY FOR TRIP
→ TRIP ACTIVE
→ TRIP COMPLETION
→ FARE / COMPLETION CONFIRMATION
→ NEXT PICKUP
→ END SHIFT
→ RECONCILIATION
→ SHIFT REVIEW
→ SHIFT ENDED
→ OFFLINE
```

The scenario additionally verifies:

- one stable Trip ID from pickup through completion and fare;
- cancellation is terminal and cannot become completion;
- terminal replay is idempotent;
- pending native actions are replayable and acknowledged only after canonical persistence;
- native GPS is enrichment and cannot block authoritative lifecycle commits;
- authoritative shift revenue remains the ERP revenue source;
- a reload/restart reconstructs state from canonical persistence rather than the last rendered surface.

## Proof levels

### Level A — Repository/CI
Deterministic and source-level proof:

- domain transition rules;
- repository ownership;
- PWA command path;
- Android bridge/event path;
- persistence/replay contracts;
- calculation authority boundaries;
- production build and existing runtime smoke tests.

### Level B — Android emulator
Required for:

- exact APK installation;
- Capacitor/native plugin registration;
- overlay service lifecycle;
- notification action delivery;
- durable native event replay;
- process/background/recreation behavior that the emulator can exercise.

### Level C — Physical Android device
Required before declaring native GPS/background behavior device-validated:

- real screen-off/background GPS capture;
- native trace persistence/import without duplicates;
- real overlay touch/swipe behavior;
- OEM background restrictions;
- force-stop/restart recovery;
- network loss while operational;
- exact release APK on the target phone.

A passing repository or emulator gate does **not** substitute for Level C evidence.

Native fare/cancellation forms are also treated as uncommitted until the canonical PWA mutation is acknowledged; enqueueing a durable event is not itself a business commit.

## Failure rule

Any uncovered frozen requirement, competing authority, private mutation path, stale identity path, unverified restart boundary, or missing proof-level evidence keeps conformance open. The suite must fail rather than silently downgrade the requirement to documentation-only status.

## Evidence record

The release process must retain:

- commit SHA;
- CI run and job names;
- exact tested APK SHA-256 where Android is involved;
- emulator instrumentation output;
- PWA runtime smoke output;
- physical-device acceptance record for Level C requirements.

