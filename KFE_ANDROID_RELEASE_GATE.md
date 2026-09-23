# KFE Android Release Gate

**Status: FROZEN — mandatory rule**

This document is the permanent release rule for KFE Android overlay work. Any future agent, developer, or CI workflow working on the Android overlay MUST read and follow this document before declaring an APK or overlay fix complete.

## 1. Definition of DONE

A change is **NOT DONE** merely because:
- source/contract tests pass;
- PWA build passes;
- Android compilation passes;
- an APK artifact exists; or
- CI is green.

An Android overlay change is DONE only when the **exact APK produced from the exact tested commit** passes the Golden Ride Gate described below.

If the Android device/emulator gate has not passed, the change must be reported as **NOT DEVICE-VERIFIED**. Do not describe it as ready or fixed.

## 2. Golden Ride Gate

The tested APK MUST exercise the real Android flow end-to-end:

1. Online
2. Start shift
3. Going to pickup
4. Start ride
5. Background/minimize the app
6. Overlay is visible
7. Swipe END
8. Ride becomes COMPLETED
9. Fare entry appears
10. Enter fare
11. Press OK
12. Foreground/reopen the main app
13. Timeline shows the same completed ride and fare

The reverse path MUST also be tested:

1. Start ride in the main app
2. Background the app
3. End the ride from the overlay
4. Enter fare from the overlay
5. Confirm in the main app

## 3. Single-source invariants

The overlay is a UI/controller, NOT a second business system.

The following must remain true:

- Main app and overlay operate on the same canonical trip record.
- Ride completion has one authoritative business path.
- Fare persistence has one authoritative business path.
- Revenue has one authoritative source.
- Overlay revenue MUST mirror authoritative shift revenue.
- Overlay MUST NOT independently calculate a second fare/revenue total.
- Overlay MUST NOT create a second trip.
- Main-app-created entries must be visible to the overlay.
- Overlay-created entries must be visible in the main app through the same persisted record.

## 4. Duplicate/replay gate

The exact APK MUST be tested for process interruption/restart around pending actions.

At minimum:

- action is persisted as fallback;
- live action succeeds;
- pending fallback is cleared;
- app restart does not replay the action;
- no second trip completion is created;
- no second fare mutation is created;
- no duplicate audit/business mutation is created.

A pending action is a recovery mechanism, never a second execution path.

## 5. Bubble gate

The actual Android overlay window MUST be exercised, not merely source-inspected.

Verify:

- overlay appears;
- minimize creates the visible bubble;
- bubble remains visible;
- bubble can be dragged;
- edge docking works;
- tapping the bubble restores the overlay;
- restored overlay can perform the expected action;
- overlay disappears when there is no valid active state or overlay permission is unavailable.

## 6. APK identity rule

Every release candidate MUST identify:

- repository;
- commit SHA;
- CI run;
- APK artifact name;
- APK SHA-256.

The APK tested by the Android gate MUST be the same APK delivered as the release artifact.

Never rely on a generic "latest APK" label.

## 7. CI requirements

Android CI SHOULD contain both:

### Static gate
- foundation/contract tests;
- production PWA build;
- Capacitor sync;
- Android compilation;
- release/hardening contracts;
- runtime smoke tests;
- visual smoke tests.

### Device gate
An Android emulator/device test MUST execute the Golden Ride Gate and assert persisted state, parity, and duplicate/replay invariants.

If the environment cannot run the device gate, CI MUST explicitly report the device gate as unavailable rather than silently treating compilation/contracts as equivalent to device verification.

## 8. Failure policy

When any Golden Ride Gate assertion fails:

- do not call the APK fixed;
- do not ask the user to discover the failure manually;
- identify the failing stage;
- fix the implementation/test;
- rebuild from the corrected commit;
- rerun the complete gate;
- deliver only the APK that passed.

Do not patch only the visible symptom while leaving the end-to-end path unverified.

## 9. Regression rule

Any future change touching:
- KFE overlay;
- Android bridge;
- ride lifecycle;
- fare/revenue;
- trip persistence;
- pending actions;
- notification actions;
- bubble/minimize behavior;
- foreground/background lifecycle;
- APK workflow;

MUST rerun the complete Golden Ride Gate.

No exception because the code change "looks small."

## 10. Permanent instruction to future agents

Before making or declaring an Android overlay change complete:

**READ THIS FILE. FOLLOW THIS FILE. VERIFY THE EXACT APK.**

The user's acceptance criterion is the actual working KFE Android experience, not merely a green source/build pipeline.
